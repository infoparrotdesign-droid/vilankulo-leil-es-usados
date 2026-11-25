import { describe, expect, it } from "vitest";
import { MESSAGE_FLAG_CATEGORIES, MESSAGE_FLAG_CATEGORY_LABELS } from "./message-moderation";

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
