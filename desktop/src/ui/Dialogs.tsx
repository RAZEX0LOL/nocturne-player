import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { t } from '../i18n'

/**
 * Диалоги — ContentDialog Windows и лист Mac: заголовок, текст или поле, кнопки справа внизу.
 * Вызываются как обещание: `await askText(...)` вернёт строку или null, если передумали.
 */

type Request =
  | { kind: 'info'; title: string; message: string; diagnostics: string; confirm: string; resolve: (value: boolean) => void }
  | { kind: 'text'; title: string; label?: string; initial: string; confirm: string; resolve: (value: string | null) => void }
  | { kind: 'confirm'; title: string; message: string; confirm: string; danger: boolean; resolve: (value: boolean) => void }

let current: Request | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

function show(request: Request) {
  current = request
  emit()
}

export function askText(title: string, options: { label?: string; initial?: string; confirm?: string } = {}) {
  return new Promise<string | null>((resolve) =>
    show({ kind: 'text', title, label: options.label, initial: options.initial ?? '', confirm: options.confirm ?? t('Сохранить'), resolve }),
  )
}

export function confirmAction(title: string, message: string, options: { confirm?: string; danger?: boolean } = {}) {
  return new Promise<boolean>((resolve) =>
    show({ kind: 'confirm', title, message, confirm: options.confirm ?? t('Да'), danger: options.danger ?? false, resolve }),
  )
}

export function showInformation(title: string, message: string, diagnostics: string) {
  show({ kind: 'info', title, message, diagnostics, confirm: t('Готово'), resolve: () => {} })
}

export function DialogHost() {
  const request = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
  )
  if (!request) return null
  return <Dialog key={request.title + request.kind} request={request} />
}

function Dialog({ request }: { request: Request }) {
  const [copied, setCopied] = useState(false)
  const [text, setText] = useState(request.kind === 'text' ? request.initial : '')
  const input = useRef<HTMLInputElement>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)

  const close = (accepted: boolean) => {
    current = undefined
    emit()
    if (request.kind === 'text') request.resolve(accepted && text.trim() ? text.trim() : null)
    else request.resolve(accepted)
  }

  // Текст выделяется один раз при открытии — иначе каждая буква заменяла бы набранное.
  useEffect(() => {
    if (request.kind === 'text') input.current?.select()
    else confirmButton.current?.focus()
  }, [request])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-6" onMouseDown={() => close(false)}>
      <form
        role="dialog"
        aria-label={request.title}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          close(true)
        }}
        className="dialog-pop flyout w-full max-w-md overflow-hidden"
      >
        <div className="space-y-3 p-6">
          <h2 className="section-title">{request.title}</h2>
          {request.kind === 'text' ? (
            <label className="block space-y-1.5">
              {request.label && <span className="text-xs text-secondary">{request.label}</span>}
              <input ref={input} className="field" value={text} onChange={(event) => setText(event.target.value)} autoFocus />
            </label>
          ) : (
            <div className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap break-words text-secondary">{request.message}</div>
          )}
        </div>
        <div className="dialog-footer flex flex-wrap justify-end gap-2 px-6 py-4">
          {request.kind === 'info' && <button type="button" className="btn" onClick={() => {
            void navigator.clipboard.writeText(request.diagnostics).then(() => setCopied(true)).catch(() => setCopied(false))
          }}>{copied ? t('Скопировано') : t('Скопировать диагностику')}</button>}
          <button
            ref={confirmButton}
            type="submit"
            disabled={request.kind === 'text' && !text.trim()}
            className={`btn min-w-24 ${request.kind === 'confirm' && request.danger ? 'btn-danger' : 'btn-accent'}`}
          >
            {request.confirm}
          </button>
          {request.kind !== 'info' && <button type="button" onClick={() => close(false)} className="btn min-w-24">
            {t('Отмена')}
          </button>}
        </div>
      </form>
    </div>
  )
}
