import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Check, Heart, MessageCircle, RefreshCw, Store, Tag, Truck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { containsExternalContact, CONTACT_SHARING_ERROR } from "@/lib/message-safety";

type ApiError = { message: string };
type ApiResult<T> = { data: T | null; error: ApiError | null };
type DataApi = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- account queries target multiple relations added by migrations.
  from: (table: string) => any;
  rpc: (name: string, args?: Record<string, unknown>) => Promise<ApiResult<unknown>>;
};

type Notice = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
};
type Favorite = {
  id: string;
  listing_id: string;
  created_at: string;
  listings: { title: string; price: number; status: string } | null;
};
type Follow = { id: string; seller_id: string; created_at: string };
type Offer = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  counter_amount: number | null;
  status: string;
  created_at: string;
};
type Sale = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  agreed_price: number;
  status: string;
  delivery_method: string;
  buyer_confirmation_deadline: string | null;
  created_at: string;
};

const db = supabase as unknown as DataApi;

export const Route = createFileRoute("/conta")({
  head: () => ({
    meta: [
      { title: "A minha comunidade — VilaShop" },
      {
        name: "description",
        content:
          "Acompanhe favoritos, lojas seguidas, propostas, notificações e compras no VilaShop.",
      },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [follows, setFollows] = useState<Follow[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  // Commission breakdown is fetched only for the authenticated seller, never for buyers.
  const [sellerFinancials, setSellerFinancials] = useState<
    Record<
      string,
      {
        commission_rate: number;
        commission_amount: number;
        buyer_total_amount: number;
        seller_net_amount: number;
      }
    >
  >({});
  const [counterValues, setCounterValues] = useState<Record<string, string>>({});
  const [disputes, setDisputes] = useState<Record<string, { reason: string; evidence: string }>>(
    {},
  );

  const load = useCallback(async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const id = auth.user?.id ?? null;
    setUserId(id);
    if (!id) {
      setNotices([]);
      setFavorites([]);
      setFollows([]);
      setOffers([]);
      setSales([]);
      setLoading(false);
      return;
    }

    const [
      noticeResult,
      favoriteResult,
      followResult,
      offerResult,
      saleResult,
      sellerFinanceResult,
    ] = await Promise.all([
      db
        .from("notifications")
        .select("id,title,body,created_at,read_at")
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("listing_favorites")
        .select("id,listing_id,created_at,listings(title,price,status)")
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("seller_follows")
        .select("id,seller_id,created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("listing_offers")
        .select("id,listing_id,buyer_id,seller_id,amount,counter_amount,status,created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("marketplace_sales")
        .select(
          "id,listing_id,buyer_id,seller_id,agreed_price,status,delivery_method,buyer_confirmation_deadline,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(100),
      db.rpc("get_my_seller_sale_financials"),
    ]);

    if (noticeResult.error)
      toast.error(
        "Não foi possível carregar as notificações. Confirme se as migrations da comunidade já foram aplicadas.",
      );
    if (favoriteResult.error || followResult.error || offerResult.error || saleResult.error) {
      toast.error("Algumas áreas ainda aguardam a activação das novas migrations no Supabase.");
    }
    setNotices((noticeResult.data ?? []) as Notice[]);
    setFavorites((favoriteResult.data ?? []) as Favorite[]);
    setFollows((followResult.data ?? []) as Follow[]);
    setOffers((offerResult.data ?? []) as Offer[]);
    setSales((saleResult.data ?? []) as Sale[]);
    if (sellerFinanceResult.error) {
      toast.error("Não foi possível carregar os detalhes financeiros das suas vendas.");
      setSellerFinancials({});
    } else {
      setSellerFinancials(
        Object.fromEntries(
          (
            (sellerFinanceResult.data ?? []) as Array<{
              sale_id: string;
              commission_rate: number;
              commission_amount: number;
              buyer_total_amount: number;
              seller_net_amount: number;
            }>
          ).map(({ sale_id, ...financial }) => [sale_id, financial]),
        ),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(id: string) {
    const { error } = await db
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error("Não foi possível actualizar a notificação.");
    else
      setNotices((items) =>
        items.map((item) =>
          item.id === id ? { ...item, read_at: new Date().toISOString() } : item,
        ),
      );
  }

  async function removeFavorite(id: string) {
    const { error } = await db.from("listing_favorites").delete().eq("id", id);
    if (error) toast.error("Não foi possível remover o favorito.");
    else setFavorites((items) => items.filter((item) => item.id !== id));
  }

  async function unfollow(id: string) {
    const { error } = await db.from("seller_follows").delete().eq("id", id);
    if (error) toast.error("Não foi possível deixar de seguir a loja.");
    else setFollows((items) => items.filter((item) => item.id !== id));
  }

  async function callAction(name: string, args: Record<string, unknown>, success: string) {
    setBusy(true);
    const { error } = await db.rpc(name, args);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success(success);
      await load();
    }
  }

  async function reportPayment(event: FormEvent<HTMLFormElement>, saleId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const method = String(form.get("method") ?? "").trim();
    const reference = String(form.get("reference") ?? "").trim();
    if (!method || !reference) {
      toast.error("Indique o meio e a referência do pagamento.");
      return;
    }
    await callAction(
      "report_marketplace_payment",
      { _sale_id: saleId, _payment_method: method, _payment_reference: reference },
      "Pagamento comunicado à equipa VilaShop.",
    );
  }

  async function openDispute(event: FormEvent<HTMLFormElement>, saleId: string) {
    event.preventDefault();
    const value = disputes[saleId];
    if (!value?.reason?.trim() || value.reason.trim().length < 10) {
      toast.error("Explique a reclamação com pelo menos 10 caracteres.");
      return;
    }
    if (containsExternalContact(value.reason) || containsExternalContact(value.evidence ?? "")) {
      toast.error(CONTACT_SHARING_ERROR);
      return;
    }
    await callAction(
      "open_sale_dispute",
      { _sale_id: saleId, _reason: value.reason, _evidence_note: value.evidence },
      "Reclamação registada. A liquidação fica suspensa.",
    );
    setDisputes((current) => ({ ...current, [saleId]: { reason: "", evidence: "" } }));
  }

  if (loading)
    return (
      <main className="min-h-screen grid place-items-center bg-background">
        <p className="text-sm text-muted-foreground">A carregar a sua comunidade…</p>
      </main>
    );

  if (!userId)
    return (
      <main className="min-h-screen bg-background px-4 py-16">
        <section className="mx-auto max-w-md rounded-2xl border bg-card p-7 text-center">
          <Store className="mx-auto size-9 text-primary" />
          <h1 className="mt-4 text-2xl font-semibold">A sua comunidade VilaShop</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Entre na sua conta para consultar favoritos, lojas seguidas, propostas, compras e
            notificações.
          </p>
          <Link
            to="/"
            className="mt-5 inline-flex rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Voltar e entrar
          </Link>
        </section>
      </main>
    );

  const unread = notices.filter((notice) => !notice.read_at).length;

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-6">
          <div>
            <Link to="/" className="text-sm font-bold text-primary">
              VilaShop
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">A minha comunidade</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Tudo o que acompanha na sua actividade no VilaShop.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/mensagens"><MessageCircle className="mr-2 size-4" /> Mensagens</Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => void load()}>
              <RefreshCw className="mr-2 size-4" /> Actualizar
            </Button>
          </div>
        </header>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <Summary icon={<Bell />} label="Por ler" value={unread} />
          <Summary icon={<Heart />} label="Favoritos" value={favorites.length} />
          <Summary icon={<Store />} label="Lojas seguidas" value={follows.length} />
          <Summary icon={<Tag />} label="Propostas" value={offers.length} />
        </div>

        <Section
          icon={<Bell />}
          title="Notificações"
          count={unread ? `${unread} por ler` : "Tudo actualizado"}
        >
          {notices.length === 0 ? (
            <Empty>Ainda não tem notificações.</Empty>
          ) : (
            notices.map((item) => (
              <div
                key={item.id}
                className={`flex items-start justify-between gap-3 rounded-xl border p-4 ${item.read_at ? "bg-card" : "bg-accent/40"}`}
              >
                <div>
                  <p className="font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleString("pt-MZ")}
                  </p>
                </div>
                {!item.read_at && (
                  <Button size="sm" variant="outline" onClick={() => void markRead(item.id)}>
                    <Check className="mr-1 size-3" /> Lida
                  </Button>
                )}
              </div>
            ))
          )}
        </Section>

        <Section icon={<Heart />} title="Artigos guardados" count={favorites.length}>
          {favorites.length === 0 ? (
            <Empty>Os artigos que guardar vão aparecer aqui.</Empty>
          ) : (
            favorites.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4"
              >
                <div>
                  <p className="font-semibold">{item.listings?.title ?? "Anúncio guardado"}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.listings
                      ? `${item.listings.price.toLocaleString("pt-MZ", { maximumFractionDigits: 2 })} MT · preço anunciado · ${item.listings.status}`
                      : item.listing_id}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => void removeFavorite(item.id)}>
                  Remover
                </Button>
              </div>
            ))
          )}
        </Section>

        <Section icon={<Store />} title="Lojas e vendedores seguidos" count={follows.length}>
          {follows.length === 0 ? (
            <Empty>Quando seguir um vendedor, vai encontrá-lo aqui.</Empty>
          ) : (
            follows.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4"
              >
                <div>
                  <p className="font-semibold">Vendedor VilaShop</p>
                  <p className="text-xs text-muted-foreground">
                    ID {item.seller_id.slice(0, 8)} · desde{" "}
                    {new Date(item.created_at).toLocaleDateString("pt-MZ")}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => void unfollow(item.id)}>
                  Deixar de seguir
                </Button>
              </div>
            ))
          )}
        </Section>

        <Section icon={<Tag />} title="As minhas propostas" count={offers.length}>
          {offers.length === 0 ? (
            <Empty>As suas propostas e contrapropostas vão aparecer aqui.</Empty>
          ) : (
            offers.map((item) => (
              <div key={item.id} className="grid gap-3 rounded-xl border bg-card p-4">
                <div>
                  <p className="font-semibold">
                    {item.amount.toLocaleString("pt-MZ")} MT{" "}
                    {item.counter_amount
                      ? `· contraproposta ${item.counter_amount.toLocaleString("pt-MZ")} MT`
                      : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Anúncio {item.listing_id.slice(0, 8)} · {offerLabel(item.status)}
                  </p>
                </div>
                {item.status === "countered" && item.buyer_id === userId && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void callAction(
                        "accept_listing_counteroffer",
                        { _offer_id: item.id },
                        "Contraproposta aceite.",
                      )
                    }
                  >
                    Aceitar contraproposta
                  </Button>
                )}
                {item.status === "accepted" && item.buyer_id === userId && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void callAction(
                        "create_marketplace_sale",
                        {
                          _listing_id: item.listing_id,
                          _delivery_method: "in_person",
                          _offer_id: item.id,
                        },
                        "Compra iniciada. Consulte a área de compras.",
                      )
                    }
                  >
                    Iniciar compra
                  </Button>
                )}
                {item.status === "pending" && item.seller_id === userId && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void callAction(
                          "respond_listing_offer",
                          { _offer_id: item.id, _decision: "accept" },
                          "Proposta aceite.",
                        )
                      }
                    >
                      Aceitar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void callAction(
                          "respond_listing_offer",
                          { _offer_id: item.id, _decision: "reject" },
                          "Proposta recusada.",
                        )
                      }
                    >
                      Rejeitar
                    </Button>
                    <Input
                      className="max-w-40"
                      type="number"
                      min="1"
                      step="0.01"
                      value={counterValues[item.id] ?? ""}
                      onChange={(event) =>
                        setCounterValues((current) => ({
                          ...current,
                          [item.id]: event.target.value,
                        }))
                      }
                      placeholder="Contraproposta MT"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy || !(counterValues[item.id] ?? "").trim()}
                      onClick={() =>
                        void callAction(
                          "respond_listing_offer",
                          {
                            _offer_id: item.id,
                            _decision: "counter",
                            _counter_amount: Number(counterValues[item.id]),
                            _message: null,
                          },
                          "Contraproposta enviada.",
                        )
                      }
                    >
                      Contrapropor
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </Section>

        <Section icon={<Wallet />} title="Compras, pagamentos e entregas" count={sales.length}>
          {sales.length === 0 ? (
            <Empty>Quando iniciar uma compra, o acompanhamento aparecerá aqui.</Empty>
          ) : (
            sales.map((sale) => (
              <article key={sale.id} className="rounded-xl border bg-card p-4 sm:p-5">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <p className="font-semibold">Venda {sale.id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">
                      Artigo {sale.listing_id.slice(0, 8)} ·{" "}
                      {sale.delivery_method === "in_person"
                        ? "Encontro presencial"
                        : "Entrega pelo vendedor"}
                    </p>
                  </div>
                  <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold">
                    {saleLabel(sale.status)}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <p>
                    {sale.buyer_id === userId ? "Total a pagar" : "Valor da venda"}:{" "}
                    <strong>{sale.agreed_price.toLocaleString("pt-MZ")} MT</strong>
                  </p>
                  {sale.seller_id === userId && sellerFinancials[sale.id] && (
                    <>
                      <p>
                        Comissão VilaShop (
                        {(sellerFinancials[sale.id].commission_rate * 100).toLocaleString("pt-MZ")}
                        %):{" "}
                        <strong>
                          {sellerFinancials[sale.id].commission_amount.toLocaleString("pt-MZ")} MT
                        </strong>
                      </p>
                      <p>
                        Valor líquido a receber:{" "}
                        <strong>
                          {sellerFinancials[sale.id].seller_net_amount.toLocaleString("pt-MZ")} MT
                        </strong>
                      </p>
                    </>
                  )}
                </div>
                {sale.status === "awaiting_payment" && sale.buyer_id === userId && (
                  <form
                    className="mt-4 grid gap-3 rounded-lg bg-muted/60 p-3 sm:grid-cols-3"
                    onSubmit={(event) => void reportPayment(event, sale.id)}
                  >
                    <div className="grid gap-1">
                      <Label htmlFor={`method-${sale.id}`}>Meio de pagamento</Label>
                      <Input
                        id={`method-${sale.id}`}
                        name="method"
                        placeholder="Transferência, M-Pesa Business…"
                        required
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`reference-${sale.id}`}>Referência</Label>
                      <Input id={`reference-${sale.id}`} name="reference" required />
                    </div>
                    <div className="flex items-end">
                      <Button className="w-full" type="submit" disabled={busy}>
                        Comunicar pagamento
                      </Button>
                    </div>
                  </form>
                )}
                {sale.status === "payment_confirmed" && sale.seller_id === userId && (
                  <div className="mt-4">
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void callAction(
                          "seller_mark_sale_delivered",
                          { _sale_id: sale.id },
                          "Entrega comunicada. O comprador tem 48 horas para confirmar.",
                        )
                      }
                    >
                      Comunicar entrega do artigo
                    </Button>
                  </div>
                )}
                {sale.status === "seller_delivered" &&
                  sale.buyer_id === userId &&
                  sale.buyer_confirmation_deadline && (
                    <div className="mt-4 grid gap-3 rounded-lg bg-muted/60 p-3">
                      <p className="text-sm">
                        O vendedor informou a entrega. Confirme a recepção ou apresente uma
                        reclamação até{" "}
                        {new Date(sale.buyer_confirmation_deadline).toLocaleString("pt-MZ")}.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={busy}
                          onClick={() =>
                            void callAction(
                              "buyer_confirm_sale_receipt",
                              { _sale_id: sale.id },
                              "Recepção confirmada. A equipa fará a validação oficial.",
                            )
                          }
                        >
                          Confirmar recepção
                        </Button>
                      </div>
                      <form
                        className="grid gap-2"
                        onSubmit={(event) => void openDispute(event, sale.id)}
                      >
                        <Label htmlFor={`dispute-${sale.id}`}>
                          Se houver algum problema, descreva a reclamação
                        </Label>
                        <Textarea
                          id={`dispute-${sale.id}`}
                          value={disputes[sale.id]?.reason ?? ""}
                          onChange={(event) =>
                            setDisputes((current) => ({
                              ...current,
                              [sale.id]: {
                                reason: event.target.value,
                                evidence: current[sale.id]?.evidence ?? "",
                              },
                            }))
                          }
                          minLength={10}
                          maxLength={2000}
                          placeholder="Descreva o que aconteceu…"
                        />
                        <Input
                          value={disputes[sale.id]?.evidence ?? ""}
                          onChange={(event) =>
                            setDisputes((current) => ({
                              ...current,
                              [sale.id]: {
                                reason: current[sale.id]?.reason ?? "",
                                evidence: event.target.value,
                              },
                            }))
                          }
                          placeholder="Nota sobre provas (opcional)"
                          maxLength={2000}
                        />
                        <div>
                          <Button type="submit" variant="destructive" disabled={busy}>
                            Apresentar reclamação
                          </Button>
                        </div>
                      </form>
                    </div>
                  )}
                {sale.status === "payment_confirmed" && sale.buyer_id === userId && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    <Truck className="mr-1 inline size-4" /> Aguardamos que o vendedor organize e
                    comunique a entrega.
                  </p>
                )}
                {sale.status === "seller_delivered" && sale.seller_id === userId && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Entrega comunicada. Aguardamos confirmação do comprador dentro de 48 horas.
                  </p>
                )}
                {sale.status === "delivery_confirmed" && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Entrega validada pela equipa. Liquidação do vendedor prevista até 3 dias.
                  </p>
                )}
              </article>
            ))
          )}
        </Section>

        <footer className="mt-10 border-t pt-5 text-sm text-muted-foreground">
          <Link to="/" className="font-semibold text-primary">
            ← Voltar ao marketplace
          </Link>
        </footer>
      </div>
    </main>
  );
}

function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
function Section({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: string | number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          {icon}
          <span>{title}</span>
        </h2>
        <span className="text-xs text-muted-foreground">{count}</span>
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed bg-card px-4 py-7 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
function offerLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "A aguardar vendedor",
    accepted: "Aceite",
    rejected: "Recusada",
    countered: "Contraproposta recebida",
    withdrawn: "Retirada",
    expired: "Expirada",
  };
  return labels[status] ?? status;
}
function saleLabel(status: string) {
  const labels: Record<string, string> = {
    awaiting_payment: "A aguardar pagamento",
    payment_reported: "Pagamento comunicado",
    payment_confirmed: "Pagamento confirmado",
    seller_delivered: "Entrega comunicada · 48h para confirmar",
    buyer_confirmed: "Recepção confirmada",
    disputed: "Em reclamação · pagamento suspenso",
    delivery_confirmed: "Entrega validada · liquidação pendente",
    payout_recorded: "Vendedor pago",
    cancelled: "Cancelada",
  };
  return labels[status] ?? status;
}
