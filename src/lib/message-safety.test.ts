import { describe, expect, it } from "vitest";
import { containsExternalContact } from "./message-safety";

describe("VilaShop internal communication safety", () => {
  it.each([
    "Liga-me pelo +258 84 123 4567",
    "O meu email é cliente@example.com",
    "Entra em https://example.com para ver",
    "Visita www.example.com",
    "Procura-me no Instagram",
    "Fala comigo no WhatsApp",
    "O meu utilizador é @cliente_vilashop",
  ])("blocks external contact details: %s", (message) => {
    expect(containsExternalContact(message)).toBe(true);
  });

  it.each([
    "Posso levantar o artigo amanhã de manhã?",
    "Consigo pagar 5.000 MT se aceitar a proposta.",
    "O artigo está em bom estado e posso entregar em Vilankulo.",
    "Prefiro combinar a entrega num local público.",
    "",
  ])("allows ordinary negotiation or mediation text: %s", (message) => {
    expect(containsExternalContact(message)).toBe(false);
  });
});
