import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.118", "192.168.56.1"],
  // Geen X-Powered-By header (minder vingerprinting).
  poweredByHeader: false,
  // Security headers op app-niveau zodat bescherming niet alleen van
  // nginx afhangt (dev/staging/next start direct). CSP volgt als aparte
  // stap — Leaflet tiles + Next scripts vragen een doordachte policy.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // geolocation=(self): "Deel mijn locatie" en locate-knop hebben dit nodig.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
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
