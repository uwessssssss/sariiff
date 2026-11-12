/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't announce the framework in an X-Powered-By header.
  poweredByHeader: false,
  // Standard browser security headers for every page.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // Other sites can't keep a handle on our windows or embed our files.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
  // ESLint is left off the build because the bundled UI-component library
  // produces style-level lint noise (unused vars etc.) that aren't bugs.
  // TypeScript errors are NO LONGER ignored — real type-correctness is enforced.
  eslint: { ignoreDuringBuilds: true },
  // The app uses no next/image, so the image optimizer is switched off. It was open to any
  // host ("**"), and the optimizer is where Next.js's remote-code-execution and
  // denial-of-service advisories live (Nov 2026 review).
  images: { unoptimized: true },
  // (swcMinify / optimizeFonts removed: on by default in 14, and gone from Next 15)
  // Experimental features
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "framer-motion"],
  },
  // Webpack configuration for custom imports
  webpack: (config, { isServer }) => {
    // Handle figma:asset imports
    config.resolve.alias["figma:asset"] = false;
    return config;
  },
};

module.exports = nextConfig;
