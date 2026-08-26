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

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@agentflow/shared"],

  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  reactStrictMode: true,
  poweredByHeader: false,

  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
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
