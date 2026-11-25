import { describe, expect, it } from "vitest";
import { calculateSaleBreakdown, calculateSuggestedListingPrice, getAdultCutoff, getComparableListingPrice, isAdultDateOfBirth, isSupportedListingImage, isValidMarketplaceAmount, matchesMarketplaceSearch, MAX_LISTING_IMAGE_SIZE_BYTES, normalizeListingDescription, normalizeListingTitle, normalizeMarketplaceSearch, sanitizeImageName } from "./marketplace-rules";

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


describe("VilaShop listing image upload validation", () => {
  const validImage = { name: "produto.webp", type: "image/webp", size: 1024 };

  it("accepts supported image formats with matching MIME types", () => {
    expect(isSupportedListingImage({ name: "foto.jpg", type: "image/jpeg", size: 1024 })).toBe(true);
    expect(isSupportedListingImage({ name: "foto.jpeg", type: "image/jpeg", size: 1024 })).toBe(true);
    expect(isSupportedListingImage({ name: "foto.png", type: "image/png", size: 1024 })).toBe(true);
    expect(isSupportedListingImage(validImage)).toBe(true);
  });

  it("rejects empty files and files larger than five MiB", () => {
    expect(isSupportedListingImage({ ...validImage, size: 0 })).toBe(false);
    expect(isSupportedListingImage({ ...validImage, size: MAX_LISTING_IMAGE_SIZE_BYTES + 1 })).toBe(false);
    expect(isSupportedListingImage({ ...validImage, size: Number.NaN })).toBe(false);
  });

  it("accepts a file exactly at the five MiB limit", () => {
    expect(isSupportedListingImage({ ...validImage, size: MAX_LISTING_IMAGE_SIZE_BYTES })).toBe(true);
  });

  it("rejects mismatched, missing or unsupported MIME types", () => {
    expect(isSupportedListingImage({ ...validImage, type: "image/jpeg" })).toBe(false);
    expect(isSupportedListingImage({ ...validImage, type: "" })).toBe(false);
    expect(isSupportedListingImage({ ...validImage, type: "image/svg+xml" })).toBe(false);
  });

  it("rejects unsupported extensions even when the MIME type looks valid", () => {
    expect(isSupportedListingImage({ ...validImage, name: "imagem.gif" })).toBe(false);
    expect(isSupportedListingImage({ ...validImage, name: "document.pdf", type: "image/png" })).toBe(false);
  });
});


describe("VilaShop marketplace search and price sorting", () => {
  it("normalizes accents, casing and repeated whitespace", () => {
    expect(normalizeMarketplaceSearch("  TELEFÓNE  móvel  ")).toBe("telefone movel");
  });

  it("matches all search terms independent of order and accents", () => {
    expect(matchesMarketplaceSearch("Telemóvel Android em bom estado", "BOM telemovel")).toBe(true);
    expect(matchesMarketplaceSearch("Telemóvel Android em bom estado", "telemovel bicicleta")).toBe(false);
    expect(matchesMarketplaceSearch("Qualquer artigo", "   ")).toBe(true);
  });

  it("uses current bids as auction prices and falls back to asking price", () => {
    expect(getComparableListingPrice(4500, 5200)).toBe(5200);
    expect(getComparableListingPrice(4500, null)).toBe(4500);
    expect(getComparableListingPrice(4500, Number.NaN)).toBe(4500);
  });

  it("places invalid prices after valid prices", () => {
    expect(getComparableListingPrice(Number.NaN, null)).toBe(Number.POSITIVE_INFINITY);
  });
});


describe("VilaShop listing text and monetary input rules", () => {
  it("normalizes titles by removing control characters and repeated whitespace", () => {
    expect(normalizeListingTitle("  Bicicleta\n  urbana\t usada  ")).toBe("Bicicleta urbana usada");
  });

  it("preserves description paragraphs while removing invisible control characters", () => {
    expect(normalizeListingDescription("  Bom estado\r\n\r\n  Sem riscos\u0000\tvisíveis\n\n\nEntrega disponível  "))
      .toBe("Bom estado\n\nSem riscos visíveis\n\nEntrega disponível");
  });

  it.each([1, 10.5, 99.99, 0.01])("accepts positive amounts with up to two decimals: %s", (amount) => {
    expect(isValidMarketplaceAmount(amount)).toBe(true);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.001])("rejects invalid monetary amounts: %s", (amount) => {
    expect(isValidMarketplaceAmount(amount)).toBe(false);
  });
});
