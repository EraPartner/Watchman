import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      proxy: {
        // Proxy API requests to AdGuard Home to handle CORS and authentication
        '/api/adguard': {
          target: env.VITE_ADGUARD_MAIN_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/adguard/, '/control'),
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              // The proxy automatically adds the Authorization header from the environment variable
              if (env.VITE_ADGUARD_MAIN_AUTH) {
                proxyReq.setHeader('Authorization', `Basic ${env.VITE_ADGUARD_MAIN_AUTH}`);
              } else {
                console.warn('[Proxy] VITE_ADGUARD_MAIN_AUTH environment variable not found.');
              }
            });
            proxy.on('error', (err, req, res) => {
              console.error('[Proxy Error]', err);
            });
          },
        },
      },
    },
  }
})