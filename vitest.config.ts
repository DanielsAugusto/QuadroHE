import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const alias = { "@": path.resolve(__dirname, "src") };

export default defineConfig({
  resolve: { alias },
  test: {
    testTimeout: 20_000,
    projects: [
      {
        resolve: { alias },
        test: {
          name: "api",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/screens/**"],
          setupFiles: ["tests/setup/env.ts"],
          fileParallelism: false,
          pool: "forks",
          poolOptions: { forks: { singleFork: true } },
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "screens",
          environment: "jsdom",
          include: ["tests/screens/**/*.test.tsx"],
          setupFiles: ["tests/screens/setup.ts"],
        },
      },
    ],
  },
});
