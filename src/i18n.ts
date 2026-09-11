import type { Locale } from '../shared/contracts'

export const tx = (locale: Locale, chinese: string, english: string): string =>
  locale === 'en' ? english : chinese
