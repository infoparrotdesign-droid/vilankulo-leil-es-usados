import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, MessageCircle, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { containsExternalContact, CONTACT_SHARING_ERROR } from "@/lib/message-safety";

type Conversation = {
  conversation_id: string;
  listing_id: string;
  listing_title: string;
  other_user_id: string;
  other_user_name: string;
  last_message: string | null;
  last_message_at: string;
  unread_count: number;
};

type ChatMessage = {
  id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
  is_mine: boolean;
};

type Api = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

const db = supabase as unknown as Api;

export const Route = createFileRoute("/mensagens")({
  head: () => ({
    meta: [
      { title: "Mensagens — VilaShop" },
      {
        name: "description",
        content: "Converse com compradores e vendedores dentro do VilaShop.",
      },
    ],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const loadConversations = useCallback(async () => {
    try {
      const { data, error } = await db.rpc("list_my_conversations");
      if (error) {
        toast.error(error.message);
        return;
      }
      const rows = (data ?? []) as Conversation[];
      setConversations(rows);
      setActiveId((current) => {
        const requested = new URLSearchParams(window.location.search).get("conversation");
        if (requested && rows.some((row) => row.conversation_id === requested)) {
          return requested;
        }
        if (current && rows.some((row) => row.conversation_id === current)) {
          return current;
        }
        return rows[0]?.conversation_id ?? null;
      });
    } catch (error) {
      console.error("Could not load conversations", error);
      toast.error("Não foi possível carregar as conversas. Tente actualizar.");
    }
  }, []);

  const loadMessages = useCallback(
    async (conversationId: string) => {
      try {
        const { data, error } = await db.rpc("get_conversation_messages", {
          _conversation_id: conversationId,
        });
        if (error) {
          toast.error(error.message);
          return;
        }
        setMessages((data ?? []) as ChatMessage[]);
        await loadConversations();
      } catch (error) {
        console.error("Could not load conversation messages", error);
        toast.error("Não foi possível carregar as mensagens. Tente novamente.");
      }
    },
    [loadConversations],
  );

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;
      if (error || !data.user) {
        setLoading(false);
        return;
      }
      setUserId(data.user.id);
      await loadConversations();
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [loadConversations]);

  useEffect(() => {
    setMessages([]);
    if (activeId) void loadMessages(activeId);
  }, [activeId, loadMessages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!activeId || !body || sending) return;
    if (containsExternalContact(body)) {
      toast.error(CONTACT_SHARING_ERROR);
      return;
    }
    setSending(true);
    try {
      const { error } = await db.rpc("send_conversation_message", {
        _conversation_id: activeId,
        _body: body,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      setDraft("");
      await loadMessages(activeId);
    } catch (error) {
      console.error("Could not send conversation message", error);
      toast.error("Não foi possível enviar a mensagem. Verifique a ligação e tente novamente.");
    } finally {
      setSending(false);
    }
  }

  const activeConversation = conversations.find((item) => item.conversation_id === activeId);

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <p className="text-sm text-muted-foreground">A carregar mensagens…</p>
      </main>
    );
  }

  if (!userId) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <section className="rounded-2xl border bg-card p-6 text-center">
          <MessageCircle className="mx-auto mb-3 size-8 text-primary" />
          <h1 className="text-xl font-semibold">As suas mensagens</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Entre na sua conta para conversar com compradores e vendedores dentro do VilaShop.
          </p>
          <Button asChild className="mt-5">
            <Link to="/">Entrar no VilaShop</Link>
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to="/"
            className="mb-2 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={16} /> Marketplace
          </Link>
          <h1 className="text-2xl font-bold">Mensagens</h1>
          <p className="text-sm text-muted-foreground">
            Toda a comunicação acontece aqui, sem chamadas ou contactos externos.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadConversations()}>
          <RefreshCw className="mr-2 size-4" /> Actualizar
        </Button>
      </header>

      <div className="grid min-h-[560px] overflow-hidden rounded-2xl border bg-card md:grid-cols-[320px_1fr]">
        <aside className="border-b md:border-b-0 md:border-r">
          <div className="border-b p-4 font-semibold">Conversas</div>
          {conversations.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              Ainda não tem conversas. Abra um anúncio e escolha “Iniciar conversa”.
            </p>
          ) : (
            <div className="max-h-[620px] overflow-y-auto">
              {conversations.map((conversation) => (
                <button
                  key={conversation.conversation_id}
                  type="button"
                  onClick={() => {
                    setActiveId(conversation.conversation_id);
                    window.history.replaceState(
                      null,
                      "",
                      "/mensagens?conversation=" + conversation.conversation_id,
                    );
                  }}
                  className={
                    "w-full border-b p-4 text-left transition hover:bg-muted/60 " +
                    (activeId === conversation.conversation_id ? "bg-muted" : "")
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{conversation.other_user_name}</span>
                    {Number(conversation.unread_count) > 0 && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                        {conversation.unread_count}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {conversation.listing_title}
                  </p>
                  <p className="mt-2 truncate text-sm text-muted-foreground">
                    {conversation.last_message ?? "Conversa iniciada. Envie a primeira mensagem."}
                  </p>
                  <p className="mt-1 text-right text-[11px] text-muted-foreground">
                    {new Date(conversation.last_message_at).toLocaleString("pt-MZ")}
                  </p>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="flex min-h-[560px] flex-col">
          {activeConversation ? (
            <>
              <div className="border-b p-4">
                <h2 className="font-semibold">{activeConversation.other_user_name}</h2>
                <p className="text-sm text-muted-foreground">
                  Anúncio: {activeConversation.listing_title}
                </p>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4">
                {messages.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Inicie a conversa com uma mensagem sobre este artigo.
                  </p>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={"flex " + (message.is_mine ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={
                          "max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm " +
                          (message.is_mine
                            ? "bg-primary text-primary-foreground"
                            : "border bg-card")
                        }
                      >
                        <p className="whitespace-pre-wrap break-words">{message.body}</p>
                        <p
                          className={
                            "mt-1 text-right text-[10px] " +
                            (message.is_mine
                              ? "text-primary-foreground/70"
                              : "text-muted-foreground")
                          }
                        >
                          {new Date(message.created_at).toLocaleString("pt-MZ")}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <form
                onSubmit={(event) => void sendMessage(event)}
                className="grid gap-2 border-t p-3"
              >
                <Textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="Escreva a sua mensagem…"
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    Não partilhe telefone, email ou contactos externos.
                  </span>
                  <Button type="submit" disabled={sending || !draft.trim()}>
                    <Send className="mr-2 size-4" />
                    {sending ? "A enviar…" : "Enviar"}
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <MessageCircle className="mb-3 size-10 text-muted-foreground" />
              <h2 className="font-semibold">Escolha uma conversa</h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                As mensagens entre compradores e vendedores ficam guardadas na sua conta VilaShop.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
