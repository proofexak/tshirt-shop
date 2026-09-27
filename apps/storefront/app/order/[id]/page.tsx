"use client";

import { Suspense, use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth";
import { useOrder } from "@/hooks/useOrder";

function OrderPageContent({ id }: { id: string }) {
  const router = useRouter();
  const { data: session, isLoading: isSessionLoading } = useSession();
  // Controller ruling 1: this page requires a session — checkout only ever
  // reaches it after a logged-in payment, but the URL itself is guessable,
  // so an unauthenticated visitor is redirected the same way Task 8's
  // pages send visitors who need to log in first.
  const isAuthenticated = session != null;

  useEffect(() => {
    if (!isSessionLoading && !isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(`/order/${id}`)}`);
    }
  }, [isSessionLoading, isAuthenticated, id, router]);

  const {
    data: order,
    isLoading: isOrderLoading,
    isError: isOrderError,
  } = useOrder(id, { enabled: isAuthenticated });

  if (isSessionLoading || !isAuthenticated) {
    // Either still resolving the session, or redirecting away (the effect
    // above fires after this render) — nothing to show either way.
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p>Loading…</p>
      </main>
    );
  }

  if (isOrderLoading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p>Loading…</p>
      </main>
    );
  }

  if (isOrderError) {
    // Distinct from "not found" (round-1 review finding): useOrder() only
    // throws for a genuine server-side failure — the route handler already
    // resolves every "can't show this" case (no session, doesn't exist,
    // malformed id, someone else's order) as a 200 with `order: null`,
    // handled below. Collapsing both into the same "Order not found"
    // message would hide a real backend outage from the shopper who just
    // paid.
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-semibold">Something went wrong</h1>
        <p>We couldn&apos;t load your order — please try again.</p>
      </main>
    );
  }

  if (!order) {
    // Deliberately the same message whether the order doesn't exist, the
    // id is malformed, or it belongs to someone else — see
    // lib/orders.ts's getOrderForCustomer for why those are indistinguishable
    // by design.
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-semibold">Order not found</h1>
        <p>Sorry, we couldn&apos;t find that order.</p>
      </main>
    );
  }

  const formattedTotal = new Intl.NumberFormat("en", {
    style: "currency",
    currency: order.currency_code,
  }).format(order.total);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-semibold">Order confirmed</h1>
      <p className="mb-6 text-sm text-gray-600">
        Order #<span>{order.display_id}</span>
      </p>

      <ul className="mb-6 divide-y">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium">{item.title}</p>
              {item.variant_title && <p className="text-sm text-gray-600">{item.variant_title}</p>}
            </div>
            <p className="text-sm text-gray-600">Qty {item.quantity}</p>
          </li>
        ))}
      </ul>

      <p className="text-lg font-semibold">Total: {formattedTotal}</p>
    </main>
  );
}

// `use(params)` suspends the component until the promise settles, so the
// Suspense boundary must be an ancestor of whatever calls it — mirrors
// app/products/[handle]/page.tsx's ProductPageParams wrapper exactly.
function OrderPageParams({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: (id: string) => React.ReactNode;
}) {
  const { id } = use(params);
  return children(id);
}

// Next 16: `params` is a Promise. This is a Client Component (session/order
// reads are client-side via TanStack Query, same as the product page), so
// `params` is unwrapped with React's `use()` rather than `await`.
export default function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-2xl px-4 py-8">
          <p>Loading…</p>
        </main>
      }
    >
      <OrderPageParams params={params}>{(id) => <OrderPageContent id={id} />}</OrderPageParams>
    </Suspense>
  );
}
