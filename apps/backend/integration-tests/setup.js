const { MetadataStorage } = require("@medusajs/framework/mikro-orm/core")

MetadataStorage.clear()

// @medusajs/test-utils builds its per-test database connection from
// DB_HOST/DB_USERNAME/DB_PASSWORD/DB_PORT env vars (not DATABASE_URL), and it
// reads them once at module load time, so they must be set before any spec
// file imports it. Derive them from the same DATABASE_URL the dev server
// uses so tests connect the same way (e.g. over a unix socket) without
// hardcoding a machine-specific path here.
if (process.env.DATABASE_URL && !process.env.DB_HOST) {
  try {
    const url = new URL(process.env.DATABASE_URL)
    process.env.DB_HOST = decodeURIComponent(url.hostname)
    process.env.DB_USERNAME = decodeURIComponent(url.username)
    if (url.password) {
      process.env.DB_PASSWORD = decodeURIComponent(url.password)
    }
    process.env.DB_PORT = url.port || "5432"
  } catch {
    // Leave env vars unset; @medusajs/test-utils falls back to its own
    // defaults (localhost:5432).
  }
}
