/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADGUARD_MAIN_URL: string;
  readonly VITE_ADGUARD_MAIN_AUTH: string;
  readonly VITE_TOR_RELAY_URL: string;
  readonly VITE_TOR_RELAY_NICKNAME: string;
  readonly VITE_TOR_METRICS_URL: string;
  readonly VITE_ADGUARD_DEFAULT_PORT: string;
  readonly VITE_TOR_DEFAULT_PORT: string;
  readonly VITE_DEFAULT_IP: string;
  readonly VITE_BACKEND_PORT: string;
  readonly VITE_FRONTEND_PORT: string;
  readonly MODE: "development" | "production" | "test";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
