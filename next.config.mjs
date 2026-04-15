/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
  },

  async headers() {
    return [
      {
        // Allow /embed/* to be loaded in any iframe (for blog/Reddit embeds)
        source: "/embed/:path*",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
          },
        ],
      },
    ];
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
