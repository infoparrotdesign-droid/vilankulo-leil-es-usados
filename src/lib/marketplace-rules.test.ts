import { describe, expect, it } from "vitest";
import { getAdultCutoff, isAdultDateOfBirth, sanitizeImageName } from "./marketplace-rules";

describe("VilaShop minimum age validation", () => {
  const today = new Date("2026-11-25T12:00:00.000Z");

  it("accepts a person who turns 18 on the current date", () => {
    expect(isAdultDateOfBirth("2008-11-25", today)).toBe(true);
  });

  it("rejects a person who is still one day under 18", () => {
    expect(isAdultDateOfBirth("2008-11-26", today)).toBe(false);
  });

  it.each(["2008-02-30", "2008-13-01", "2008-00-10", "2008-04-31", "0000-01-01", "not-a-date"])(
    "rejects an invalid calendar date: %s",
    (value) => expect(isAdultDateOfBirth(value, today)).toBe(false),
  );

  it("accepts a valid leap-day birth date when the person is old enough", () => {
    expect(isAdultDateOfBirth("2004-02-29", today)).toBe(true);
  });

  it("calculates the 18-year cutoff using UTC calendar components", () => {
    expect(getAdultCutoff(today)).toBe("2008-11-25");
  });
});

describe("VilaShop listing photo file types", () => {
  it.each(["photo.jpg", "PHOTO.JPEG", "imagem.png", "produto.webp"])(
    "accepts supported image extensions: %s",
    (filename) => expect(sanitizeImageName(filename)).not.toBe(""),
  );

  it.each(["document.pdf", "animation.gif", "photo.svg", "sem-extensao"])(
    "rejects unsupported extensions: %s",
    (filename) => expect(sanitizeImageName(filename)).toBe(""),
  );
});
