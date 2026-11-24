import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type AdminListing = {
  id: string;
  title: string;
  description: string;
  status: string;
  price: number;
  listing_type: string;
  submitted_at: string | null;
  publish_after: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  photo_path: string | null;
  imageUrl: string | null;
  seller_id: string;
};

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Administração — VilaShop" }] }),
  component: AdminPage,
});

function AdminPage() {
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [rows, setRows] = useState<AdminListing[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    const { data, error } = await supabase
      .from("listings")
      .select("id, title, description, status, price, listing_type, submitted_at, publish_after, review_note, reviewed_at, photo_path, seller_id")
      .in("status", ["pending_review", "active"])
      .order("submitted_at", { ascending: true })
      .limit(100);
    if (error) {
      toast.error("Não foi possível carregar a fila de moderação.");
      return;
    }
    const listingRows = data ?? [];
    const paths = listingRows.flatMap((row) => row.photo_path ? [row.photo_path] : []);
    const signed = paths.length
      ? await supabase.storage.from("boladas-media").createSignedUrls(paths, 3600)
      : { data: [] };
    const urls = new Map(paths.map((path, index) => [path, signed.data?.[index]?.signedUrl ?? null]));
    setRows(listingRows.map((row) => ({ ...row, imageUrl: row.photo_path ? urls.get(row.photo_path) ?? null : null })));
  }, []);

  useEffect(() => {
    let current = true;
    void (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        if (current) { setAuthorized(false); setChecking(false); }
        return;
      }
      const { data, error } = await supabase.rpc("is_vilashop_admin");
      if (!current) return;
      if (error || !data) {
        setAuthorized(false);
        setChecking(false);
        return;
      }
      setAuthorized(true);
      await loadQueue();
      if (current) setChecking(false);
    })();
    return () => { current = false; };
  }, [loadQueue]);

  async function moderate(row: AdminListing, decision: "approve" | "reject" | "suspend") {
    const reason = reasons[row.id]?.trim() ?? "";
    if (decision !== "approve" && !reason) {
      toast.error("Indique o motivo antes de rejeitar ou suspender.");
      return;
    }
    setBusyId(row.id);
    const { error } = await supabase.rpc("admin_moderate_listing", {
      _listing_id: row.id,
      _decision: decision,
      _reason: reason || null,
    });
    setBusyId(null);
    if (error) {
      toast.error(error.message || "Não foi possível guardar a decisão.");
      return;
    }
    toast.success(decision === "approve"
      ? "Anúncio considerado apto. Será publicado apenas depois das 6 horas."
      : decision === "reject" ? "Anúncio rejeitado." : "Anúncio suspenso.");
    await loadQueue();
  }

  if (checking) {
    return <main className="mx-auto max-w-4xl p-6"><p>A verificar permissões administrativas…</p></main>;
  }
  if (!authorized) {
    return <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">Acesso reservado</h1>
      <p className="mt-2 text-muted-foreground">Esta conta não tem permissões de administração no VilaShop.</p>
      <Link to="/" className="mt-5 inline-flex rounded-lg border px-4 py-2">Voltar ao VilaShop</Link>
    </main>;
  }

  return <main className="mx-auto min-h-screen max-w-5xl space-y-6 p-5 md:p-8">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-muted-foreground">VilaShop · Painel interno</p>
        <h1 className="text-3xl font-semibold">Moderação de anúncios</h1>
        <p className="mt-1 text-sm text-muted-foreground">Os anúncios só ficam públicos depois de cumpridas as 6 horas mínimas.</p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => void loadQueue()} className="rounded-lg border px-4 py-2 text-sm">Actualizar</button>
        <Link to="/" className="rounded-lg border px-4 py-2 text-sm">Ver VilaShop</Link>
      </div>
    </header>
    <section className="space-y-4">
      {rows.length === 0 ? <div className="rounded-xl border p-6 text-sm text-muted-foreground">Não há anúncios pendentes nem anúncios activos para moderação.</div> : rows.map((row) => (
        <article key={row.id} className="space-y-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-start gap-4">
            {row.imageUrl && <img src={row.imageUrl} alt={row.title} className="h-28 w-28 rounded-lg border object-cover" />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-lg font-semibold">{row.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{row.description}</p>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{row.status === "pending_review" ? (row.reviewed_at ? "Apto · aguarda as 6 horas" : "Em observação") : "Publicado"}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Vendedor: {row.seller_id.slice(0, 8)} · {row.listing_type === "auction" ? "Leilão" : "Venda directa"} · {new Intl.NumberFormat("pt-MZ").format(row.price)} MT</p>
            </div>
          </div>
          {row.submitted_at && <p className="text-xs text-muted-foreground">Enviado: {new Date(row.submitted_at).toLocaleString("pt-MZ")} {row.publish_after ? "· Publicação prevista: " + new Date(row.publish_after).toLocaleString("pt-MZ") : ""}</p>}
          <textarea
            value={reasons[row.id] ?? ""}
            onChange={(event) => setReasons((current) => ({ ...current, [row.id]: event.target.value }))}
            placeholder="Motivo obrigatório para rejeitar ou suspender (visível ao vendedor)"
            rows={2}
            className="w-full rounded-lg border bg-background p-3 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            {row.status === "pending_review" && <button type="button" disabled={busyId === row.id} onClick={() => void moderate(row, "approve")} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">Marcar apto</button>}
            {row.status === "pending_review" && <button type="button" disabled={busyId === row.id} onClick={() => void moderate(row, "reject")} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Rejeitar</button>}
            <button type="button" disabled={busyId === row.id} onClick={() => void moderate(row, "suspend")} className="rounded-lg border border-destructive px-4 py-2 text-sm text-destructive disabled:opacity-50">Suspender</button>
          </div>
          {row.review_note && <p className="text-sm text-destructive">Última nota: {row.review_note}</p>}
        </article>
      ))}
    </section>
  </main>;
}
