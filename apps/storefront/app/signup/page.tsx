"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { signup, sessionQueryKey } from "@/lib/auth";
import { getSafeRedirectPath } from "@/lib/safe-redirect";

// No native `required` on the inputs (deliberate): this page is meant to
// let the backend's own validation (and, for a duplicate email, Medusa's
// 401) drive the inline error message shown near the Email field. jsdom's
// constraint-validation on a `required` field can silently block form
// submission entirely in tests, which would mask that error path.
function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await signup(email, password);

    if (!result.ok) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    router.push(getSafeRedirectPath(searchParams.get("next")));
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Sign up</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="signup-email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded border px-3 py-2 text-sm"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="signup-password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded border px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Sign up
        </button>
      </form>
    </main>
  );
}

// useSearchParams() (for the `?next=` param) requires a Suspense boundary
// around any component that calls it, or `next build` bails out of static
// generation for the whole page — see
// https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout.
// This page has no other async data to unwrap, so an empty fallback (the
// searchParams read resolves synchronously on the client) is enough.
export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageContent />
    </Suspense>
  );
}
