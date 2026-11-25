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
  const { data, error } = await supabase.functions.invoke("flag-message", { body: input });
  if (error) throw error;
  if (!data || data.ok !== true) throw new Error("Não foi possível sinalizar a mensagem.");
  return {
    flagId: typeof data.flagId === "string" ? data.flagId : undefined,
    notificationSent: data.notificationSent === true,
    duplicate: data.duplicate === true,
  };
}
