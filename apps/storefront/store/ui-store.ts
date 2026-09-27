import { create } from "zustand";

// UI-only state (spec: Zustand never holds cart line items — those are
// server-side state read via TanStack Query, see hooks/useCart.ts).
interface UiStore {
  isCartDrawerOpen: boolean;
  openCartDrawer: () => void;
  closeCartDrawer: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  isCartDrawerOpen: false,
  openCartDrawer: () => set({ isCartDrawerOpen: true }),
  closeCartDrawer: () => set({ isCartDrawerOpen: false }),
}));
