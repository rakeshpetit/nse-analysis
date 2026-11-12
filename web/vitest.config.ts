import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so tests do not load the React Router plugin.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
