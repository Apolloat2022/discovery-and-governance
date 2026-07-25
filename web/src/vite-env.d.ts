/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute backend origin in production (e.g. https://prism-api.onrender.com). Unset locally — Vite's dev proxy handles /api instead. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
