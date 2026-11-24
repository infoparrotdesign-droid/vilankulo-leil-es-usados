/** Centralised, non-secret contact routing for VilaShop. */
export const VILASHOP_ADMIN_EMAIL = "info.parrotdesign@gmail.com";
export const VILASHOP_NOTIFICATION_EMAIL = "adminvilashop@gmail.com";

export function isVilaShopAdminEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === VILASHOP_ADMIN_EMAIL;
}
