export function safeCallback(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  try {
    const url = new URL(value, "http://local.invalid");
    if (url.origin !== "http://local.invalid" || /^\/(login|register|api\/auth|access-pending)(\/|$)/.test(url.pathname)) return "/";
    return url.pathname + url.search + url.hash;
  } catch { return "/"; }
}
