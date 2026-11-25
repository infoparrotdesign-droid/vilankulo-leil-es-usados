import { describe, expect, it } from "vitest";
import { buildProfileInsertPayload } from "./profile-payload";

describe("VilaShop profile insert payload", () => {
  it("writes only columns supported by the live profiles table", () => {
    const payload = buildProfileInsertPayload({
      userId: "user-123",
      displayName: "Parrot Design Gráfico",
      phone: "+258879999999",
      address: "Vilankulo, Inhambane",
      birthDate: "1995-04-20",
    });

    expect(payload).toEqual({
      id: "user-123",
      display_name: "Parrot Design Gráfico",
      phone: "+258879999999",
      address: "Vilankulo, Inhambane",
      birth_date: "1995-04-20",
    });
    expect(payload).not.toHaveProperty("seller_kind");
  });
});
