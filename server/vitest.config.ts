import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Each suite builds its own temporary database; running them in one
    // process keeps SQLite file handles predictable on Windows.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
