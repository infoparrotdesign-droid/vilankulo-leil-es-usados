/** Centralised, non-secret contact routing for VilaShop. */
export const VILASHOP_ADMIN_EMAIL = "info.parrotdesign@gmail.com";

/** Both mailboxes receive the same platform-level email notifications. */
export const VILASHOP_NOTIFICATION_EMAILS = [
  VILASHOP_ADMIN_EMAIL,
  "adminvilashop@gmail.com",
] as const;

/** Compatibility alias for older code expecting the dedicated notification mailbox. */
export const VILASHOP_NOTIFICATION_EMAIL = "adminvilashop@gmail.com";

export function isVilaShopAdminEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === VILASHOP_ADMIN_EMAIL;
}
