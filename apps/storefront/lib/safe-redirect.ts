// Signup/login pages accept a `?next=` query param and navigate there after
// a successful auth action (controller ruling 5). `next` comes straight
// from the URL, so it's attacker-controlled input (an open-redirect vector
// if trusted blindly) — this only ever allows a same-origin relative path.
//
// Round-1 review finding: a naive string-prefix check (reject anything not
// starting with "/", reject "//", reject "/\") is NOT enough. The WHATWG URL
// parser strips ASCII tab/CR/LF from the input before resolving it, so
// `next=/%09/evil.com` arrives here (already percent-decoded by
// URLSearchParams) as the literal string "/\t/evil.com" — which passes
// every one of those string checks (it starts with a single "/", not "//",
// not "/\") but the browser's own URL parser treats it as "//evil.com" once
// the tab is stripped, and Next's router.push (new URL(href, location.href))
// resolves that to a different origin and does a full external navigation.
// Verified empirically: `new URL("/\t/evil.com", "http://localhost").origin`
// is `"http://evil.com"`, same for "/\n/evil.com" and "/\evil.com" (a lone
// backslash after the leading slash is itself treated as a path separator
// for special schemes, so it collapses to the same "//host" form).
//
// Fix: resolve `next` against a placeholder origin with the real URL parser
// (the same one the browser/router will eventually use) and only accept it
// if the resolved origin is still the placeholder's — i.e. actually
// same-origin after all of the parser's own normalization, not just
// same-origin by a string's surface appearance. This also naturally covers
// `javascript:` and other non-http(s) schemes (opaque/`null` origin) and
// absolute URLs (a different origin outright) without needing separate
// special-casing for each.
const PLACEHOLDER_ORIGIN = "http://localhost";

export function getSafeRedirectPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) {
    return "/";
  }

  let resolved: URL;
  try {
    resolved = new URL(next, PLACEHOLDER_ORIGIN);
  } catch {
    return "/";
  }

  if (resolved.origin !== PLACEHOLDER_ORIGIN) {
    return "/";
  }

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
