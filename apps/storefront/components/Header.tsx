import type { ReactNode } from "react";
import Link from "next/link";

export function SignupLoginLinks() {
  return (
    <>
      <Link href="/signup">Sign up</Link>
      <Link href="/login">Login</Link>
    </>
  );
}

export function Header({ rightSlot = <SignupLoginLinks /> }: { rightSlot?: ReactNode }) {
  return (
    <header>
      <nav>
        <Link href="/">Home</Link>
        <div>{rightSlot}</div>
      </nav>
    </header>
  );
}
