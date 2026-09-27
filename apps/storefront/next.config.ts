import type { NextConfig } from "next";

// Product photos are served straight off the Medusa backend's local file
// store (http://<host>:<port>/static/<file>, confirmed against the live
// dev DB in Task 13/14's reports). next/image only optimizes remote images
// whose origin+path is explicitly allowlisted, so this derives the pattern
// from the same env var the storefront already uses to talk to the backend
// rather than hard-coding localhost:9000 twice.
const backendUrl = new URL(process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: backendUrl.protocol.replace(":", "") as "http" | "https",
        hostname: backendUrl.hostname,
        port: backendUrl.port,
        pathname: "/static/**",
      },
    ],
  },
};

export default nextConfig;
