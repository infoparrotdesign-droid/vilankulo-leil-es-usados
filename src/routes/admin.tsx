import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Clock3, LogOut, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

type AdminListing = {
  id: string;
  title: string;
  description: string;
  category: string;
  item_condition: string;
  listing_type: string;
  price: number;
  status: string;
  created_at: string;
  seller_id: string;
};

type AdminDatabase = {
  from: (table: string) => any;
  rpc: (functionName: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

const adminDatabase = supabase as unknown as AdminDatabase;

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Administração — VilaShop" },
      { name: "description", content: "Área reservada de moderação e confiança do VilaShop." },
      { property: "og:title", content: "Administração — VilaShop" },
      { property: "og:description", content: "Área reservada de moderação e confiança do VilaShop." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [listings, setListings] = useState<AdminListing[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [reports, setReports] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});

  const loadQueue = useCallback(async () => {
    const [listingResult, reportResult, saleResult, disputeResult] = await Promise.all([
      adminDatabase.from("listings").select("id,title,description,category,item_condition,listing_type,price,status,created_at,seller_id").eq("status","pending_review").order("created_at",{ascending:true}).limit(50),
      adminDatabase.from("listing_reports").select("id,listing_id,reporter_id,reason,details,status,created_at").order("created_at",{ascending:true}).limit(50),
      adminDatabase.from("marketplace_sales").select("id,listing_id,buyer_id,seller_id,agreed_price,commission_amount,seller_net_amount,status,payment_reference,created_at").order("created_at",{ascending:false}).limit(100),
      adminDatabase.from("sale_disputes").select("id,sale_id,opened_by,reason,evidence_note,status,created_at").order("created_at",{ascending:true}).limit(50),
    ]);
    if (listingResult.error) toast.error("Não foi possível carregar a fila de anúncios.");
    if (reportResult.error || saleResult.error || disputeResult.error) toast.error("Algumas filas aguardam a aplicação da migration comunitária.");
    setListings(listingResult.data ?? []);
    setReports(reportResult.data ?? []);
    setSales(saleResult.data ?? []);
    setDisputes(disputeResult.data ?? []);
  }, []);

  const verifyAdmin = useCallback(async () => {
    setChecking(true);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setSignedInEmail(null);
      setIsAdmin(false);
      setListings([]); setReports([]); setSales([]); setDisputes([]);
      setChecking(false);
      return;
    }

    setSignedInEmail(userData.user.email ?? null);
    const { data, error } = await adminDatabase.rpc("is_vilashop_admin");
    if (error || data !== true) {
      setIsAdmin(false);
      setListings([]);
      setChecking(false);
      return;
    }

    setIsAdmin(true);
    await loadQueue();
    setChecking(false);
  }, [loadQueue]);

  useEffect(() => {
    void verifyAdmin();
  }, [verifyAdmin]);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível entrar. Confirme o email e a palavra-passe.");
      return;
    }
    await verifyAdmin();
    toast.success("Sessão iniciada.");
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Não foi possível terminar a sessão.");
      return;
    }
    setSignedInEmail(null);
    setIsAdmin(false);
    setListings([]); setReports([]); setSales([]); setDisputes([]);
    toast.success("Sessão terminada.");
  }

  async function runAdminAction(name: string, args: Record<string, unknown>, success: string) {
    setBusy(true);
    const { error } = await adminDatabase.rpc(name, args);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success(success); await loadQueue(); }
  }

  async function moderate(listing: AdminListing, decision: "approve" | "reject" | "suspend") {
    const reason = reasons[listing.id]?.trim() ?? "";
    if (decision !== "approve" && !reason) {
      toast.error("Indique o motivo da rejeição ou suspensão.");
      return;
    }

    setBusy(true);
    const { error } = await adminDatabase.rpc("admin_moderate_listing", {
      _listing_id: listing.id,
      _decision: decision,
      _reason: reason || null,
    });
    setBusy(false);

    if (error) {
      toast.error(error.message || "Não foi possível guardar a decisão.");
      return;
    }

    if (decision === "approve") {
      toast.success("Anúncio aprovado. Será publicado quando terminar o período mínimo de observação.");
    } else if (decision === "reject") {
      toast.success("Anúncio rejeitado. O motivo ficou registado.");
    } else {
      toast.success("Anúncio suspenso. O motivo ficou registado.");
    }

    setReasons((current) => ({ ...current, [listing.id]: "" }));
    await loadQueue();
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="size-4 animate-spin" /> A verificar acesso administrativo…
        </p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-background px-4 py-10">
        <section className="mx-auto w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
          <Link to="/" className="text-sm font-semibold text-primary">VilaShop</Link>
          <div className="mt-6 flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
            <ShieldCheck className="size-6" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Área reservada</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Entre com a conta administrativa autorizada para gerir a moderação do VilaShop.
          </p>
          {signedInEmail && (
            <p className="mt-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              A conta {signedInEmail} não tem permissões de administração.
            </p>
          )}
          <form className="mt-6 grid gap-4" onSubmit={submitLogin}>
            <div className="grid gap-2">
              <Label htmlFor="admin-email">Email administrativo</Label>
              <Input id="admin-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-password">Palavra-passe</Label>
              <Input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "A entrar…" : "Entrar na administração"}
            </Button>
          </form>
          <Link to="/" className="mt-5 inline-flex text-sm text-muted-foreground hover:text-foreground">
            Voltar ao marketplace
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-6">
          <div>
            <Link to="/" className="text-sm font-bold text-primary">VilaShop</Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Painel de moderação</h1>
            <p className="mt-1 text-sm text-muted-foreground">Fila de anúncios em período de observação.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">{signedInEmail}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadQueue()}>
              <RefreshCw className="mr-2 size-4" /> Actualizar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut className="mr-2 size-4" /> Sair
            </Button>
          </div>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">A aguardar revisão</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{listings.length}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Período mínimo</p>
            <p className="mt-1 text-3xl font-semibold">6 horas</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Estado da sessão</p>
            <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <CheckCircle2 className="size-4" /> Administrador autenticado
            </p>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Anúncios por rever</h2>
              <p className="text-sm text-muted-foreground">Aprovar não encurta o período mínimo de observação.</p>
            </div>
            <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">{listings.length} pendentes</span>
          </div>

          {listings.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card px-5 py-14 text-center">
              <CheckCircle2 className="mx-auto size-8 text-emerald-600" />
              <h3 className="mt-3 font-semibold">A fila está limpa</h3>
              <p className="mt-1 text-sm text-muted-foreground">Não existem anúncios à espera de revisão neste momento.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {listings.map((listing) => (
                <article key={listing.id} className="rounded-xl border bg-card p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground">{listing.category}</span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock3 className="size-3" /> {new Date(listing.created_at).toLocaleString("pt-MZ")}
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold">{listing.title}</h3>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{listing.description}</p>
                    </div>
                    <p className="shrink-0 text-lg font-bold text-primary">
                      {new Intl.NumberFormat("pt-MZ", { style: "currency", currency: "MZN", maximumFractionDigits: 0 }).format(listing.price)}
                    </p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                    <span>Condição: {listing.item_condition}</span>
                    <span>Tipo: {listing.listing_type === "auction" ? "Leilão" : "Venda directa"}</span>
                    <span>Referência: {listing.id.slice(0, 8)}</span>
                  </div>
                  <div className="mt-4 grid gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor={`reason-${listing.id}`}>Motivo (obrigatório para rejeitar ou suspender)</Label>
                      <Textarea
                        id={`reason-${listing.id}`}
                        rows={2}
                        value={reasons[listing.id] ?? ""}
                        onChange={(event) => setReasons((current) => ({ ...current, [listing.id]: event.target.value }))}
                        placeholder="Registe o motivo da decisão, se aplicável."
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" disabled={busy} onClick={() => void moderate(listing, "approve")}>
                        <CheckCircle2 className="mr-2 size-4" /> Aprovar
                      </Button>
                      <Button type="button" variant="outline" disabled={busy} onClick={() => void moderate(listing, "reject")}>
                        <XCircle className="mr-2 size-4" /> Rejeitar
                      </Button>
                      <Button type="button" variant="destructive" disabled={busy} onClick={() => void moderate(listing, "suspend")}>
                        Suspender
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
