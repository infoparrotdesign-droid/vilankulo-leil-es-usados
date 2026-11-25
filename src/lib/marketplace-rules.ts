const ADULT_YEARS = 18;

export function getAdultCutoff(today = new Date()): string {
  const cutoff = new Date(Date.UTC(today.getUTCFullYear() - ADULT_YEARS, today.getUTCMonth(), today.getUTCDate()));
  return cutoff.toISOString().slice(0, 10);
}

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;

  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysPerMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysPerMonth[month - 1];
}

export function isAdultDateOfBirth(value: string, today = new Date()): boolean {
  return isValidCalendarDate(value) && value <= getAdultCutoff(today);
}

export const MAX_LISTING_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const SUPPORTED_IMAGE_MIME_TYPES: Record<string, string[]> = {
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
};

export function sanitizeImageName(filename: string): string {
  const extension = filename.toLowerCase().split(".").pop() ?? "";
  return Object.hasOwn(SUPPORTED_IMAGE_MIME_TYPES, extension) ? extension : "";
}

/** Accept only non-empty JPG, PNG or WebP files up to 5 MiB with matching MIME metadata. */
export function isSupportedListingImage(file: {
  name: string;
  type: string;
  size: number;
}): boolean {
  const extension = sanitizeImageName(file.name);
  if (!extension || !Number.isFinite(file.size) || file.size <= 0
    || file.size > MAX_LISTING_IMAGE_SIZE_BYTES) {
    return false;
  }

  return SUPPORTED_IMAGE_MIME_TYPES[extension].includes(file.type.toLowerCase());
}


const DEFAULT_COMMISSION_RATE = 0.1;

export type SaleBreakdown = {
  buyerTotal: number;
  commission: number;
  sellerNet: number;
};

/** Calculates the 10% seller-side commission without changing the buyer's agreed price. */
export function calculateSaleBreakdown(
  listingPrice: number,
  commissionRate = DEFAULT_COMMISSION_RATE,
): SaleBreakdown {
  if (!Number.isFinite(listingPrice) || listingPrice <= 0
    || !Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate >= 1) {
    return { buyerTotal: 0, commission: 0, sellerNet: 0 };
  }

  const buyerTotal = Math.round((listingPrice + Number.EPSILON) * 100) / 100;
  const commission = Math.round((buyerTotal * commissionRate + Number.EPSILON) * 100) / 100;
  return {
    buyerTotal,
    commission,
    sellerNet: Math.round((buyerTotal - commission + Number.EPSILON) * 100) / 100,
  };
}

/** Returns the smallest cent-rounded listing price that leaves the requested net after commission. */
export function calculateSuggestedListingPrice(
  desiredSellerNet: number,
  commissionRate = DEFAULT_COMMISSION_RATE,
): number {
  if (!Number.isFinite(desiredSellerNet) || desiredSellerNet <= 0
    || !Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate >= 1) {
    return 0;
  }

  return Math.ceil((desiredSellerNet / (1 - commissionRate)) * 100 - Number.EPSILON) / 100;
}


/** Normalizes Portuguese marketplace text for forgiving, accent-insensitive search. */
export function normalizeMarketplaceSearch(value: string): string {
  return value.normalize("NFD").replace(/\\p{M}/gu, "").toLocaleLowerCase("pt-MZ").trim().replace(/\\s+/g, " ");
}

/** Every search term must match, regardless of order or diacritics. */
export function matchesMarketplaceSearch(text: string, query: string): boolean {
  const normalizedText = normalizeMarketplaceSearch(text);
  const terms = normalizeMarketplaceSearch(query).split(" ").filter(Boolean);
  return terms.every((term) => normalizedText.includes(term));
}

/** Auctions are compared using the current bid when one exists. */
export function getComparableListingPrice(price: number, highestBid: number | null): number {
  return highestBid !== null && Number.isFinite(highestBid) && highestBid > 0
    ? highestBid
    : Number.isFinite(price) && price > 0 ? price : Number.POSITIVE_INFINITY;
}
