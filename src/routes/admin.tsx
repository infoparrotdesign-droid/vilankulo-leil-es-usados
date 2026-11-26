import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Clock3, LogOut, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { VILASHOP_ADMIN_EMAIL, isVilaShopAdminEmail } from "@/lib/vilashop-config";

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

type AdminMessageFlag = {
  id: string;
  message_id: string;
  conversation_id: string | null;
  flagged_by: string;
  category: string;
  message_content: string;
  details: string | null;
  review_status: string;
  email_status: string;
  created_at: string;
};

type AdminDatabase = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query builder is dynamic across admin-only relations.
  from: (table: string) => any;
  rpc: (
    functionName: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

const adminDatabase = supabase as unknown as AdminDatabase;

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Administração — VilaShop" },
      { name: "description", content: "Área reservada de moderação e confiança do VilaShop." },
      { property: "og:title", content: "Administração — VilaShop" },
      {
        property: "og:description",
        content: "Área reservada de moderação e confiança do VilaShop.",
      },
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- relation rows are selected dynamically by the admin queue.
  const [reports, setReports] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- relation rows are selected dynamically by the admin queue.
  const [sales, setSales] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- relation rows are selected dynamically by the admin queue.
  const [disputes, setDisputes] = useState<any[]>([]);
  const [messageFlags, setMessageFlags] = useState<AdminMessageFlag[]>([]);
  const [sellerPayoutDetails, setSellerPayoutDetails] = useState<Array<{ seller_id: string; display_name: string | null; emola_number: string; account_holder: string }>>([]);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});

  const loadQueue = useCallback(async () => {
    const [listingResult, reportResult, saleResult, disputeResult, messageFlagResult, payoutDetailsResult] =
      await Promise.all([
        adminDatabase
          .from("listings")
          .select(
            "id,title,description,category,item_condition,listing_type,price,status,created_at,seller_id",
          )
          .eq("status", "pending_review")
          .order("created_at", { ascending: true })
          .limit(50),
        adminDatabase
          .from("listing_reports")
          .select("id,listing_id,reporter_id,reason,details,status,created_at")
          .order("created_at", { ascending: true })
          .limit(50),
        adminDatabase.rpc("admin_list_marketplace_sales"),
        adminDatabase
          .from("sale_disputes")
          .select("id,sale_id,opened_by,reason,evidence_note,status,created_at")
          .order("created_at", { ascending: true })
          .limit(50),
        adminDatabase.rpc("admin_list_seller_payout_details"),
        adminDatabase
          .from("message_moderation_flags")
          .select(
            "id,message_id,conversation_id,flagged_by,category,message_content,details,review_status,email_status,created_at",
          )
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
    if (listingResult.error) toast.error("Não foi possível carregar a fila de anúncios.");
    if (reportResult.error || saleResult.error || disputeResult.error)
      toast.error("Algumas filas aguardam a aplicação da migration comunitária.");
    if (messageFlagResult.error)
      toast.error(
        "A fila de mensagens sinalizadas ficará disponível após a migration de moderação.",
      );
    setListings(listingResult.data ?? []);
    setReports(reportResult.data ?? []);
    setSales(saleResult.data ?? []);
    setDisputes(disputeResult.data ?? []);
    setMessageFlags(messageFlagResult.data ?? []);
    if (payoutDetailsResult.error) toast.error("Não foi possível carregar os dados privados de recebimento dos vendedores.");
    setSellerPayoutDetails((payoutDetailsResult.data ?? []) as Array<{ seller_id: string; display_name: string | null; emola_number: string; account_holder: string }>);
  }, []);

  const verifyAdmin = useCallback(async (): Promise<boolean> => {
    setChecking(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        setSignedInEmail(null);
        setIsAdmin(false);
        setListings([]);
        setReports([]);
        setSales([]);
        setDisputes([]);
        setMessageFlags([]);
        return false;
      }

      setSignedInEmail(userData.user.email ?? null);
      if (!isVilaShopAdminEmail(userData.user.email)) {
        setIsAdmin(false);
        setListings([]);
        setReports([]);
        setSales([]);
        setDisputes([]);
        setMessageFlags([]);
        return false;
      }

      const { data, error } = await adminDatabase.rpc("is_vilashop_admin");
      if (error || data !== true) {
        setIsAdmin(false);
        setListings([]);
        setReports([]);
        setSales([]);
        setDisputes([]);
        setMessageFlags([]);
        return false;
      }

      setIsAdmin(true);
      await loadQueue();
      return true;
    } catch (error) {
      console.error("Falha ao validar permissões administrativas.", error);
      setIsAdmin(false);
      setListings([]);
      setReports([]);
      setSales([]);
      setDisputes([]);
      setMessageFlags([]);
      return false;
    } finally {
      setChecking(false);
    }
  }, [loadQueue]);

  useEffect(() => {
    void verifyAdmin();
  }, [verifyAdmin]);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isVilaShopAdminEmail(email)) {
      toast.error(`A administração está reservada a ${VILASHOP_ADMIN_EMAIL}.`);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível entrar. Confirme o email e a palavra-passe.");
      return;
    }
    const authorised = await verifyAdmin();
    if (authorised) {
      toast.success("Acesso administrativo confirmado.");
    } else {
      toast.error(
        "A sessão foi iniciada, mas esta conta ainda não tem autorização administrativa. Confirme o email e a atribuição do perfil de administrador.",
      );
    }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Não foi possível terminar a sessão.");
      return;
    }
    setSignedInEmail(null);
    setIsAdmin(false);
    setListings([]);
    setReports([]);
    setSales([]);
    setDisputes([]);
    setMessageFlags([]);
    toast.success("Sessão terminada.");
  }

  async function runAdminAction(name: string, args: Record<string, unknown>, success: string) {
    setBusy(true);
    const { error } = await adminDatabase.rpc(name, args);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success(success);
      await loadQueue();
    }
  }

  async function reviewMessageFlag(
    flagId: string,
    reviewStatus: "under_review" | "resolved" | "dismissed",
  ) {
    setBusy(true);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setBusy(false);
      toast.error("A sessão administrativa expirou. Entre novamente.");
      return;
    }
    const { error } = await adminDatabase
      .from("message_moderation_flags")
      .update({
        review_status: reviewStatus,
        reviewed_at: new Date().toISOString(),
        reviewed_by: userData.user.id,
      })
      .eq("id", flagId);
    setBusy(false);
    if (error) {
      toast.error("Não foi possível actualizar a sinalização.");
      return;
    }
    toast.success("Estado da mensagem sinalizada actualizado.");
    await loadQueue();
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
      toast.success(
        "Anúncio aprovado. Será publicado quando terminar o período mínimo de observação.",
      );
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
          <Link to="/" className="text-sm font-semibold text-primary">
            VilaShop
          </Link>
          <div className="mt-6 flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
            <ShieldCheck className="size-6" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Área reservada</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Entre com a conta administrativa autorizada para gerir a plataforma. Acesso reservado a{" "}
            {VILASHOP_ADMIN_EMAIL}.
          </p>
          {signedInEmail && (
            <p className="mt-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              A conta {signedInEmail} não tem permissões de administração.
            </p>
          )}
          <form className="mt-6 grid gap-4" onSubmit={submitLogin}>
            <div className="grid gap-2">
              <Label htmlFor="admin-email">Email administrativo</Label>
              <Input
                id="admin-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-password">Palavra-passe</Label>
              <Input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "A entrar…" : "Entrar na administração"}
            </Button>
          </form>
          <Link
            to="/"
            className="mt-5 inline-flex text-sm text-muted-foreground hover:text-foreground"
          >
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
            <Link to="/" className="text-sm font-bold text-primary">
              VilaShop
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Painel de moderação
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Fila de anúncios em período de observação.
            </p>
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
              <p className="text-sm text-muted-foreground">
                Aprovar não encurta o período mínimo de observação.
              </p>
            </div>
            <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
              {listings.length} pendentes
            </span>
          </div>

          {listings.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card px-5 py-14 text-center">
              <CheckCircle2 className="mx-auto size-8 text-emerald-600" />
              <h3 className="mt-3 font-semibold">A fila está limpa</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Não existem anúncios à espera de revisão neste momento.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {listings.map((listing) => (
                <article key={listing.id} className="rounded-xl border bg-card p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground">
                          {listing.category}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock3 className="size-3" />{" "}
                          {new Date(listing.created_at).toLocaleString("pt-MZ")}
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold">{listing.title}</h3>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                        {listing.description}
                      </p>
                    </div>
                    <p className="shrink-0 text-lg font-bold text-primary">
                      {new Intl.NumberFormat("pt-MZ", {
                        style: "currency",
                        currency: "MZN",
                        maximumFractionDigits: 0,
                      }).format(listing.price)}
                    </p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                    <span>Condição: {listing.item_condition}</span>
                    <span>
                      Tipo: {listing.listing_type === "auction" ? "Leilão" : "Venda directa"}
                    </span>
                    <span>Referência: {listing.id.slice(0, 8)}</span>
                  </div>
                  <div className="mt-4 grid gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor={`reason-${listing.id}`}>
                        Motivo (obrigatório para rejeitar ou suspender)
                      </Label>
                      <Textarea
                        id={`reason-${listing.id}`}
                        rows={2}
                        value={reasons[listing.id] ?? ""}
                        onChange={(event) =>
                          setReasons((current) => ({
                            ...current,
                            [listing.id]: event.target.value,
                          }))
                        }
                        placeholder="Registe o motivo da decisão, se aplicável."
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={() => void moderate(listing, "approve")}
                      >
                        <CheckCircle2 className="mr-2 size-4" /> Aprovar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void moderate(listing, "reject")}
                      >
                        <XCircle className="mr-2 size-4" /> Rejeitar
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => void moderate(listing, "suspend")}
                      >
                        Suspender
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Pagamentos, entregas e liquidações</h2>
          <div className="grid gap-3">
            {sales.length === 0 ? (
              <p className="rounded-xl border border-dashed bg-card p-5 text-sm text-muted-foreground">
                Ainda não existem vendas registadas.
              </p>
            ) : (
              sales.map((sale) => (
                <article key={sale.id} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>Venda {sale.id.slice(0, 8)}</strong>
                    <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold">
                      {sale.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Artigo {sale.listing_id.slice(0, 8)} · Comprador {sale.buyer_id.slice(0, 8)} ·
                    Vendedor {sale.seller_id.slice(0, 8)}
                  </p>
                  {(() => {
                    const payout = sellerPayoutDetails.find((item) => item.seller_id === sale.seller_id);
                    return (
                      <div className="mt-3 rounded-lg border bg-muted/40 p-3 text-sm">
                        <p className="font-semibold">Dados privados para pagar o vendedor via e-Mola</p>
                        {payout ? (
                          <>
                            <p className="mt-1">Titular: <strong>{payout.account_holder}</strong></p>
                            <p>Número e-Mola: <strong>{payout.emola_number}</strong></p>
                          </>
                        ) : (
                          <p className="mt-1 text-muted-foreground">O vendedor ainda não registou os seus dados e-Mola.</p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">Conteúdo da transferência: VILASHOP</p>
                      </div>
                    );
                  })()}
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <p>
                      Valor do artigo:{" "}
                      <strong>{Number(sale.agreed_price).toLocaleString("pt-MZ")} MT</strong>
                    </p>
                    <p>
                      Taxa retida (10%):{" "}
                      <strong>{Number(sale.commission_amount).toLocaleString("pt-MZ")} MT</strong>
                    </p>
                    <p>
                      Total pago pelo comprador:{" "}
                      <strong>{Number(sale.buyer_total_amount).toLocaleString("pt-MZ")} MT</strong>
                    </p>
                    <p>
                      Líquido do vendedor (90%):{" "}
                      <strong>{Number(sale.seller_net_amount).toLocaleString("pt-MZ")} MT</strong>
                    </p>
                  </div>
                  {sale.payment_reference && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Referência: {sale.payment_reference}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {sale.status === "payment_reported" && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void runAdminAction(
                            "admin_verify_marketplace_payment",
                            { _sale_id: sale.id },
                            "Pagamento confirmado manualmente.",
                          )
                        }
                      >
                        Confirmar pagamento
                      </Button>
                    )}
                    {sale.status === "buyer_confirmed" && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void runAdminAction(
                            "admin_confirm_sale_delivery",
                            { _sale_id: sale.id },
                            "Entrega validada; prazo de liquidação iniciado.",
                          )
                        }
                      >
                        Validar entrega
                      </Button>
                    )}
                    {sale.status === "delivery_confirmed" && (
                      <div className="flex flex-wrap gap-2">
                        <Input
                          className="max-w-xs"
                          value={adminNotes["payout-" + sale.id] ?? ""}
                          onChange={(event) =>
                            setAdminNotes((current) => ({
                              ...current,
                              ["payout-" + sale.id]: event.target.value,
                            }))
                          }
                          placeholder="Referência da transferência e-Mola"
                        />
                        <Button
                          size="sm"
                          disabled={busy || !(adminNotes["payout-" + sale.id] ?? "").trim()}
                          onClick={() =>
                            void runAdminAction(
                              "admin_record_seller_payout",
                              {
                                _sale_id: sale.id,
                                _payout_reference: adminNotes["payout-" + sale.id],
                              },
                              "Liquidação ao vendedor registada.",
                            )
                          }
                        >
                          Registar pagamento ao vendedor
                        </Button>
                      </div>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Reclamações de transacções</h2>
          <div className="grid gap-3">
            {disputes.length === 0 ? (
              <p className="rounded-xl border border-dashed bg-card p-5 text-sm text-muted-foreground">
                Não existem reclamações registadas.
              </p>
            ) : (
              disputes.map((item) => (
                <article key={item.id} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap justify-between gap-2">
                    <strong>Reclamação {item.id.slice(0, 8)}</strong>
                    <span className="text-xs text-muted-foreground">{item.status}</span>
                  </div>
                  <p className="mt-2 text-sm">{item.reason}</p>
                  {item.evidence_note && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Provas: {item.evidence_note}
                    </p>
                  )}
                  <Input
                    className="mt-3"
                    value={adminNotes[item.id] ?? ""}
                    onChange={(event) =>
                      setAdminNotes((current) => ({ ...current, [item.id]: event.target.value }))
                    }
                    placeholder="Fundamente a decisão (mínimo 10 caracteres)"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={busy || (adminNotes[item.id] ?? "").trim().length < 10}
                      onClick={() =>
                        void runAdminAction(
                          "admin_resolve_sale_dispute",
                          {
                            _dispute_id: item.id,
                            _resolution: "resolved_seller",
                            _note: adminNotes[item.id],
                          },
                          "Reclamação resolvida a favor do vendedor.",
                        )
                      }
                    >
                      A favor do vendedor
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy || (adminNotes[item.id] ?? "").trim().length < 10}
                      onClick={() =>
                        void runAdminAction(
                          "admin_resolve_sale_dispute",
                          {
                            _dispute_id: item.id,
                            _resolution: "resolved_buyer",
                            _note: adminNotes[item.id],
                          },
                          "Reclamação resolvida a favor do comprador.",
                        )
                      }
                    >
                      A favor do comprador
                    </Button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Mensagens sinalizadas</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Conteúdo privado disponível apenas para a administração. Reveja cada caso e registe o
            estado.
          </p>
          <div className="grid gap-3">
            {messageFlags.length === 0 ? (
              <p className="rounded-xl border border-dashed bg-card p-5 text-sm text-muted-foreground">
                Não existem mensagens sinalizadas ou a migration de moderação ainda não foi
                aplicada.
              </p>
            ) : (
              messageFlags.map((flag) => (
                <article key={flag.id} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>
                      {(
                        {
                          personal_contact: "Contactos pessoais",
                          offensive_language: "Linguagem ofensiva",
                          threat: "Ameaça",
                          discrimination: "Discriminação",
                          other: "Outro conteúdo",
                        } as Record<string, string>
                      )[flag.category] ?? "Mensagem sinalizada"}
                    </strong>
                    <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold">
                      {(
                        {
                          open: "Pendente",
                          under_review: "Em análise",
                          resolved: "Resolvida",
                          dismissed: "Arquivada",
                        } as Record<string, string>
                      )[flag.review_status] ?? "Estado desconhecido"}
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">
                    {flag.message_content}
                  </p>
                  {flag.details && (
                    <p className="mt-2 text-sm text-muted-foreground">Observação: {flag.details}</p>
                  )}
                  <div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                    <span>Referência: {flag.message_id}</span>
                    <span>Utilizador que sinalizou: {flag.flagged_by.slice(0, 8)}</span>
                    <span>
                      Notificação Gmail:{" "}
                      {(
                        {
                          pending: "Pendente",
                          sending: "A enviar",
                          sent: "Enviada",
                          failed: "Falhou",
                        } as Record<string, string>
                      )[flag.email_status] ?? "Desconhecido"}
                    </span>
                    <span>Data: {new Date(flag.created_at).toLocaleString("pt-MZ")}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || flag.review_status === "under_review"}
                      onClick={() => void reviewMessageFlag(flag.id, "under_review")}
                    >
                      Em análise
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy || flag.review_status === "resolved"}
                      onClick={() => void reviewMessageFlag(flag.id, "resolved")}
                    >
                      Resolver
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy || flag.review_status === "dismissed"}
                      onClick={() => void reviewMessageFlag(flag.id, "dismissed")}
                    >
                      Arquivar
                    </Button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Denúncias de anúncios</h2>
          <div className="grid gap-3">
            {reports.length === 0 ? (
              <p className="rounded-xl border border-dashed bg-card p-5 text-sm text-muted-foreground">
                Não existem denúncias registadas.
              </p>
            ) : (
              reports.map((item) => (
                <article key={item.id} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap justify-between gap-2">
                    <strong>
                      Denúncia {item.id.slice(0, 8)} · {item.reason}
                    </strong>
                    <span className="text-xs text-muted-foreground">{item.status}</span>
                  </div>
                  <p className="mt-2 text-sm">{item.details}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Anúncio {item.listing_id.slice(0, 8)} · Denunciante{" "}
                    {item.reporter_id.slice(0, 8)}
                  </p>
                  <Input
                    className="mt-3"
                    value={adminNotes["report-" + item.id] ?? ""}
                    onChange={(event) =>
                      setAdminNotes((current) => ({
                        ...current,
                        ["report-" + item.id]: event.target.value,
                      }))
                    }
                    placeholder="Nota administrativa opcional"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void runAdminAction(
                          "admin_review_listing_report",
                          {
                            _report_id: item.id,
                            _decision: "under_review",
                            _note: adminNotes["report-" + item.id] ?? "",
                          },
                          "Denúncia colocada em análise.",
                        )
                      }
                    >
                      Em análise
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void runAdminAction(
                          "admin_review_listing_report",
                          {
                            _report_id: item.id,
                            _decision: "resolved",
                            _note: adminNotes["report-" + item.id] ?? "",
                          },
                          "Denúncia resolvida.",
                        )
                      }
                    >
                      Resolver
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() =>
                        void runAdminAction(
                          "admin_review_listing_report",
                          {
                            _report_id: item.id,
                            _decision: "dismissed",
                            _note: adminNotes["report-" + item.id] ?? "",
                          },
                          "Denúncia arquivada.",
                        )
                      }
                    >
                      Arquivar
                    </Button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
