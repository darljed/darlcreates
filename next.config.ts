import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // A clicker design with a traced picture can be a few MB of JSON (MAX_ADD_JSON in src/lib/clicker/spec.ts is 3.5 MB)
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // Dev only: lets this MacBook's Tailscale hostname load /_next/* (HMR etc.).
  // Hostname only, no scheme/port. Restart `next dev` after changing.
  allowedDevOrigins: ["macbook-01.tail85990d.ts.net"],
  async headers() {
    return [
      {
        // the worker file itself must never be served from a stale cache, or users stay on an old version
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
