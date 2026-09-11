import { safeStorage } from 'electron'

export const assertSecureStorageAvailable = (purpose: string): void => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(`系统安全存储不可用，无法安全${purpose}`)
  }

  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
    throw new Error(`系统密钥环不可用，无法安全${purpose}。请先启用 Secret Service`)
  }
}
