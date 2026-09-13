import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pdfjs-dist", "yauzl", "saxes"],
  outputFileTracingIncludes: {
    "/api/admin/survey-imports": [
      "./src/lib/server/imports/extract-worker.mjs",
      "./node_modules/pdfjs-dist/**",
      "./node_modules/yauzl/**",
      "./node_modules/saxes/**",
      "./node_modules/xmlchars/**",
      "./node_modules/pend/**",
      "./node_modules/buffer-crc32/**",
      "./node_modules/@napi-rs/canvas*/**",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
