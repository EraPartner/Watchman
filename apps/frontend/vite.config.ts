import { defineConfig, loadEnv } from "vite";
import type { ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/** Top-level backend route prefixes that should be proxied to the Fastify
 *  backend in dev + preview. Keep in sync with backend transport routes. */
const BACKEND_PREFIXES: ReadonlyArray<string> = [
  "/meta",
  "/services",
  "/instances",
  "/kinds",
  "/metrics",
  "/setup",
  "/config",
];

function backendProxyRules(): Record<string, ProxyOptions> {
  const httpRule: ProxyOptions = {
    target: "http://localhost:3001",
    changeOrigin: true,
    secure: false,
  };
  const rules: Record<string, ProxyOptions> = {
    "/ws": {
      target: "http://localhost:3001",
      ws: true,
      changeOrigin: true,
    },
    "/api": httpRule,
  };
  for (const prefix of BACKEND_PREFIXES) {
    rules[prefix] = httpRule;
  }
  return rules;
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react({
        // Enable React Fast Refresh
        fastRefresh: true,
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: parseInt(env.VITE_FRONTEND_PORT) || 5173,
      host: true,
      strictPort: true,
      // Allow access from both localhost and production domain
      allowedHosts: [
        "localhost",
        ".localhost",
        "watchman.tornostrtorrent.win",
        ".tornostrtorrent.win",
      ],
      // Enable HMR over network
      hmr: {
        port: parseInt(env.VITE_HMR_PORT) || 24678,
      },
      // Proxy API calls to backend server.
      // The backend exposes resources at the root (e.g. /services, /instances)
      // so we proxy each top-level prefix the backend owns. Adding new
      // top-level routes to the backend requires updating this list.
      proxy: backendProxyRules(),
    },
    preview: {
      port: parseInt(env.VITE_PREVIEW_PORT) || 4173,
      strictPort: false,
      proxy: backendProxyRules(),
      // Security headers for dev server
      headers: {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
      },
    },
    build: {
      // Remove console logs in production
      minify: "terser",
      terserOptions: {
        compress: {
          drop_console: mode === "production",
          drop_debugger: mode === "production",
        },
      },
      // Improve chunk splitting for better caching
      rollupOptions: {
        output: {
          manualChunks(id) {
            const moduleId = id.replaceAll("\\", "/");
            if (
              moduleId.includes("/node_modules/react/") ||
              moduleId.includes("/node_modules/react-dom/") ||
              moduleId.includes("/node_modules/react-router/") ||
              moduleId.includes("/node_modules/react-router-dom/")
            ) {
              return "vendor";
            }
            if (moduleId.includes("/node_modules/@radix-ui/")) {
              return "ui";
            }
            if (moduleId.includes("/node_modules/@tanstack/")) {
              return "query";
            }
            return undefined;
          },
          // Security: Don't expose source paths in production
          ...(mode === "production" && {
            entryFileNames: "assets/[name].[hash].js",
            chunkFileNames: "assets/[name].[hash].js",
            assetFileNames: "assets/[name].[hash].[ext]",
          }),
        },
      },
      // Source maps only in development
      sourcemap: mode === "development",
      // Target modern browsers for better performance
      target: "esnext",
      // Increase chunk size warning limit
      chunkSizeWarningLimit: 1000,
      // Enable CSS code splitting
      cssCodeSplit: true,
    },
    // Prevent accidental exposure of env vars
    envPrefix: ["VITE_"],
    // Optimize dependencies
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-router-dom",
        "@tanstack/react-query",
      ],
    },
    // Performance optimizations
    worker: {
      format: "es",
    },
    css: {
      devSourcemap: mode === "development",
    },
  };
});
