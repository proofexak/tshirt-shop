Next.js App Router storefront for the t-shirt shop MVP.

## Develop

```bash
pnpm --filter storefront dev
```

Runs on http://localhost:8000 (not the Next.js default 3000 — the backend's
CORS config only allows 8000).

## Test

```bash
pnpm --filter storefront test
```

Vitest with jsdom + Testing Library. Positional args filter by filename, e.g.:

```bash
pnpm --filter storefront test medusa-client.test.ts Header.test.tsx
```

## Env

Copy `.env.example` to `.env.local` and fill in a real publishable API key from
the Medusa backend (`apps/backend`).
