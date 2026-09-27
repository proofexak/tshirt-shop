"use client";

import { useCart } from "@/hooks/useCart";
import { useUiStore } from "@/store/ui-store";

export function CartIcon() {
  const { data: cart } = useCart();
  const openCartDrawer = useUiStore((state) => state.openCartDrawer);

  const itemCount = (cart?.items ?? []).reduce((sum, item) => sum + item.quantity, 0);

  return (
    <button type="button" onClick={openCartDrawer} aria-label="Open cart">
      Cart ({itemCount})
    </button>
  );
}
