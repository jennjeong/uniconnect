/// <reference types="vite/client" />

interface ImportMetaEnv {
  // 프런트엔드와 따로 호스팅할 때의 백엔드 오리진. 예: https://api.example.com
  readonly VITE_API_URL?: string
}
