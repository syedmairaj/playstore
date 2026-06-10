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

    // ═════════════════════════════════════════════════════════════════════════
    // SENTRY DYNAMIC REQUIRE SUPPRESSION
    //
    // Sentry uses dynamic require in @sentry/node for optional instrumentation.
    // This triggers webpack's dependency scanner warning but doesn't affect runtime.
    // Safely suppress the warning to keep build logs clean.
    //
    // Reference: https://github.com/getsentry/sentry-javascript/issues/3794
    // ═════════════════════════════════════════════════════════════════════════
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /node_modules\/@sentry\/node/,
        message: /Critical dependency: require function is used in a way/,
      },
    ];

    return config;
  },
};

export default withNextIntl(nextConfig);
