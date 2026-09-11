import { useEffect, useRef } from 'react'
import type { ActivityLogEntry, BatchAction, Locale } from '../../shared/contracts'
import { tx } from '../i18n'

interface HistoryDialogProps {
  entries: ActivityLogEntry[]
  locale: Locale
  onClose(): void
  onExport(): void
  onRetry(): void
}

const labels: Record<BatchAction, [string, string]> = {
  leave: ['退出', 'Leave'],
  archive: ['归档', 'Archive'],
  unarchive: ['取消归档', 'Unarchive'],
  mute: ['静音', 'Mute'],
  clearHistory: ['清除历史', 'Clear history']
}

export function HistoryDialog({ entries, locale, onClose, onExport, onRetry }: HistoryDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  return (
    <dialog ref={dialogRef} className="panel-dialog" onCancel={onClose}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">AUDIT LOG</p>
          <h2>{tx(locale, '本地操作历史', 'Local activity history')}</h2>
        </div>
        <button className="text-button" type="button" onClick={onClose}>
          {tx(locale, '关闭', 'Close')}
        </button>
      </div>
      <div className="panel-actions">
        <button className="secondary-button" type="button" onClick={onExport}>
          {tx(locale, '导出 CSV', 'Export CSV')}
        </button>
        <button className="secondary-button" type="button" onClick={onRetry}>
          {tx(locale, '重试上次失败项', 'Retry last failures')}
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="empty-copy">{tx(locale, '还没有操作记录。', 'No activity recorded yet.')}</p>
      ) : (
        <div className="history-list">
          {entries.map((entry) => (
            <article key={entry.id}>
              <span className={`history-status history-${entry.status}`}>
                {entry.status === 'success'
                  ? tx(locale, '成功', 'Success')
                  : tx(locale, '失败', 'Failed')}
              </span>
              <div>
                <strong>{entry.title}</strong>
                <p>
                  {locale === 'en' ? labels[entry.action][1] : labels[entry.action][0]} ·{' '}
                  {new Date(entry.createdAt).toLocaleString(locale)}
                </p>
                {entry.message ? <small>{entry.message}</small> : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </dialog>
  )
}
