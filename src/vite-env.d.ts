/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADGUARD_MAIN_URL: string
  readonly VITE_ADGUARD_MAIN_AUTH: string
  readonly VITE_TOR_RELAY_URL: string
  readonly MODE: 'development' | 'production' | 'test'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}