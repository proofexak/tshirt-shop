// Imported for its SIDE EFFECT, and only by test files that exercise the
// real local Medusa backend (currently just cart.test.ts).
//
// vitest.config.mts sets a fixed, dummy `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`
// for every test file (Task 5's medusa-client.test.ts depends on that exact,
// deterministic env and must keep passing). cart.test.ts, however, drives
// `lib/cart.ts`'s calls through the shared `medusa` singleton
// (lib/medusa-client.ts) against the *real* running backend, which rejects
// the dummy key. So this module loads the real key from apps/storefront's
// gitignored `.env.local` into `process.env` before anything else in that
// test file's module graph runs.
//
// This only works because of a real ECMAScript module guarantee: when a
// file has multiple static imports, each imported module (and its own
// dependency subtree) is fully evaluated, in source order, before the
// importing file's own top-level code runs. So as long as
// `import "./test-support/live-backend-env"` appears *before*
// `import { ... } from "./cart"` in cart.test.ts, this file's
// `process.env` mutations are guaranteed to happen before
// `./medusa-client.ts` (imported transitively via `./cart.ts`) evaluates
// `new Medusa({ ... })` and bakes in the publishable key. Vitest resets the
// module registry per test file (the default `isolate: true`), so this
// re-runs fresh for cart.test.ts without affecting other files' imports of
// `./medusa-client.ts`.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// `import.meta.url` isn't reliably a `file://` URL for test files run
// through Vitest's Vite-powered transform pipeline (unlike vitest.config.mts,
// which Node loads directly) — so this resolves relative to the working
// directory instead, which `pnpm --filter storefront test` always sets to
// apps/storefront.
const envLocalPath = resolve(process.cwd(), ".env.local");

if (existsSync(envLocalPath)) {
  for (const line of readFileSync(envLocalPath, "utf-8").split("\n")) {
    const match = /^\s*([\w.-]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}
