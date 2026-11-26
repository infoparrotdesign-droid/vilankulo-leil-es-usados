import { describe, expect, it } from "vitest";

import { getAdultCutoff, isAdultDateOfBirth, sanitizeImageName } from "@/lib/marketplace-rules";

describe("adult registration eligibility", () => {
  const today = new Date("2026-11-17T12:00:00Z");

  it("accepts someone whose 18th birthday is today", () => {
    expect(isAdultDateOfBirth("2008-11-17", today)).toBe(true);
  });

  it("rejects someone who has not turned 18 yet", () => {
    expect(isAdultDateOfBirth("2008-11-18", today)).toBe(false);
  });

  it("rejects dates that cannot represent a birthday", () => {
    expect(isAdultDateOfBirth("18-11-2000", today)).toBe(false);
  });
});

describe("photo upload validation", () => {
  it("accepts only the image formats used by the marketplace", () => {
    expect(sanitizeImageName("my-photo.WebP")).toBe("webp");
    expect(sanitizeImageName("file.svg")).toBe("");
  });
});

describe("registration date boundaries", () => {
  it("uses the date exactly 18 years before today as the cutoff", () => {
    expect(getAdultCutoff(new Date("2026-11-17T12:00:00Z"))).toBe("2008-11-17");
  });
});
