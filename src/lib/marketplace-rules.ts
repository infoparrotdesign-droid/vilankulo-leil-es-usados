const ADULT_YEARS = 18;

export function getAdultCutoff(today = new Date()): string {
  const cutoff = new Date(Date.UTC(today.getUTCFullYear() - ADULT_YEARS, today.getUTCMonth(), today.getUTCDate()));
  return cutoff.toISOString().slice(0, 10);
}

export function isAdultDateOfBirth(value: string, today = new Date()): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value <= getAdultCutoff(today);
}

export function sanitizeImageName(filename: string): string {
  const extension = filename.toLowerCase().split(".").pop() ?? "";
  return ["jpg", "jpeg", "png", "webp"].includes(extension) ? extension : "";
}