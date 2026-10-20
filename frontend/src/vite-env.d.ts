/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Backend origin when it is hosted apart from the frontend, e.g. https://api.example.com
  readonly VITE_API_URL?: string
}
