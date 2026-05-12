import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Reduces dev-only UI surface; helps when devtools + cache get out of sync.
  devIndicators: false,
  async redirects() {
    return [
      // Browsers still request /favicon.ico; serve generated /icon instead of a missing static file.
      { source: "/favicon.ico", destination: "/icon", permanent: false },
    ];
  },
  // Webpack 5 disk cache logs this when large blobs are serialized — informational only, not a bug.
  // Lower infrastructure log level in dev so the terminal stays readable.
  webpack: (config, { dev }) => {
    if (dev) {
      config.infrastructureLogging = {
        ...config.infrastructureLogging,
        level: "error",
      };
    }
    return config;
  },
};

export default withNextIntl(nextConfig);
