export const CONTACT_SHARING_ERROR =
  "Por segurança, não partilhe telefones, emails, links ou contactos de redes sociais. Mantenha a comunicação no VilaShop.";

const EMAIL_PATTERN = /\b[\w.+-]+@[\w.-]+\.[A-Z]{2,}\b/i;
const URL_PATTERN =
  /(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|mz|co|app|io|me|info|biz|site|online|store|link)(?:\/\S*)?/i;
const MOZAMBIQUE_MOBILE_PATTERN = /(?:\+?258[\s().-]*)?(?:8[2-7]|9[0-9])(?:[\s().-]*\d){7}\b/;
const SOCIAL_HANDLE_PATTERN = /(?:^|\s)@[a-z0-9_.]{3,}\b/i;
const EXTERNAL_CHANNEL_PATTERN =
  /\b(?:whats?app|wpp|telegram|instagram|facebook|messenger|signal|tiktok|viber|snapchat|imo)\b/i;

/** Detects contact details or off-platform channels in negotiation/mediation text. */
export function containsExternalContact(value: string): boolean {
  const message = value.trim();
  if (!message) return false;
  return (
    EMAIL_PATTERN.test(message) ||
    URL_PATTERN.test(message) ||
    MOZAMBIQUE_MOBILE_PATTERN.test(message) ||
    SOCIAL_HANDLE_PATTERN.test(message) ||
    EXTERNAL_CHANNEL_PATTERN.test(message)
  );
}
