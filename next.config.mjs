// In `next dev` we use the better-sqlite3 fallback in lib/f1db/client.ts
// against the local .cache/f1db/driver_stats.db. Enable OpenNext's dev D1
// shim only when we explicitly want to test the Workers path locally
// (via `npm run preview`).
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

if (process.env.USE_OPENNEXT_DEV === '1') {
  initOpenNextCloudflareForDev()
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false,
  },
}

export default nextConfig
