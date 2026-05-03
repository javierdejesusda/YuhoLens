import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/unit/**/*.{test,spec}.{ts,tsx}",
      "components/**/__tests__/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: ["node_modules/**", "tests/e2e/**", ".next/**", "out/**"],
  },
});
