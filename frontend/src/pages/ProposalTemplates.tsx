import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import api from '../api'
import { PageHeader, Card, Btn, Field, inputClass, Badge } from '../ui'
import { useI18n } from '../i18n'

const VisualTemplateEditor = lazy(() => import('../components/VisualTemplateEditor'))

const HELP = `Jinja2 HTML. Variables:
{{ company.name }} {{ company.address }}
{{ proposal.number }} {{ proposal.title }} {{ proposal.notes }} {{ proposal.currency }} {{ proposal.created_at }}
{{ customer.name }} {{ customer.company_name }} {{ customer.code }}
{{ customer.area }} {{ customer.branch }} {{ customer.email }} {{ customer.address }}
{{ price_list.name }}
{% for it in items %} … {{ it.sku }} {{ it.name }} {{ it.image_url }} {{ it.quantity }} {{ it.unit_price }} {{ it.tax_rate }} {{ it.line_total }} {% endfor %}
{{ totals.subtotal }} {{ totals.tax }} {{ totals.grand }}
{{ today }} {{ css }}`

function protectJinjaBlocks(html: string) {
  const blocks: string[] = []
  const protectedHtml = html.replace(/{%[\s\S]*?%}|{#[\s\S]*?#}/g, (block) => {
    const index = blocks.push(block) - 1
    return `<template data-proposal-jinja-block="${index}"></template>`
  })
  return { protectedHtml, blocks }
}

function restoreJinjaBlocks(html: string, blocks: string[]) {
  return html.replace(
    /<template\b(?=[^>]*\bdata-proposal-jinja-block="(\d+)")[^>]*>\s*<\/template>/gi,
    (_marker, index: string) => blocks[Number(index)] || ''
  )
}

function htmlBody(html: string) {
  const { protectedHtml } = protectJinjaBlocks(html)
  return new DOMParser().parseFromString(protectedHtml, 'text/html').body.innerHTML
}

function htmlHeadCss(html: string) {
  const document = new DOMParser().parseFromString(html, 'text/html')
  return Array.from(document.head.querySelectorAll('style'))
    .map((style) => (style.textContent || '').replace(/\{\{\s*css\s*\}\}/g, ''))
    .join('\n')
}

function withHtmlBody(html: string, body: string) {
  const { protectedHtml, blocks } = protectJinjaBlocks(html)
  const document = new DOMParser().parseFromString(protectedHtml, 'text/html')
  document.body.innerHTML = body
  return restoreJinjaBlocks(`<!doctype html>\n${document.documentElement.outerHTML}`, blocks)
}

export default function ProposalTemplates() {
  const { t, tf } = useI18n()
  const [list, setList] = useState<any[]>([])
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({
    code: '', name: '', description: '', body_html: '', css: '', page_size: 'A4', is_default: false,
  })
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [editorMode, setEditorMode] = useState<'code' | 'visual'>('visual')
  const [visualBody, setVisualBody] = useState('')
  const [previewDocument, setPreviewDocument] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  function load() {
    api.get('/proposals/templates').then((r) => setList(r.data))
  }
  useEffect(() => {
    load()
    api.get('/proposals/templates/default-body').then((r) => {
      if (!form.body_html) setForm((f) => ({ ...f, body_html: r.data.body_html }))
    })
  }, [])

  function openNew() {
    setEditId(null)
    const usedCodes = new Set(list.map((template) => template.code.toUpperCase()))
    let code = 'CUSTOM'
    let suffix = 2
    while (usedCodes.has(code)) code = `CUSTOM-${suffix++}`
    api.get('/proposals/templates/default-body').then((r) => {
      setEditorMode('visual')
      setVisualBody(htmlBody(r.data.body_html))
      setPreviewDocument('')
      setMsg('')
      setIsError(false)
      setForm({
        code,
        name: 'My template',
        description: '',
        body_html: r.data.body_html,
        css: '',
        page_size: 'A4',
        is_default: false,
      })
    })
  }

  function openEdit(t: any) {
    setEditId(t.id)
    setEditorMode('visual')
    setVisualBody(htmlBody(t.body_html))
    setPreviewDocument('')
    setMsg('')
    setIsError(false)
    setForm({
      code: t.code,
      name: t.name,
      description: t.description || '',
      body_html: t.body_html,
      css: t.css || '',
      page_size: t.page_size || 'A4',
      is_default: !!t.is_default,
    })
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setMsg('')
    setIsError(false)
    try {
      const codeTrimmed = form.code.trim().toUpperCase()
      if (!editId) {
        if (list.some((item) => item.code.toUpperCase() === codeTrimmed)) {
          setMsg(`A template with code "${form.code}" already exists. Please choose a different code.`)
          setIsError(true)
          return
        }
      }
      if (editId) {
        const { data } = await api.patch(`/proposals/templates/${editId}`, form)
        setMsg('Template saved successfully')
        setIsError(false)
        setForm((f) => ({ ...f, ...data }))
      } else {
        const { data } = await api.post('/proposals/templates', form)
        setMsg('Template created successfully')
        setIsError(false)
        setEditId(data.id)
        setForm((f) => ({ ...f, ...data }))
      }
      load()
    } catch (err: any) {
      setMsg(err.response?.data?.detail || 'Save failed')
      setIsError(true)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function previewTemplate() {
    setPreviewing(true)
    setMsg('')
    setIsError(false)
    try {
      const { data } = await api.post('/proposals/templates/preview', {
        body_html: form.body_html,
        css: form.css,
      }, { responseType: 'text' })
      setPreviewDocument(data)
    } catch (err: any) {
      let detail = err.response?.data?.detail
      if (!detail && typeof err.response?.data === 'string') {
        try {
          detail = JSON.parse(err.response.data).detail
        } catch {}
      }
      setMsg(detail || 'Preview failed')
      setIsError(true)
    } finally {
      setPreviewing(false)
    }
  }

  function cancelEdit() {
    setEditId(null)
    setVisualBody('')
    setPreviewDocument('')
    setMsg('')
    setIsError(false)
    setForm({ code: '', name: '', description: '', body_html: '', css: '', page_size: 'A4', is_default: false })
  }

  async function deleteTemplate(template: any) {
    if (!window.confirm(`Delete template "${template.name}"?`)) return
    try {
      await api.delete(`/proposals/templates/${template.id}`)
      setMsg('Template deleted')
      setIsError(false)
      if (editId === template.id) cancelEdit()
      load()
    } catch (err: any) {
      setMsg(err.response?.data?.detail || 'Delete failed')
      setIsError(true)
    }
  }

  return (
    <div className="w-full min-w-0 space-y-5">
      <PageHeader
        title={t.templates.title}
        subtitle={t.templates.subtitle}
        actions={<Btn onClick={openNew}>+ Template</Btn>}
      />
      {msg && (
        <div className={`text-sm p-3 rounded-xl border ${isError ? 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-900' : 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-900'}`}>
          {msg}
        </div>
      )}

      {(editId !== null || form.code) && form.body_html && (
        <Card>
          <form onSubmit={save} className="space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">{editId ? 'Edit template' : 'New template'}</h2>
              <button type="button" className="text-xs text-sky-600" onClick={() => setShowHelp(!showHelp)}>
                {showHelp ? 'Hide' : 'Show'} placeholder help
              </button>
            </div>
            {showHelp && (
              <pre className="text-[11px] bg-slate-50 dark:bg-slate-950 p-3 rounded-xl overflow-x-auto whitespace-pre-wrap text-slate-600 dark:text-slate-400">{HELP}</pre>
            )}
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Code"><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputClass} disabled={!!editId} /></Field>
              <Field label="Name"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} /></Field>
              <Field label="Page size">
                <select value={form.page_size} onChange={(e) => setForm({ ...form, page_size: e.target.value })} className={inputClass}>
                  <option value="A4">A4</option>
                  <option value="Letter">Letter</option>
                </select>
              </Field>
            </div>
            <Field label="Description"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} /></Field>
            <div>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {editorMode === 'code' ? 'Body HTML (Jinja2)' : 'Visual editor'}
                </span>
                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-md border border-slate-200 p-0.5 dark:border-slate-700" role="group" aria-label="Template editor mode">
                    {(['code', 'visual'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={editorMode === mode}
                        onClick={() => {
                          if (mode === 'visual') setVisualBody(htmlBody(form.body_html))
                          setEditorMode(mode)
                        }}
                        className={`rounded px-3 py-1 text-xs font-medium capitalize ${editorMode === mode ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                  <Btn type="button" variant="secondary" onClick={previewTemplate} disabled={previewing}>
                    {previewing ? 'Rendering…' : 'Preview'}
                  </Btn>
                </div>
              </div>
              {editorMode === 'code' ? (
                <textarea
                  required
                  value={form.body_html}
                  onChange={(e) => setForm({ ...form, body_html: e.target.value })}
                  className={`${inputClass} min-h-[360px] font-mono text-xs`}
                  spellCheck={false}
                />
              ) : (
                <Suspense fallback={<div className="grid min-h-40 place-items-center text-sm text-slate-500">Loading visual designer…</div>}>
                  <VisualTemplateEditor
                    html={visualBody}
                    css={form.css}
                    canvasCss={htmlHeadCss(form.body_html)}
                    onChange={(body, css) => {
                      setVisualBody(body)
                      setForm((current) => ({ ...current, body_html: withHtmlBody(current.body_html, body), css }))
                    }}
                  />
                </Suspense>
              )}
            </div>
            <Field label="Extra CSS">
              <textarea value={form.css} onChange={(e) => setForm({ ...form, css: e.target.value })} className={`${inputClass} font-mono text-xs min-h-[80px]`} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
              Default template
            </label>
            <div className="flex gap-2">
              <Btn type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save template'}</Btn>
              <Btn type="button" variant="secondary" onClick={cancelEdit}>Cancel</Btn>
            </div>
          </form>
        </Card>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {list.map((t) => (
          <Card key={t.id} className="hover:border-sky-300">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold">{t.name}</div>
                <div className="font-mono text-xs text-sky-600">{t.code}</div>
                {t.description && <p className="text-sm text-slate-500 mt-1">{t.description}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {t.is_default && <Badge color="sky">Default</Badge>}
                <Btn type="button" variant="secondary" onClick={() => openEdit(t)}>Edit</Btn>
                <Btn type="button" variant="ghost" onClick={() => deleteTemplate(t)}>Delete</Btn>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {previewDocument && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-3 sm:p-6" role="presentation">
          <section className="flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-md bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Proposal template preview">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="font-semibold">Template preview</h2>
              <button type="button" className="rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100" onClick={() => setPreviewDocument('')}>
                Close
              </button>
            </div>
            <iframe title="Rendered proposal template" srcDoc={previewDocument} sandbox="allow-same-origin allow-scripts" className="min-h-0 flex-1 bg-white" />
          </section>
        </div>
      )}
    </div>
  )
}
