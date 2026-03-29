/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
  },

  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 604800,
    remotePatterns: [
      { protocol: "https", hostname: "**.formula1.com" },
      { protocol: "https", hostname: "media.formula1.com" },
      { protocol: "https", hostname: "**.motorsport.com" },
      { protocol: "https", hostname: "**.wikipedia.org" },
      { protocol: "https", hostname: "**.openf1.org" },
      { protocol: "https", hostname: "**.ergast.com" },
    ],
  },
};

export default nextConfig;
