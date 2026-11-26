import { describe, expect, it } from "vitest";
import {
  isVilaShopAdminEmail,
  VILASHOP_ADMIN_EMAIL,
  VILASHOP_NOTIFICATION_EMAIL,
} from "./vilashop-config";

describe("VilaShop administrative identity", () => {
  it("reserves administrative identity for the Parrot mailbox", () => {
    expect(VILASHOP_ADMIN_EMAIL).toBe("info.parrotdesign@gmail.com");
    expect(isVilaShopAdminEmail("info.parrotdesign@gmail.com")).toBe(true);
    expect(isVilaShopAdminEmail(" INFO.PARROTDESIGN@GMAIL.COM ")).toBe(true);
  });

  it("never treats the notifications mailbox as an administrator", () => {
    expect(VILASHOP_NOTIFICATION_EMAIL).toBe("adminvilashop@gmail.com");
    expect(isVilaShopAdminEmail(VILASHOP_NOTIFICATION_EMAIL)).toBe(false);
    expect(isVilaShopAdminEmail("adminvilashop@gmail.com")).toBe(false);
  });

  it("rejects missing and unrelated email addresses", () => {
    expect(isVilaShopAdminEmail(null)).toBe(false);
    expect(isVilaShopAdminEmail(undefined)).toBe(false);
    expect(isVilaShopAdminEmail("user@example.com")).toBe(false);
    expect(isVilaShopAdminEmail("info.parrotdesign+other@gmail.com")).toBe(false);
  });
});
