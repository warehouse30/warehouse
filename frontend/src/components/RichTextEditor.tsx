import { useEffect, useRef } from 'react'

type Props = {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
}

/**
 * Lightweight rich-text editor (contentEditable + execCommand).
 * Stores HTML suitable for product descriptions.
 */
export default function RichTextEditor({ value, onChange, placeholder, minHeight = 140 }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value || ''
  }, [value])

  function cmd(command: string, arg?: string) {
    ref.current?.focus()
    document.execCommand(command, false, arg)
    emit()
  }

  function emit() {
    if (!ref.current) return
    const html = ref.current.innerHTML
    onChange(html)
  }

  function onPaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
    emit()
  }

  const btn =
    'px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800">
      <div className="flex flex-wrap gap-1 p-1.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
        <button type="button" className={btn} onClick={() => cmd('bold')} title="Bold"><b>B</b></button>
        <button type="button" className={btn} onClick={() => cmd('italic')} title="Italic"><i>I</i></button>
        <button type="button" className={btn} onClick={() => cmd('underline')} title="Underline"><u>U</u></button>
        <button type="button" className={btn} onClick={() => cmd('strikeThrough')} title="Strikethrough"><s>S</s></button>
        <span className="w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />
        <button type="button" className={btn} onClick={() => cmd('insertUnorderedList')} title="Bullet list">• List</button>
        <button type="button" className={btn} onClick={() => cmd('insertOrderedList')} title="Numbered list">1. List</button>
        <button type="button" className={btn} onClick={() => cmd('formatBlock', 'h3')} title="Heading">H</button>
        <button type="button" className={btn} onClick={() => cmd('formatBlock', 'p')} title="Paragraph">¶</button>
        <span className="w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />
        <button type="button" className={btn} onClick={() => { const url = window.prompt('Link URL'); if (url) cmd('createLink', url) }} title="Link">Link</button>
        <button type="button" className={btn} onClick={() => cmd('unlink')} title="Remove link">Unlink</button>
        <button type="button" className={btn} onClick={() => { const url = window.prompt('Image URL'); if (url) cmd('insertImage', url) }} title="Image">Img</button>
        <span className="w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />
        <button type="button" className={btn} onClick={() => cmd('justifyLeft')} title="Align left">⬅</button>
        <button type="button" className={btn} onClick={() => cmd('justifyCenter')} title="Center">↔</button>
        <button type="button" className={btn} onClick={() => cmd('justifyRight')} title="Align right">➡</button>
        <span className="w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />
        <button type="button" className={btn} onClick={() => cmd('removeFormat')} title="Clear formatting">Clear</button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        onPaste={onPaste}
        data-placeholder={placeholder || 'Write product description…'}
        className="px-3 py-2 text-sm outline-none max-w-none empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400"
        style={{ minHeight }}
      />
    </div>
  )
}
