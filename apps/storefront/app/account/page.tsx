"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth";
import { useOrders } from "@/hooks/useOrders";

// Minimal account page (spec: "past orders list only") — no profile
// editing, no addresses, nothing else.
export default function AccountPage() {
  const router = useRouter();
  const { data: session, isLoading: isSessionLoading } = useSession();
  const isAuthenticated = session != null;

  useEffect(() => {
    if (!isSessionLoading && !isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent("/account")}`);
    }
  }, [isSessionLoading, isAuthenticated, router]);

  const {
    data: orders,
    isLoading: isOrdersLoading,
    isError: isOrdersError,
  } = useOrders({ enabled: isAuthenticated });
  // Sorted here too (not just in lib/orders.ts's listCustomerOrders) so
  // "newest first" (ruling 3) is guaranteed by the page itself, not just an
  // upstream implementation detail this component happens to rely on.
  const sortedOrders = [...(orders ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  if (isSessionLoading || !isAuthenticated) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p>Loading…</p>
      </main>
    );
  }

  if (isOrdersLoading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p>Loading…</p>
      </main>
    );
  }

  if (isOrdersError) {
    // Distinct from the empty state (round-1 review finding): useOrders()
    // only throws for a genuine server-side failure — an unauthenticated
    // visitor never reaches this hook at all (redirected above), and the
    // route handler resolves "no session" as a 200 with `orders: []`.
    // Collapsing a real outage into "You haven't placed any orders yet."
    // would misinform a shopper who does have orders.
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-semibold">Something went wrong</h1>
        <p>We couldn&apos;t load your orders — please try again.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Your orders</h1>
      {sortedOrders.length === 0 ? (
        <p>You haven&apos;t placed any orders yet.</p>
      ) : (
        <ul className="divide-y">
          {sortedOrders.map((order) => {
            const formattedTotal = new Intl.NumberFormat("en", {
              style: "currency",
              currency: order.currency_code,
            }).format(order.total);
            const formattedDate = new Date(order.created_at).toLocaleDateString();

            return (
              <li key={order.id} className="flex items-center justify-between py-3">
                <div>
                  <Link href={`/order/${order.id}`} className="font-medium underline">
                    Order #<span>{order.display_id}</span>
                  </Link>
                  <p className="text-sm text-gray-600">{formattedDate}</p>
                </div>
                <p className="text-sm text-gray-600">{formattedTotal}</p>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
