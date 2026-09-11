/// <reference types="vite/client" />

import type { ChatClearApi } from '../shared/contracts'

declare global {
  interface ImportMetaEnv {
    readonly DEV: boolean
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }

  interface Window {
    chatclear: ChatClearApi
  }
}

export {}
