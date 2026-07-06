import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Minimal Vitest config — avoids importing from "vitest/config" so the file is
 * parseable by both npx vitest and the installed package without bundler issues.
 *
 * Alias "@/" → "src/" mirrors the tsconfig.json paths setting.
 * "server-only" is stubbed so Next.js server-only modules can be imported in tests.
 */
export default {
  resolve: {
    alias: {
      "@/": path.join(__dirname, "src") + "/",
      "server-only": path.join(__dirname, "supabase/tests/mocks/server-only.ts"),
    },
  },
  test: {
    globals: false,
    environment: "node",
  },
};
