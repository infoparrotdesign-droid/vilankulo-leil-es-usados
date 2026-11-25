const RECIPIENTS = [
  "info.parrotdesign@gmail.com",
  "adminvilashop@gmail.com",
] as const;
const SENDER = "info.parrotdesign@gmail.com";

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function utf8Base64Url(value: string): string {
  return base64Url(new TextEncoder().encode(value));
}

function encodeHeader(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return "=?UTF-8?B?" + btoa(binary) + "?=";
}

async function getGoogleAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GMAIL_CLIENT_ID");
  const clientSecret = Deno.env.get("GMAIL_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GMAIL_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Gmail OAuth is not configured");

  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json();
  if (!response.ok || typeof data.access_token !== "string") {
    console.error("Gmail OAuth token exchange failed", { status: response.status, error: data.error });
    throw new Error("Could not authenticate with Gmail");
  }
  return data.access_token;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  const expectedToken = Deno.env.get("VILASHOP_MAILER_TOKEN") ?? "";
  const suppliedToken = request.headers.get("x-vilashop-mailer-token") ?? "";
  if (!expectedToken || !constantTimeEqual(suppliedToken, expectedToken)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { title?: unknown; message?: unknown; event?: unknown; reference?: unknown };
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Response.json({ error: "Invalid notification payload" }, { status: 400 });
    }
    payload = parsed as typeof payload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  const event = typeof payload.event === "string" ? payload.event.trim() : "Alerta da plataforma";
  const reference = typeof payload.reference === "string" ? payload.reference.trim() : "";
  if (!title || !message || title.length > 160 || message.length > 6000 || event.length > 100 || reference.length > 160) {
    return Response.json({ error: "Invalid notification payload" }, { status: 400 });
  }
  if (/[\r\n]/.test(title)) return Response.json({ error: "Invalid title" }, { status: 400 });

  try {
    const accessToken = await getGoogleAccessToken();
    const text = [
      "VilaShop — Notificação administrativa",
      "",
      "Tipo: " + event,
      "Assunto: " + title,
      "",
      message,
      reference ? "\nReferência: " + reference : "",
      "",
      "Data: " + new Date().toISOString(),
      "\nEsta mensagem foi enviada automaticamente. Não responda a este email.",
    ].filter(Boolean).join("\n");
    const bodyBytes = new TextEncoder().encode(text);
    let bodyBinary = "";
    for (const byte of bodyBytes) bodyBinary += String.fromCharCode(byte);
    const encodedBody = btoa(bodyBinary).replace(/.{1,76}/g, "$&\r\n");

    const mime = [
      "From: VilaShop <" + SENDER + ">",
      "To: " + RECIPIENTS.join(", "),
      "Subject: " + encodeHeader("VilaShop | " + title),
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      encodedBody,
    ].join("\r\n");

    const sent = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: utf8Base64Url(mime) }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!sent.ok) {
      const detail = await sent.text();
      console.error("Gmail send failed", { status: sent.status, detail: detail.slice(0, 500) });
      return Response.json({ error: "Gmail could not send the notification" }, { status: 502 });
    }
    const result = await sent.json();
    return Response.json({ ok: true, messageId: result.id, recipients: RECIPIENTS });
  } catch (error) {
    console.error("VilaShop mailer error", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "Email delivery is not configured or failed" }, { status: 503 });
  }
});
