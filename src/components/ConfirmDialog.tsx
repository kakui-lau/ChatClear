import { useEffect, useRef, useState } from 'react'

interface ConfirmDialogProps {
  count: number
  adminCount: number
  onCancel(): void
  onConfirm(): void
}

export function ConfirmDialog({ count, adminCount, onCancel, onConfirm }: ConfirmDialogProps) {
  const [confirmation, setConfirmation] = useState('')
  const expected = `退出 ${count} 个`
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
      <p className="eyebrow danger-eyebrow">IRREVERSIBLE ACTION</p>
      <h2 id="confirm-title">确认退出 {count} 个会话？</h2>
      <p id="confirm-description">
        私有群退出后可能无法重新加入。ChatClear 不会保存邀请链接，也无法撤销本次操作。
      </p>
      {adminCount > 0 ? (
        <div className="warning-box">所选项目中包含 {adminCount} 个你担任管理员的群组或频道。</div>
      ) : null}
      <label htmlFor="confirm-text">
        输入 <strong>{expected}</strong> 继续
      </label>
      <input
        id="confirm-text"
        autoFocus
        autoComplete="off"
        name="confirm-leave"
        spellCheck={false}
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
      />
      <div className="dialog-actions">
        <button className="secondary-button" type="button" onClick={onCancel}>
          取消
        </button>
        <button
          className="danger-button"
          disabled={confirmation !== expected}
          type="button"
          onClick={onConfirm}
        >
          开始退出
        </button>
      </div>
    </dialog>
  )
}
