import { useEffect, useRef, useState } from 'react'
import { SPONSOR_ADDRESS, type Locale } from '../../shared/contracts'
import { tx } from '../i18n'

interface SupportDialogProps {
  locale: Locale
  onClose(): void
  onCopySponsor(): Promise<void>
  onOpenTelegram(): void
}

export function SupportDialog({
  locale,
  onClose,
  onCopySponsor,
  onOpenTelegram
}: SupportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  const copySponsorAddress = () => {
    void onCopySponsor()
      .then(() => setCopied(true))
      .catch(() => undefined)
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="support-title"
      className="panel-dialog support-dialog"
      onCancel={onClose}
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">CONTACT & SUPPORT</p>
          <h2 id="support-title">{tx(locale, '联系与支持', 'Contact & support')}</h2>
        </div>
        <button className="text-button" type="button" onClick={onClose}>
          {tx(locale, '关闭', 'Close')}
        </button>
      </div>

      <section className="support-section">
        <div>
          <strong>{tx(locale, 'Telegram 联系', 'Telegram contact')}</strong>
          <p>
            {tx(
              locale,
              '反馈问题、提出建议或交流使用体验。',
              'Report an issue, suggest an improvement, or share feedback.'
            )}
          </p>
        </div>
        <button className="primary-button compact-button" type="button" onClick={onOpenTelegram}>
          @tg_kakui
        </button>
      </section>

      <section className="support-section sponsor-section">
        <div>
          <strong>{tx(locale, '赞助 ChatClear', 'Sponsor ChatClear')}</strong>
          <p>
            {tx(
              locale,
              '如果这个工具帮到了你，可以支持后续维护。转账前请自行确认网络与地址。',
              'If ChatClear saves you time, you can support its maintenance. Verify the network and address before transferring.'
            )}
          </p>
        </div>
        <code>{SPONSOR_ADDRESS}</code>
        <button className="secondary-button" type="button" onClick={copySponsorAddress}>
          {copied ? tx(locale, '已复制', 'Copied') : tx(locale, '复制地址', 'Copy address')}
        </button>
      </section>
    </dialog>
  )
}
