import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: parseInt(env.VITE_FRONTEND_PORT) || 5173,
      host: true,
      strictPort: true,
    },
    build: {
      // Remove console logs in production
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: mode === 'production',
          drop_debugger: true,
        },
      },
      // Improve chunk splitting for better caching
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            router: ['react-router-dom'],
            ui: ['lucide-react', '@radix-ui/react-progress', '@radix-ui/react-toast'],
          },
        },
      },
      // Source maps only in development
      sourcemap: mode !== 'production',
    },
    // Prevent accidental exposure of env vars
    envPrefix: 'VITE_',
  }
})