"use client";

import Link from "next/link";
import { useCart } from "@/hooks/useCart";
import { useUiStore } from "@/store/ui-store";

export function CartDrawer() {
  const isOpen = useUiStore((state) => state.isCartDrawerOpen);
  const closeCartDrawer = useUiStore((state) => state.closeCartDrawer);
  const { data: cart, isLoading } = useCart();

  if (!isOpen) {
    return null;
  }

  const items = cart?.items ?? [];

  return (
    <aside role="dialog" aria-label="Cart">
      <button type="button" onClick={closeCartDrawer}>
        Close
      </button>
      {isLoading && <p>Loading…</p>}
      {!isLoading && items.length === 0 && <p>Your cart is empty.</p>}
      {items.length > 0 && (
        <>
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                {item.title} × {item.quantity}
              </li>
            ))}
          </ul>
          <Link href="/checkout">Checkout</Link>
        </>
      )}
    </aside>
  );
}
