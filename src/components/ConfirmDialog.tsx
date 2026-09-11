import { useEffect, useRef, useState } from 'react'
import type { BatchAction, Locale } from '../../shared/contracts'
import { tx } from '../i18n'

interface ConfirmDialogProps {
  action: BatchAction
  count: number
  adminCount: number
  filterSummary: string[]
  locale: Locale
  onCancel(): void
  onConfirm(): void
}

const actionName = (locale: Locale, action: BatchAction, titleCase = false): string => {
  const labels: Record<BatchAction, [string, string, string]> = {
    leave: ['退出', 'leave', 'Leave'],
    archive: ['归档', 'archive', 'Archive'],
    unarchive: ['取消归档', 'unarchive', 'Unarchive'],
    mute: ['静音', 'mute', 'Mute'],
    clearHistory: ['清除历史', 'clear history', 'Clear history for']
  }
  const label = labels[action]
  return locale === 'en' ? label[titleCase ? 2 : 1] : label[0]
}

export function ConfirmDialog({
  action,
  count,
  adminCount,
  filterSummary,
  locale,
  onCancel,
  onConfirm
}: ConfirmDialogProps) {
  const [confirmation, setConfirmation] = useState('')
  const destructive = action === 'leave' || action === 'clearHistory'
  const verb = actionName(locale, action)
  const titleVerb = actionName(locale, action, true)
  const itemLabel = count === 1 ? 'conversation' : 'conversations'
  const expected = locale === 'en' ? `${verb} ${count}` : `${verb} ${count} 个`
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    return () => dialog.close()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      aria-describedby="confirm-description"
      aria-labelledby="confirm-title"
      className="confirm-dialog"
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      <p className={`eyebrow ${destructive ? 'danger-eyebrow' : ''}`}>
        {destructive ? 'IRREVERSIBLE ACTION' : 'REVIEW ACTION'}
      </p>
      <h2 id="confirm-title">
        {tx(locale, `确认${verb} ${count} 个会话？`, `${titleVerb} ${count} ${itemLabel}?`)}
      </h2>
      <p id="confirm-description">
        {action === 'leave'
          ? tx(
              locale,
              '私有群退出后可能无法重新加入；群主会话会被强制跳过。',
              'Private groups may not be joinable again; owner conversations are always skipped.'
            )
          : action === 'clearHistory'
            ? tx(
                locale,
                '只清除你本人的聊天历史并保留群组，此操作无法撤销。',
                'This clears your local chat history while keeping membership. It cannot be undone.'
              )
            : tx(
                locale,
                '该操作可以稍后在 Telegram 或 ChatClear 中调整。',
                'You can adjust this later in Telegram or ChatClear.'
              )}
      </p>
      {filterSummary.length > 0 ? (
        <div className="rule-preview">
          <strong>{tx(locale, '当前筛选规则', 'Current filter rules')}</strong>
          <ul>
            {filterSummary.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {adminCount > 0 ? (
        <div className="warning-box">
          {tx(
            locale,
            `所选项目包含 ${adminCount} 个管理员会话。`,
            `${adminCount} selected conversations have administrator access.`
          )}
        </div>
      ) : null}
      {destructive ? (
        <>
          <label htmlFor="confirm-text">
            {tx(locale, '输入', 'Type')} <strong>{expected}</strong>{' '}
            {tx(locale, '继续', 'to continue')}
          </label>
          <input
            id="confirm-text"
            autoFocus
            autoComplete="off"
            name="confirm-action"
            spellCheck={false}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </>
      ) : null}
      <div className="dialog-actions">
        <button className="secondary-button" type="button" onClick={onCancel}>
          {tx(locale, '取消', 'Cancel')}
        </button>
        <button
          className={destructive ? 'danger-button' : 'primary-button compact-button'}
          disabled={destructive && confirmation !== expected}
          type="button"
          onClick={onConfirm}
        >
          {tx(locale, `开始${verb}`, 'Confirm & run')}
        </button>
      </div>
    </dialog>
  )
}
