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
});
