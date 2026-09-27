"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { logout, sessionQueryKey, useSession } from "@/lib/auth";

// Replaces Header.tsx's <SignupLoginLinks /> in the rightSlot (layout.tsx) —
// Header.tsx itself is untouched, this only swaps which component the
// layout passes in. Logged-out state keeps the same link names/hrefs
// SignupLoginLinks used, so nothing downstream (e.g. Task 12's e2e) that
// clicks "Sign up" breaks.
export function AuthLinks() {
  const { data: customer, isLoading } = useSession();
  const queryClient = useQueryClient();

  if (isLoading) {
    return null;
  }

  if (!customer) {
    return (
      <>
        <Link href="/signup">Sign up</Link>
        <Link href="/login">Login</Link>
      </>
    );
  }

  async function handleLogout() {
    await logout();
    await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
  }

  return (
    <>
      <Link href="/account">Account</Link>
      <button type="button" onClick={handleLogout}>
        Log out
      </button>
    </>
  );
}
