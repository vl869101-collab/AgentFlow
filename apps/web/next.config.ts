import path from "node:path";
import type { NextConfig } from "next";

function apiOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").origin;
  } catch {
    return "'self'";
  }
}

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.cdnfonts.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.cdnfonts.com",
      `connect-src 'self' ${apiOrigin()}`,
      ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" }]
    : []),
];

const isDockerOrLinux = process.env.DOCKER_BUILD === "true" || process.platform !== "win32";

const nextConfig: NextConfig = {
  ...(isDockerOrLinux ? { output: "standalone" } : {}),
  transpilePackages: ["@agentflow/shared"],
  compress: true,

  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  reactStrictMode: true,
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/_next/image/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/fonts/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },

  // Turbopack workspace root configuration
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
};

export default async function configPromise() {
  if (process.env.ANALYZE === "true") {
    try {
      const bundleAnalyzer = (await import("@next/bundle-analyzer")).default;
      return bundleAnalyzer({ enabled: true })(nextConfig);
    } catch {
      return nextConfig;
    }
  }
  return nextConfig;
}
