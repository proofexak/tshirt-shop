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
// Round-1 fix: resolve `next` against a placeholder origin with the real
// URL parser and only accept it if the resolved origin is still the
// placeholder's.
//
// Round-2 review finding (Critical): that fix introduced a NEW open
// redirect. It returned the *normalized* `pathname + search + hash` — but
// dot-segment removal can turn an input that resolves same-origin on its
// FIRST parse into an output string that starts with "//" once returned
// and parsed AGAIN from scratch (which is exactly what router.push does:
// `new URL(href, location.href)`). E.g. `"/.//evil.com"` resolves same-
// origin here (dot-segment removal collapses "/." to "/", leaving a
// pathname of literally "//evil.com" — still just a path component of a
// URL whose authority was already "localhost"), but that returned STRING,
// re-parsed fresh, is protocol-relative and resolves off-site. Verified:
//
//   new URL("/.//evil.com", "http://localhost").pathname === "//evil.com"
//   new URL("//evil.com", "https://shop.example/signup").origin === "https://evil.com"
//
// Fix: don't just check the *input's* resolved origin — re-resolve the
// candidate OUTPUT string itself (the exact thing about to be returned and
// handed to router.push) and require that a fresh parse of it still lands
// on the placeholder origin. This is what actually matters, since it's the
// same operation router.push performs; checking the input alone only ever
// proved safety for that one parse, not for the string being handed onward.
const PLACEHOLDER_ORIGIN = "http://localhost";

function resolvesToPlaceholderOrigin(value: string): boolean {
  try {
    return new URL(value, PLACEHOLDER_ORIGIN).origin === PLACEHOLDER_ORIGIN;
  } catch {
    return false;
  }
}

export function getSafeRedirectPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) {
    return "/";
  }

  if (!resolvesToPlaceholderOrigin(next)) {
    return "/";
  }

  const resolved = new URL(next, PLACEHOLDER_ORIGIN);
  const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;

  // The round-2 check: re-resolve the OUTPUT, not the input. A fresh parse
  // of `path` must land on the same origin again, or it isn't safe to hand
  // to router.push (which will parse it fresh, exactly like this).
  if (!resolvesToPlaceholderOrigin(path)) {
    return "/";
  }

  return path;
}
