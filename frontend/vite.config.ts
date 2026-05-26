import path from "path";
import { fileURLToPath } from "url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
      },
    },
  },
  // OXC Linter — Rust-based, fast
  lint: {
    categories: {
      correctness: "error",
      suspicious: "warn",
      pedantic: "off",
    },
    plugins: ["typescript", "react", "unicorn", "import"],
    rules: {
      "no-console": "warn",
      "no-unused-vars": "error",
    },
  },

  // OXC Formatter — Rust-based, fast
  fmt: {
    printWidth: 100,
    semi: true,
    singleQuote: false,
    trailingComma: "all",
  },

  // Vitest
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
