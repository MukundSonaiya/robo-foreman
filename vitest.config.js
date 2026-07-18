import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/**/*.test.js", "tests/**/*.test.js"],
    testTimeout: 15_000,
  },
});
