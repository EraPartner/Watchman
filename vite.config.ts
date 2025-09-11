import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react({
        // Enable React Fast Refresh
        fastRefresh: true,
        // Remove React DevTools in production
        babel: {
          plugins: mode === 'production' ? [
            ['transform-react-remove-prop-types', { removeImport: true }]
          ] : []
        }
      })
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
      // Enable HMR over network
      hmr: {
        port: parseInt(env.VITE_HMR_PORT) || 24678,
      },
    },
    build: {
      // Remove console logs in production
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: mode === 'production',
          drop_debugger: true,
          pure_funcs: mode === 'production' ? ['console.log', 'console.info'] : [],
        },
      },
      // Improve chunk splitting for better caching
      rollupOptions: {
        output: {
          manualChunks: {
            // Vendor chunks for better caching
            'react-vendor': ['react', 'react-dom'],
            'router': ['react-router-dom'],
            'query': ['@tanstack/react-query'],
            'ui-vendor': ['lucide-react', '@radix-ui/react-progress', '@radix-ui/react-toast', '@radix-ui/react-tooltip'],
            'utils': ['clsx', 'tailwind-merge', 'class-variance-authority'],
          },
          // Optimize chunk naming for better caching
          chunkFileNames: (chunkInfo) => {
            return `assets/js/[name]-[hash].js`;
          },
          assetFileNames: (assetInfo) => {
            const info = assetInfo.name.split('.');
            const ext = info[info.length - 1];
            if (/\.(css)$/.test(assetInfo.name)) {
              return `assets/css/[name]-[hash].${ext}`;
            }
            if (/\.(png|jpe?g|svg|gif|tiff|bmp|ico|webp)$/i.test(assetInfo.name)) {
              return `assets/images/[name]-[hash].${ext}`;
            }
            return `assets/[name]-[hash].${ext}`;
          },
        },
      },
      // Source maps only in development
      sourcemap: mode !== 'production',
      // Target modern browsers for better performance
      target: 'esnext',
      // Increase chunk size warning limit
      chunkSizeWarningLimit: 1000,
      // Enable CSS code splitting
      cssCodeSplit: true,
    },
    // Prevent accidental exposure of env vars
    envPrefix: 'VITE_',
    // Optimize dependencies
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        '@tanstack/react-query',
        'lucide-react',
        'clsx',
        'tailwind-merge'
      ],
      exclude: ['@tanstack/react-query-devtools']
    },
    // Enable esbuild for faster builds
    esbuild: {
      target: 'esnext',
      drop: mode === 'production' ? ['console', 'debugger'] : [],
    },
    // Performance optimizations
    worker: {
      format: 'es'
    },
    css: {
      devSourcemap: mode === 'development'
    }
  }
})