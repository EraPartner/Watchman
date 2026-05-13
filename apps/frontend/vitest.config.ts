import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    globals: true,
    environment: "node",
    include: ["src/**/*.test.{ts,tsx,js}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx,js}", "src/main.tsx"],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 65,
        branches: 75,
      },
    },
    projects: [
      {
        test: {
          name: "node",
          include: ["src/**/*.test.{ts,js}"],
          environment: "node",
          alias: {
            "@": path.resolve(__dirname, "./src"),
          },
        },
      },
      {
        test: {
          name: "jsdom",
          include: ["src/**/*.test.tsx"],
          environment: "jsdom",
          environmentOptions: {
            jsdom: { url: "http://localhost/" },
          },
          alias: {
            "@": path.resolve(__dirname, "./src"),
          },
        },
      },
    ],
  },
});
