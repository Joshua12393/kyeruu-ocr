let active = 0;
const waiting: (() => void)[] = [];
export async function limitedOcr<T>(work: () => Promise<T>) {
  if (active >= 2) {
    if (waiting.length >= 20) { const { ApiError } = await import("./api"); throw new ApiError(429, "OCR is busy. Your saved scan is retained; retry later."); }
    await new Promise<void>(resolve => waiting.push(resolve));
  } else active++;
  try { return await work(); } finally { const next = waiting.shift(); if (next) next(); else active--; }
}
