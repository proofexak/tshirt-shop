"use client";

import Link from "next/link";
import { useProducts } from "@/hooks/useProducts";

export default function Home() {
  const { data: products, isLoading, isError } = useProducts();

  if (isLoading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <p>Loading products…</p>
      </main>
    );
  }

  if (isError || !products) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <p>Sorry, we couldn&apos;t load the catalog right now.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Shop</h1>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {products.map((product) => (
          <li key={product.id}>
            <Link
              href={`/products/${product.handle}`}
              className="block rounded border border-gray-200 p-4 hover:border-gray-400"
            >
              {product.title}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
