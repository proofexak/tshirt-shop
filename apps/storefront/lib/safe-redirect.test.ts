import { describe, expect, test } from "vitest";
import { getSafeRedirectPath } from "./safe-redirect";

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
});
