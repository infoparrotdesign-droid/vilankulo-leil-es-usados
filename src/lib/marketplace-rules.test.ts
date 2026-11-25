import { describe, expect, it } from "vitest";
import { calculateSaleBreakdown, calculateSuggestedListingPrice, getAdultCutoff, isAdultDateOfBirth, sanitizeImageName } from "./marketplace-rules";

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


describe("VilaShop seller price and commission calculations", () => {
  it("keeps the agreed price as the buyer total and deducts 10% from the seller", () => {
    expect(calculateSaleBreakdown(1000)).toEqual({
      buyerTotal: 1000,
      commission: 100,
      sellerNet: 900,
    });
  });

  it("rounds commission to cents before calculating the seller net", () => {
    expect(calculateSaleBreakdown(99.99)).toEqual({
      buyerTotal: 99.99,
      commission: 10,
      sellerNet: 89.99,
    });
  });

  it("supports an explicitly supplied commission rate", () => {
    expect(calculateSaleBreakdown(1000, 0.05)).toEqual({
      buyerTotal: 1000,
      commission: 50,
      sellerNet: 950,
    });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "returns a safe zero breakdown for invalid listing prices: %s",
    (price) => expect(calculateSaleBreakdown(price)).toEqual({
      buyerTotal: 0,
      commission: 0,
      sellerNet: 0,
    }),
  );

  it("rounds the suggested listing price upwards so the seller receives the target net", () => {
    const suggested = calculateSuggestedListingPrice(5000);
    expect(suggested).toBe(5555.56);
    expect(calculateSaleBreakdown(suggested).sellerNet).toBeGreaterThanOrEqual(5000);
  });

  it("does not suggest a price when the target or commission rate is invalid", () => {
    expect(calculateSuggestedListingPrice(0)).toBe(0);
    expect(calculateSuggestedListingPrice(-10)).toBe(0);
    expect(calculateSuggestedListingPrice(Number.NaN)).toBe(0);
    expect(calculateSuggestedListingPrice(100, 1)).toBe(0);
    expect(calculateSuggestedListingPrice(100, -0.1)).toBe(0);
  });
});
