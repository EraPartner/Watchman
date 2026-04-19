import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

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
      // Proxy API calls to backend server
      proxy: {
        "/api": {
          target: "http://localhost:3001",
          changeOrigin: true,
          secure: false,
        },
        "/ws": {
          target: "http://localhost:3001",
          ws: true,
          changeOrigin: true,
        },
      },
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
          manualChunks: {
            // Vendor chunk for better caching
            vendor: ["react", "react-dom", "react-router-dom"],
            ui: [
              "@radix-ui/react-dialog",
              "@radix-ui/react-tabs",
              "@radix-ui/react-tooltip",
            ],
            query: ["@tanstack/react-query"],
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
    // Enable esbuild for faster builds
    esbuild: {
      target: "esnext",
      drop: mode === "production" ? ["console", "debugger"] : [],
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
