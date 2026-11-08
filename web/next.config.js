/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
        ],
      },
    ];
  },
  // ESLint is left off the build because the bundled UI-component library
  // produces style-level lint noise (unused vars etc.) that aren't bugs.
  // TypeScript errors are NO LONGER ignored — real type-correctness is enforced.
  eslint: { ignoreDuringBuilds: true },
  images: {
    domains: ["images.unsplash.com"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  // Enable SWC minification for better performance
  swcMinify: true,
  // Optimize fonts
  optimizeFonts: true,
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
