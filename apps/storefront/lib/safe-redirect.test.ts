import { describe, expect, test } from "vitest";
import { getSafeRedirectPath } from "./safe-redirect";

// The real app's origin, used to re-resolve getSafeRedirectPath's output
// exactly the way router.push (`new URL(href, location.href)`) would.
// Round-2 review finding: checking literal expected strings alone missed a
// case where the fix's own OUTPUT was itself unsafe — a test asserting
// "the output, re-parsed fresh, still lands on our origin" is what
// actually matters, and is what would have caught it.
const REAL_ORIGIN = "https://shop.example";
const REAL_BASE = `${REAL_ORIGIN}/signup`;

function reresolvedOrigin(output: string): string {
  return new URL(output, REAL_BASE).origin;
}

describe("getSafeRedirectPath", () => {
  test("returns / when next is missing", () => {
    expect(getSafeRedirectPath(null)).toBe("/");
    expect(getSafeRedirectPath(undefined)).toBe("/");
    expect(getSafeRedirectPath("")).toBe("/");
  });

  test("allows a same-origin relative path", () => {
    expect(getSafeRedirectPath("/account")).toBe("/account");
    expect(getSafeRedirectPath("/checkout?step=2")).toBe("/checkout?step=2");
  });

  test("rejects an absolute URL", () => {
    expect(getSafeRedirectPath("https://evil.com")).toBe("/");
    expect(getSafeRedirectPath("http://evil.com/account")).toBe("/");
  });

  test("rejects a protocol-relative URL", () => {
    expect(getSafeRedirectPath("//evil.com")).toBe("/");
  });

  test("rejects backslash-based host-confusion variants", () => {
    expect(getSafeRedirectPath("/\\evil.com")).toBe("/");
    expect(getSafeRedirectPath("\\\\evil.com")).toBe("/");
  });

  // Round-1 review finding: URLSearchParams.get("next") already
  // percent-decodes the raw query value, so a query string of
  // `?next=/%09/evil.com` arrives here as the literal string
  // "/\t/evil.com" — a naive string-prefix check ("starts with /", "not
  // //", "not /\\") lets this through, but the WHATWG URL parser (the same
  // one Next's router uses to resolve router.push's href) strips the tab
  // and resolves it to a *different origin*. These cases all pass the old
  // string checks and must still resolve back to "/".
  test("rejects a tab/newline-smuggled host-confusion variant", () => {
    expect(getSafeRedirectPath("/\t/evil.com")).toBe("/");
    expect(getSafeRedirectPath("/\n/evil.com")).toBe("/");
    expect(getSafeRedirectPath("/\r/evil.com")).toBe("/");
    expect(getSafeRedirectPath("/\t\\evil.com")).toBe("/");
  });

  test("rejects a javascript: URL even when it starts with a slash-like prefix", () => {
    expect(getSafeRedirectPath("javascript:alert(1)")).toBe("/");
    // Not slash-prefixed at all, but worth pinning: control chars can't turn
    // a non-"/"-starting value into one the URL parser then reclassifies.
    expect(getSafeRedirectPath("/\tjavascript:alert(1)")).not.toMatch(/^javascript:/);
  });

  test("preserves hash and query on an otherwise-safe path", () => {
    expect(getSafeRedirectPath("/account#profile")).toBe("/account#profile");
    expect(getSafeRedirectPath("/checkout?step=2#top")).toBe("/checkout?step=2#top");
  });

  // Round-2 review finding (Critical): the round-1 fix checked the INPUT's
  // resolved origin, then returned the normalized pathname+search+hash —
  // but dot-segment removal (and percent-encoded dot segments) can turn an
  // input that resolves same-origin on its own first parse into an OUTPUT
  // string that is itself protocol-relative once returned and parsed again
  // fresh. E.g. "/.//evil.com" resolves same-origin on the first parse
  // (dot-segment removal collapses "/." to "/", leaving a pathname of
  // literally "//evil.com" — still just a path component of a URL whose
  // authority was already resolved), but that returned STRING, re-parsed
  // fresh by router.push, is protocol-relative and resolves off-site.
  // Verified empirically before the round-2 fix:
  //   new URL("/.//evil.com", "http://localhost").pathname === "//evil.com"
  //   new URL("//evil.com", "https://shop.example/signup").origin === "https://evil.com"
  test("rejects dot-segment / percent-encoded variants that normalize into a protocol-relative output", () => {
    expect(getSafeRedirectPath("/.//evil.com")).toBe("/");
    expect(getSafeRedirectPath("/..//evil.com")).toBe("/");
    expect(getSafeRedirectPath("/%2e//evil.com")).toBe("/");
    expect(getSafeRedirectPath("/a/..//evil.com")).toBe("/");
    expect(getSafeRedirectPath("/./\\evil.com")).toBe("/");
  });

  // The property that actually matters, per the round-2 finding: not "does
  // the output match this expected string" but "does re-parsing the output
  // — exactly what router.push does — always land back on our own origin,
  // for every hostile input we can think of". A table-driven check over a
  // deliberately wide set of inputs, rather than one-off string assertions,
  // is what would have caught the round-2 regression in the first place.
  const HOSTILE_INPUTS = [
    "https://evil.com",
    "http://evil.com/account",
    "//evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/\r/evil.com",
    "/\t\\evil.com",
    "/\tjavascript:alert(1)",
    "javascript:alert(1)",
    "/.//evil.com",
    "/..//evil.com",
    "/%2e//evil.com",
    "/a/..//evil.com",
    "/./\\evil.com",
    "/..%2f..%2fevil.com",
    "/%2e%2e//evil.com",
  ];

  test.each(HOSTILE_INPUTS)(
    "hostile input %j always re-resolves to this app's own origin, never off-site",
    (input) => {
      const output = getSafeRedirectPath(input);
      expect(reresolvedOrigin(output)).toBe(REAL_ORIGIN);
    }
  );

  const SAFE_INPUTS = ["/", "/account", "/checkout?step=2", "/account#profile", "/checkout?step=2#top"];

  test.each(SAFE_INPUTS)("safe input %j is preserved and still re-resolves to this app's own origin", (input) => {
    const output = getSafeRedirectPath(input);
    expect(output).toBe(input);
    expect(reresolvedOrigin(output)).toBe(REAL_ORIGIN);
  });
});
