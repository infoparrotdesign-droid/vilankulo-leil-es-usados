import type { SupabaseClient } from "@supabase/supabase-js";

export const MESSAGE_FLAG_CATEGORIES = [
  "personal_contact",
  "offensive_language",
  "threat",
  "discrimination",
  "other",
] as const;

export type MessageFlagCategory = (typeof MESSAGE_FLAG_CATEGORIES)[number];

export const MESSAGE_FLAG_CATEGORY_LABELS: Record<MessageFlagCategory, string> = {
  personal_contact: "Partilha de contactos pessoais",
  offensive_language: "Linguagem ofensiva",
  threat: "Ameaça",
  discrimination: "Discriminação",
  other: "Outro",
};

export type FlagMessageInput = {
  messageId: string;
  conversationId?: string;
  category: MessageFlagCategory;
  messageContent: string;
  details?: string;
};

/**
 * Call when a participant or moderation workflow flags a chat message.
 * The Edge Function validates the Supabase session, stores the flag and sends the Gmail alert.
 */
export async function flagMessageForModeration(
  supabase: SupabaseClient,
  input: FlagMessageInput,
): Promise<{ flagId?: string; notificationSent: boolean; duplicate?: boolean }> {
  if (!input.messageId.trim() || input.messageId.trim().length > 128) {
    throw new Error("Referência de mensagem inválida.");
  }
  if (input.conversationId && input.conversationId.trim().length > 128) {
    throw new Error("Referência de conversa inválida.");
  }
  if (!MESSAGE_FLAG_CATEGORIES.includes(input.category)) {
    throw new Error("Categoria de sinalização inválida.");
  }
  if (!input.messageContent.trim() || input.messageContent.trim().length > 5000) {
    throw new Error("O conteúdo da mensagem é inválido.");
  }
  if ((input.details?.trim().length ?? 0) > 1000) {
    throw new Error("A observação excede o limite permitido.");
  }

  const { data, error } = await supabase.functions.invoke("flag-message", {
    body: {
      ...input,
      messageId: input.messageId.trim(),
      conversationId: input.conversationId?.trim() || undefined,
      messageContent: input.messageContent.trim(),
      details: input.details?.trim() || undefined,
    },
  });
  if (error) throw error;
  if (!data || data.ok !== true) {
    throw new Error("Não foi possível sinalizar a mensagem.");
  }
  return {
    flagId: typeof data.flagId === "string" ? data.flagId : undefined,
    notificationSent: data.notificationSent === true,
    duplicate: data.duplicate === true,
  };
}
