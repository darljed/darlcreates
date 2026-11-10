import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Dev only: lets this MacBook's Tailscale hostname load /_next/* (HMR etc.).
  // Hostname only, no scheme/port. Restart `next dev` after changing.
  allowedDevOrigins: ["macbook-01.tail85990d.ts.net"],
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
