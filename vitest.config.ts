import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // the server-only package throws outside a Next.js server context;
      // tests import provider code, so alias it to an empty module
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
});
