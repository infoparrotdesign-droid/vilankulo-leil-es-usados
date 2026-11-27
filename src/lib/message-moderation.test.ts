import { describe, expect, it, vi } from "vitest";
import {
  MESSAGE_FLAG_CATEGORIES,
  MESSAGE_FLAG_CATEGORY_LABELS,
  flagMessageForModeration,
} from "./message-moderation";

describe("VilaShop message moderation categories", () => {
  it("supports every administrative alert category", () => {
    expect(MESSAGE_FLAG_CATEGORIES).toEqual([
      "personal_contact",
      "offensive_language",
      "threat",
      "discrimination",
      "other",
    ]);
  });

  it.each(MESSAGE_FLAG_CATEGORIES)("has a Portuguese label for %s", (category) => {
    expect(MESSAGE_FLAG_CATEGORY_LABELS[category].trim().length).toBeGreaterThan(3);
  });
});

describe("flagMessageForModeration input validation", () => {
  const invoke = vi.fn();
  const client = { functions: { invoke } } as unknown as Parameters<
    typeof flagMessageForModeration
  >[0];
  const validInput = {
    messageId: "message-1",
    category: "threat" as const,
    messageContent: "Mensagem de teste",
  };

  it("rejects empty message references without calling the backend", async () => {
    await expect(
      flagMessageForModeration(client, { ...validInput, messageId: " " }),
    ).rejects.toThrow("Referência de mensagem inválida.");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("rejects empty or oversized message content", async () => {
    await expect(
      flagMessageForModeration(client, { ...validInput, messageContent: " " }),
    ).rejects.toThrow("O conteúdo da mensagem é inválido.");
    await expect(
      flagMessageForModeration(client, {
        ...validInput,
        messageContent: "x".repeat(5001),
      }),
    ).rejects.toThrow("O conteúdo da mensagem é inválido.");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("rejects oversized reporter notes", async () => {
    await expect(
      flagMessageForModeration(client, {
        ...validInput,
        details: "x".repeat(1001),
      }),
    ).rejects.toThrow("A observação excede o limite permitido.");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("normalizes input and returns the delivery result", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { ok: true, flagId: "flag-1", notificationSent: true, duplicate: false },
      error: null,
    });
    const mockClient = { functions: { invoke } } as never;

    const result = await flagMessageForModeration(mockClient, {
      ...validInput,
      messageId: " message-1 ",
      messageContent: " Mensagem de teste ",
      details: " Observação ",
    });

    expect(invoke).toHaveBeenCalledWith("flag-message", {
      body: {
        ...validInput,
        messageId: "message-1",
        messageContent: "Mensagem de teste",
        details: "Observação",
      },
    });
    expect(result).toEqual({
      flagId: "flag-1",
      notificationSent: true,
      duplicate: false,
    });
  });

  it("reports duplicate flags without treating an unsent alert as delivered", async () => {
    const mockClient = {
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: { ok: true, flagId: "flag-2", notificationSent: false, duplicate: true },
          error: null,
        }),
      },
    } as never;

    const result = await flagMessageForModeration(mockClient, validInput);

    expect(result).toEqual({
      flagId: "flag-2",
      notificationSent: false,
      duplicate: true,
    });
  });
});
