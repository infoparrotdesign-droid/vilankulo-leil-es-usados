import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CATEGORY_LABELS: Record<string, string> = {
  personal_contact: "Partilha de contactos pessoais",
  offensive_language: "Linguagem ofensiva",
  threat: "Ameaça",
  discrimination: "Discriminação",
  other: "Outro conteúdo sinalizado",
};
const ALLOWED_CATEGORIES = new Set(Object.keys(CATEGORY_LABELS));

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS_HEADERS });
}

function getSecretKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch {
      // Fail closed below.
    }
  }
  throw new Error("Supabase server key is not configured");
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("Authorization") ?? "";
  const jwt = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!jwt) return json({ error: "Authentication required" }, 401);

  let payload: {
    messageId?: unknown;
    conversationId?: unknown;
    category?: unknown;
    messageContent?: unknown;
    details?: unknown;
  };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const messageId = typeof payload.messageId === "string" ? payload.messageId.trim() : "";
  const conversationId = typeof payload.conversationId === "string" ? payload.conversationId.trim() : null;
  const category = typeof payload.category === "string" ? payload.category : "";
  const messageContent = typeof payload.messageContent === "string" ? payload.messageContent.trim() : "";
  const details = typeof payload.details === "string" ? payload.details.trim() : null;

  if (!messageId || messageId.length > 128 || (conversationId && conversationId.length > 128)) {
    return json({ error: "Invalid message reference" }, 400);
  }
  if (!ALLOWED_CATEGORIES.has(category)) return json({ error: "Invalid moderation category" }, 400);
  if (!messageContent || messageContent.length > 5000 || (details && details.length > 1000)) {
    return json({ error: "Invalid message content or details" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) return json({ error: "Service is not configured" }, 503);

  try {
    const admin = createClient(supabaseUrl, getSecretKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !userData.user) return json({ error: "Invalid session" }, 401);

    // Reuse an existing flag and claim its email delivery atomically.
    // Only one concurrent request can move pending/failed to sending.
    const { data: priorFlag, error: priorFlagError } = await admin
      .from("message_moderation_flags")
      .select("id, email_status, created_at, email_started_at")
      .eq("message_id", messageId)
      .eq("category", category)
      .eq("flagged_by", userData.user.id)
      .maybeSingle();
    if (priorFlagError) throw priorFlagError;
    if (priorFlag?.email_status === "sent") {
      return json({ ok: true, flagId: priorFlag.id, duplicate: true, notificationSent: true });
    }
    let staleSendingAt: string | null = null;
    if (priorFlag?.email_status === "sending") {
      const startedAt = priorFlag.email_started_at
        ? Date.parse(priorFlag.email_started_at)
        : Number.NaN;
      if (!Number.isFinite(startedAt) || startedAt > Date.now() - 5 * 60 * 1000) {
        return json(
          { ok: true, flagId: priorFlag.id, duplicate: true, notificationSent: false },
          202,
        );
      }
      staleSendingAt = priorFlag.email_started_at;
    }

    let storedFlag: { id: string; created_at: string };
    if (priorFlag) {
      storedFlag = { id: priorFlag.id, created_at: priorFlag.created_at };
    } else {
      const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count, error: countError } = await admin
        .from("message_moderation_flags")
        .select("id", { count: "exact", head: true })
        .eq("flagged_by", userData.user.id)
        .gte("created_at", windowStart);
      if (countError) throw countError;
      if ((count ?? 0) >= 15) {
        return json({ error: "Limite de sinalizações atingido. Tente novamente mais tarde." }, 429);
      }

      const { data: flag, error: insertError } = await admin
        .from("message_moderation_flags")
        .insert({
          message_id: messageId,
          conversation_id: conversationId || null,
          flagged_by: userData.user.id,
          category,
          message_content: messageContent,
          details: details || null,
        })
        .select("id, created_at")
        .single();

      if (insertError?.code === "23505") {
        const { data: existing, error: existingError } = await admin
          .from("message_moderation_flags")
          .select("id, created_at, email_status, email_started_at")
          .eq("message_id", messageId)
          .eq("category", category)
          .eq("flagged_by", userData.user.id)
          .single();
        if (existingError || !existing) {
          throw existingError ?? new Error("Could not reload existing moderation flag");
        }
        if (existing.email_status === "sent") {
          return json({ ok: true, flagId: existing.id, duplicate: true, notificationSent: true });
        }
        if (existing.email_status === "sending") {
          const startedAt = existing.email_started_at
            ? Date.parse(existing.email_started_at)
            : Number.NaN;
          if (!Number.isFinite(startedAt) || startedAt > Date.now() - 5 * 60 * 1000) {
            return json(
              { ok: true, flagId: existing.id, duplicate: true, notificationSent: false },
              202,
            );
          }
          staleSendingAt = existing.email_started_at;
        }
        storedFlag = { id: existing.id, created_at: existing.created_at };
      } else if (insertError || !flag) {
        throw insertError ?? new Error("Could not store moderation flag");
      } else {
        storedFlag = flag;
      }
    }

    let claimQuery = admin
      .from("message_moderation_flags")
      .update({
        email_status: "sending",
        email_started_at: new Date().toISOString(),
        email_error: null,
      })
      .eq("id", storedFlag.id);
    claimQuery = staleSendingAt
      ? claimQuery.eq("email_status", "sending").eq("email_started_at", staleSendingAt)
      : claimQuery.in("email_status", ["pending", "failed"]);
    const { data: claimedFlag, error: claimError } = await claimQuery
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimedFlag) {
      const { data: latestFlag, error: latestError } = await admin
        .from("message_moderation_flags")
        .select("email_status")
        .eq("id", storedFlag.id)
        .single();
      if (latestError) throw latestError;
      return json({
        ok: true,
        flagId: storedFlag.id,
        duplicate: true,
        notificationSent: latestFlag.email_status === "sent",
      }, 202);
    }
    const mailerToken = Deno.env.get("VILASHOP_MAILER_TOKEN");
    if (!mailerToken) {
      await admin.from("message_moderation_flags").update({
        email_status: "failed",
        email_error: "Mailer token is not configured",
      }).eq("id", storedFlag.id);
      return json({ ok: true, flagId: storedFlag.id, notificationSent: false }, 202);
    }

    const excerpt = messageContent.length > 700 ? messageContent.slice(0, 697) + "..." : messageContent;
    const emailMessage = [
      "Uma mensagem foi sinalizada na plataforma VilaShop.",
      "",
      "Categoria: " + CATEGORY_LABELS[category],
      "Referência da mensagem: " + messageId,
      conversationId ? "Conversa: " + conversationId : "",
      "Utilizador que sinalizou: " + userData.user.id,
      "",
      "Conteúdo sinalizado:",
      excerpt,
      details ? "\nObservação de quem sinalizou:\n" + details : "",
      "",
      "Aceda ao painel administrativo para analisar o caso.",
    ].filter(Boolean).join("\n");

    const mailResponse = await fetch(supabaseUrl + "/functions/v1/send-admin-notification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vilashop-mailer-token": mailerToken,
      },
      body: JSON.stringify({
        title: CATEGORY_LABELS[category],
        event: "Mensagem sinalizada",
        message: emailMessage,
        reference: storedFlag.id,
      }),
    });

    if (!mailResponse.ok) {
      const errorText = await mailResponse.text();
      await admin.from("message_moderation_flags").update({
        email_status: "failed",
        email_error: "Mailer returned HTTP " + mailResponse.status + ": " + errorText.slice(0, 300),
      }).eq("id", storedFlag.id);
      return json({ ok: true, flagId: storedFlag.id, notificationSent: false }, 202);
    }

    const mailResult = await mailResponse.json();
    await admin.from("message_moderation_flags").update({
      email_status: "sent",
      email_message_id: typeof mailResult.messageId === "string" ? mailResult.messageId : null,
      email_error: null,
    }).eq("id", storedFlag.id);

    return json({ ok: true, flagId: storedFlag.id, notificationSent: true });
  } catch (error) {
    console.error("Message moderation notification failed", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "Could not register message flag" }, 500);
  }
});
