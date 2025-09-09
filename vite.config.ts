import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');

  // Validate and set default for AdGuard URL
  const adguardUrl = env.VITE_ADGUARD_MAIN_URL || `http://${env.VITE_DEFAULT_IP}:5213`;
  
  // Validate that we have a proper URL
  let validAdguardUrl: string;
  try {
    const url = new URL(adguardUrl);
    validAdguardUrl = url.origin;
  } catch (error) {
    validAdguardUrl = `http://${env.VITE_DEFAULT_IP}:5213`;
    console.warn(`[Vite] Invalid VITE_ADGUARD_MAIN_URL: ${adguardUrl}, using default: ${validAdguardUrl}`);
  }

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
          target: validAdguardUrl,
          changeOrigin: true,
          secure: false, // Allow self-signed certificates
          rewrite: (path) => path.replace(/^\/api\/adguard/, '/control'),
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              // Add Authorization header if available
              if (env.VITE_ADGUARD_MAIN_AUTH) {
                proxyReq.setHeader('Authorization', `Basic ${env.VITE_ADGUARD_MAIN_AUTH}`);
              }
            });
            proxy.on('error', (err, req, res) => {
              console.error(`[Proxy Error] AdGuard connection failed: ${err.message}`);
              if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
              }
            });
          },
        },
      },
    },
  }
})