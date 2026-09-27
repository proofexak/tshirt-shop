// Signup/login pages accept a `?next=` query param and navigate there after
// a successful auth action (controller ruling 5). `next` comes straight
// from the URL, so it's attacker-controlled input (an open-redirect vector
// if trusted blindly) — this only ever allows a same-origin relative path.
//
// Rejects:
// - missing/empty values -> "/"
// - anything not starting with "/" (e.g. "https://evil.com") -> protocol-relative
//   or absolute URLs never reach router.push as-is
// - "//evil.com" (protocol-relative — browsers treat a leading "//" as
//   "same scheme, different host")
// - backslash-prefixed variants some browsers still normalize as "//"
//   (e.g. "/\evil.com", "\\evil.com")
export function getSafeRedirectPath(next: string | null | undefined): string {
  if (!next) {
    return "/";
  }

  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.includes("\\\\")) {
    return "/";
  }

  return next;
}
