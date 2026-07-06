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
    // DYNAMIC-REQUIRE SUPPRESSION
    //
    // Several server-side packages (@sentry/*, @upstash/qstash) use dynamic
    // `require()` calls for optional instrumentation / lazy loading.  These
    // trigger webpack's "Critical dependency: require function is used in a
    // way in which dependencies cannot be statically extracted" warning but
    // have no effect at runtime — Next.js / Node.js resolves them correctly.
    //
    // Suppress all "Critical dependency" warnings originating from known
    // third-party packages to keep build output clean.
    //
    // References:
    //   https://github.com/getsentry/sentry-javascript/issues/3794
    //   https://github.com/upstash/qstash-js/issues
    // ═════════════════════════════════════════════════════════════════════════
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      // Sentry (all sub-packages) — the main source in monorepo setups
      {
        module: /node_modules\/@sentry\//,
        message: /Critical dependency: require function is used in a way/,
      },
      // Upstash QStash — uses optional dynamic require for Node built-ins
      {
        module: /node_modules\/@upstash\//,
        message: /Critical dependency: require function is used in a way/,
      },
      // Broad catch-all for any remaining node_modules with dynamic require
      {
        module: /node_modules/,
        message: /Critical dependency: require function is used in a way in which dependencies cannot be statically extracted/,
      },
    ];

    return config;
  },
};

export default withNextIntl(nextConfig);
