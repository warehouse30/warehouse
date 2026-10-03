import { useEffect, useState } from 'react'
import api from '../api'
import { PageHeader, Card, Btn, Field, inputClass, Badge, Empty } from '../ui'
import { useI18n } from '../i18n'

function formatErr(err: any): string {
  const d = err?.response?.data?.detail
  if (!d) return err?.message || 'Request failed'
  if (typeof d === 'string') return d
  if (Array.isArray(d)) return d.map((x: any) => x.msg || JSON.stringify(x)).join('; ')
  return JSON.stringify(d)
}

export default function Pricing() {
  const { t, tf } = useI18n()
  const [tab, setTab] = useState<'taxes' | 'lists' | 'templates' | 'formulas' | 'calc'>('templates')
  const [taxes, setTaxes] = useState<any[]>([])
  const [lists, setLists] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [formulas, setFormulas] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [msg, setMsg] = useState('')

  const [taxForm, setTaxForm] = useState({ code: '', name: '', rate: 20 })
  const [listForm, setListForm] = useState({ code: '', name: '', description: '', is_default: false })
  const [tplForm, setTplForm] = useState({
    code: '', name: '', formula: 'purchase * 1.25', description: '', default_sales_tax_id: '' as number | '',
  })
  const [applyForm, setApplyForm] = useState({
    template_id: 0,
    category_ids: [] as number[],
    price_list_ids: [] as number[],
    overwrite: true,
  })
  const [fForm, setFForm] = useState({
    category_id: 0,
    price_list_id: 0,
    formula: 'purchase * 1.25',
    sales_tax_id: 0 as number | '',
    formula_template_id: '' as number | '',
    notes: '',
  })
  const [preview, setPreview] = useState<number | null>(null)
  const [conflicts, setConflicts] = useState<any>(null)

  // Purchase tax calculator
  const [calcNet, setCalcNet] = useState(100)
  const [calcTaxId, setCalcTaxId] = useState<number | ''>('')
  const [calcResult, setCalcResult] = useState<any>(null)

  function load() {
    api.get('/pricing/taxes').then((r) => setTaxes(r.data))
    api.get('/pricing/price-lists').then((r) => setLists(r.data))
    api.get('/pricing/formula-templates').then((r) => setTemplates(r.data)).catch(() => setTemplates([]))
    api.get('/pricing/formulas').then((r) => setFormulas(r.data))
    api.get('/products/categories').then((r) => setCategories(r.data)).catch(() => {})
  }
  useEffect(() => { load() }, [])

  // Auto-calc purchase tax whenever net or tax changes
  useEffect(() => {
    if (tab !== 'calc') return
    const t = taxes.find((x) => x.id === calcTaxId)
    const pct = t ? Number(t.rate) : 0
    const net = Number(calcNet) || 0
    const tax_amount = Math.round(net * pct) / 100
    // more precision
    const taxAmt = Number((net * pct / 100).toFixed(4))
    setCalcResult({
      net,
      tax_percent: pct,
      tax_amount: taxAmt,
      gross: Number((net + taxAmt).toFixed(4)),
      tax_name: t?.name,
    })
  }, [calcNet, calcTaxId, taxes, tab])

  async function addTax(e: React.FormEvent) {
    e.preventDefault()
    await api.post('/pricing/taxes', taxForm)
    setTaxForm({ code: '', name: '', rate: 20 })
    setMsg('Tax rate added')
    load()
  }

  async function addList(e: React.FormEvent) {
    e.preventDefault()
    await api.post('/pricing/price-lists', listForm)
    setListForm({ code: '', name: '', description: '', is_default: false })
    setMsg('Price list added')
    load()
  }

  async function addTemplate(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.post('/pricing/formula-templates', {
        ...tplForm,
        default_sales_tax_id: tplForm.default_sales_tax_id || null,
      })
      setTplForm({ code: '', name: '', formula: 'purchase * 1.25', description: '', default_sales_tax_id: '' })
      setMsg('Formula template created')
      load()
    } catch (err: any) {
      setMsg(formatErr(err))
    }
  }

  async function checkConflicts() {
    if (!applyForm.category_ids.length || !applyForm.price_list_ids.length) {
      setConflicts(null)
      return
    }
    try {
      const { data } = await api.post('/pricing/formulas/check-conflicts', {
        category_ids: applyForm.category_ids,
        price_list_ids: applyForm.price_list_ids,
      })
      setConflicts(data)
    } catch {
      setConflicts(null)
    }
  }

  async function applyTemplate(e: React.FormEvent) {
    e.preventDefault()
    if (!applyForm.template_id || !applyForm.category_ids.length || !applyForm.price_list_ids.length) {
      setMsg('Select template, at least one category and one price list')
      return
    }
    await checkConflicts()
    try {
      const { data } = await api.post('/pricing/formula-templates/apply', applyForm)
      setMsg(
        `Applied “${data.template}”: created ${data.created}, updated ${data.updated}` +
          (data.skipped ? `, skipped ${data.skipped}` : '')
      )
      setConflicts(null)
      load()
      setTab('formulas')
    } catch (err: any) {
      setMsg(formatErr(err))
    }
  }

  function toggleId(arr: number[], id: number) {
    return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]
  }

  async function addFormula(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.post('/pricing/formulas', {
        ...fForm,
        sales_tax_id: fForm.sales_tax_id || null,
        formula_template_id: fForm.formula_template_id || null,
      })
      setMsg('Formula saved')
      load()
    } catch (err: any) {
      setMsg(formatErr(err))
    }
  }

  async function runPreview(formula: string) {
    try {
      const { data } = await api.post(`/pricing/preview-formula?formula=${encodeURIComponent(formula)}&purchase=100`)
      setPreview(data.result)
    } catch (err: any) {
      setMsg(formatErr(err))
      setPreview(null)
    }
  }

  async function removeFormula(id: number) {
    if (!confirm('Delete formula?')) return
    await api.delete(`/pricing/formulas/${id}`)
    load()
  }

  async function removeTemplate(id: number) {
    if (!confirm('Delete template?')) return
    await api.delete(`/pricing/formula-templates/${id}`)
    load()
  }

  function useTemplate(t: any) {
    setFForm((f) => ({
      ...f,
      formula: t.formula,
      sales_tax_id: t.default_sales_tax_id || '',
      formula_template_id: t.id,
    }))
    setApplyForm((a) => ({ ...a, template_id: t.id }))
    setMsg(`Loaded template “${t.name}”`)
  }

  const tabs = [
    { id: 'templates' as const, label: t.pricing.formulaTemplates },
    { id: 'formulas' as const, label: t.pricing.categoryFormulas },
    { id: 'lists' as const, label: t.pricing.priceLists },
    { id: 'taxes' as const, label: t.pricing.taxRates },
    { id: 'calc' as const, label: t.pricing.taxCalculator },
  ]

  return (
    <div className="w-full min-w-0 space-y-5">
      <PageHeader
        title={t.pricing.title}
        subtitle={t.pricing.subtitle}
      />
      {msg && <div className="text-sm bg-sky-50 dark:bg-sky-950 text-sky-900 dark:text-sky-100 p-3 rounded-xl">{msg}</div>}

      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium ${
              tab === t.id ? 'bg-sky-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAX CALCULATOR */}
      {tab === 'calc' && (
        <Card className="space-y-4">
          <h2 className="font-semibold text-lg">Purchase tax auto-calculator</h2>
          <p className="text-sm text-slate-500">
            Enter net purchase price and select tax rate — tax amount and gross are calculated automatically.
            Same logic is used on products when <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">purchase_tax_id</code> is set.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Purchase price (excl. tax)">
              <input type="number" step="any" value={calcNet} onChange={(e) => setCalcNet(Number(e.target.value))} className={`${inputClass} text-lg font-semibold`} />
            </Field>
            <Field label="Purchase tax rate">
              <select value={calcTaxId} onChange={(e) => setCalcTaxId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                <option value="">No tax (0%)</option>
                {taxes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.rate}%)</option>
                ))}
              </select>
            </Field>
          </div>
          {calcResult && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-center">
                <div className="text-xs text-slate-500 uppercase">Net</div>
                <div className="text-xl font-bold tabular-nums">{calcResult.net.toFixed(2)}</div>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/40 rounded-xl p-4 text-center">
                <div className="text-xs text-slate-500 uppercase">Tax {calcResult.tax_percent}%</div>
                <div className="text-xl font-bold tabular-nums text-amber-800 dark:text-amber-200">{calcResult.tax_amount.toFixed(2)}</div>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-xl p-4 text-center">
                <div className="text-xs text-slate-500 uppercase">Gross (incl. tax)</div>
                <div className="text-xl font-bold tabular-nums text-emerald-800 dark:text-emerald-200">{calcResult.gross.toFixed(2)}</div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* TAXES */}
      {tab === 'taxes' && (
        <div className="space-y-4">
          <Card>
            <form onSubmit={addTax} className="grid sm:grid-cols-4 gap-3 items-end">
              <Field label="Code"><input required value={taxForm.code} onChange={(e) => setTaxForm({ ...taxForm, code: e.target.value })} className={inputClass} placeholder="KDV20" /></Field>
              <Field label="Name"><input required value={taxForm.name} onChange={(e) => setTaxForm({ ...taxForm, name: e.target.value })} className={inputClass} /></Field>
              <Field label="Rate %"><input type="number" step="0.01" value={taxForm.rate} onChange={(e) => setTaxForm({ ...taxForm, rate: Number(e.target.value) })} className={inputClass} /></Field>
              <Btn type="submit">Add tax</Btn>
            </form>
          </Card>
          <Card padding={false}>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500"><tr><th className="p-3">Code</th><th className="p-3">Name</th><th className="p-3 text-right">Rate %</th></tr></thead>
              <tbody>
                {taxes.map((t) => (
                  <tr key={t.id} className="border-t dark:border-slate-800"><td className="p-3 font-mono text-xs">{t.code}</td><td className="p-3">{t.name}</td><td className="p-3 text-right tabular-nums">{t.rate}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* LISTS */}
      {tab === 'lists' && (
        <div className="space-y-4">
          <Card>
            <form onSubmit={addList} className="grid sm:grid-cols-2 gap-3">
              <Field label="Code"><input required value={listForm.code} onChange={(e) => setListForm({ ...listForm, code: e.target.value.toUpperCase() })} className={inputClass} /></Field>
              <Field label="Name"><input required value={listForm.name} onChange={(e) => setListForm({ ...listForm, name: e.target.value })} className={inputClass} /></Field>
              <Field label="Description"><input value={listForm.description} onChange={(e) => setListForm({ ...listForm, description: e.target.value })} className={inputClass} /></Field>
              <label className="flex items-center gap-2 text-sm self-end pb-2"><input type="checkbox" checked={listForm.is_default} onChange={(e) => setListForm({ ...listForm, is_default: e.target.checked })} /> Default</label>
              <Btn type="submit" className="sm:col-span-2">Add price list</Btn>
            </form>
          </Card>
          <div className="grid sm:grid-cols-2 gap-3">
            {lists.map((l) => (
              <Card key={l.id}>
                <div className="flex justify-between"><div><div className="font-mono text-xs text-sky-600">{l.code}</div><div className="font-semibold text-lg">{l.name}</div></div>{l.is_default && <Badge color="sky">Default</Badge>}</div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* FORMULA TEMPLATES */}
      {tab === 'templates' && (
        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold mb-3">Create formula template</h2>
            <form onSubmit={addTemplate} className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Code"><input required value={tplForm.code} onChange={(e) => setTplForm({ ...tplForm, code: e.target.value.toUpperCase() })} className={inputClass} placeholder="STD25" /></Field>
                <Field label="Name"><input required value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} className={inputClass} placeholder="Standard +25%" /></Field>
                <Field label="Formula">
                  <input required value={tplForm.formula} onChange={(e) => setTplForm({ ...tplForm, formula: e.target.value })} className={`${inputClass} font-mono`} />
                </Field>
                <Field label="Default sales tax">
                  <select value={tplForm.default_sales_tax_id} onChange={(e) => setTplForm({ ...tplForm, default_sales_tax_id: e.target.value ? Number(e.target.value) : '' })} className={inputClass}>
                    <option value="">None</option>
                    {taxes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Description"><input value={tplForm.description} onChange={(e) => setTplForm({ ...tplForm, description: e.target.value })} className={inputClass} /></Field>
              <div className="flex gap-2">
                <Btn type="submit">Save template</Btn>
                <Btn type="button" variant="secondary" onClick={() => runPreview(tplForm.formula)}>Preview @ 100</Btn>
                {preview != null && <span className="text-sm font-semibold text-emerald-700 self-center">→ {preview}</span>}
              </div>
            </form>
          </Card>

          <div className="grid sm:grid-cols-2 gap-3">
            {templates.length === 0 && <Card><Empty text="No templates — create one above" /></Card>}
            {templates.map((t) => (
              <Card key={t.id}>
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="font-semibold">{t.name}</div>
                    <div className="font-mono text-xs text-sky-600">{t.code}</div>
                    <div className="font-mono text-sm mt-2 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded">{t.formula}</div>
                    {t.default_sales_tax_rate != null && (
                      <div className="text-xs text-slate-500 mt-1">Sales tax {t.default_sales_tax_rate}%</div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Btn variant="secondary" className="!text-xs !py-1" onClick={() => useTemplate(t)}>Use</Btn>
                    <button className="text-xs text-rose-600" onClick={() => removeTemplate(t.id)}>Delete</button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <Card>
            <h2 className="font-semibold mb-3">Apply template to categories × price lists</h2>
            <form onSubmit={applyTemplate} className="space-y-3">
              <Field label="Template">
                <select required value={applyForm.template_id} onChange={(e) => setApplyForm({ ...applyForm, template_id: Number(e.target.value) })} className={inputClass}>
                  <option value={0}>Select…</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.formula}</option>)}
                </select>
              </Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Categories</div>
                  <div className="max-h-40 overflow-y-auto space-y-1 border rounded-xl p-2 dark:border-slate-700">
                    {categories.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-sm py-1">
                        <input
                          type="checkbox"
                          checked={applyForm.category_ids.includes(c.id)}
                          onChange={() => setApplyForm({ ...applyForm, category_ids: toggleId(applyForm.category_ids, c.id) })}
                        />
                        {c.name}
                      </label>
                    ))}
                    {categories.length === 0 && <div className="text-xs text-slate-400">No categories</div>}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Price lists</div>
                  <div className="max-h-40 overflow-y-auto space-y-1 border rounded-xl p-2 dark:border-slate-700">
                    {lists.map((l) => (
                      <label key={l.id} className="flex items-center gap-2 text-sm py-1">
                        <input
                          type="checkbox"
                          checked={applyForm.price_list_ids.includes(l.id)}
                          onChange={() => setApplyForm({ ...applyForm, price_list_ids: toggleId(applyForm.price_list_ids, l.id) })}
                        />
                        {l.name}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={applyForm.overwrite} onChange={(e) => setApplyForm({ ...applyForm, overwrite: e.target.checked })} />
                Overwrite existing category×price-list formulas
              </label>
              <div className="flex flex-wrap gap-2">
                <Btn type="button" variant="secondary" onClick={checkConflicts}>Check duplicates / conflicts</Btn>
                <Btn type="submit">Apply template</Btn>
              </div>
              {conflicts && (
                <div className={`text-sm rounded-xl p-3 ${conflicts.conflict_count ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900'}`}>
                  {conflicts.conflict_count === 0 ? (
                    <span>No existing formulas for selected pairs — {conflicts.free_count} free cell(s).</span>
                  ) : (
                    <div className="space-y-1">
                      <div className="font-semibold">{conflicts.conflict_count} existing category×price-list combo(s) (will update if overwrite is on):</div>
                      <ul className="list-disc pl-5 text-xs max-h-32 overflow-y-auto">
                        {conflicts.conflicts.map((c: any, i: number) => (
                          <li key={i}>
                            {c.category_name} × {c.price_list_name}: <code>{c.formula}</code>
                            {c.formula_template_name ? ` (from ${c.formula_template_name})` : ''}
                          </li>
                        ))}
                      </ul>
                      <div className="text-xs">{conflicts.free_count} free pair(s) will be created.</div>
                    </div>
                  )}
                </div>
              )}
            </form>
          </Card>
        </div>
      )}

      {/* CATEGORY FORMULAS */}
      {tab === 'formulas' && (
        <div className="space-y-4">
          <Card>
            <p className="text-sm text-slate-500 mb-3">
              Or pick a template, then save a single category × list formula. Variable: <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">purchase</code>
            </p>
            {templates.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {templates.map((t) => (
                  <button key={t.id} type="button" onClick={() => useTemplate(t)} className="text-xs px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-sky-900">
                    {t.name}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={addFormula} className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Category">
                  <select required value={fForm.category_id} onChange={(e) => setFForm({ ...fForm, category_id: Number(e.target.value) })} className={inputClass}>
                    <option value={0}>Select…</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Price list">
                  <select required value={fForm.price_list_id} onChange={(e) => setFForm({ ...fForm, price_list_id: Number(e.target.value) })} className={inputClass}>
                    <option value={0}>Select…</option>
                    {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </Field>
                <Field label="Formula">
                  <input required value={fForm.formula} onChange={(e) => setFForm({ ...fForm, formula: e.target.value })} className={`${inputClass} font-mono`} />
                </Field>
                <Field label="Sales tax">
                  <select value={fForm.sales_tax_id} onChange={(e) => setFForm({ ...fForm, sales_tax_id: e.target.value ? Number(e.target.value) : '' })} className={inputClass}>
                    <option value="">None</option>
                    {taxes.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.rate}%)</option>)}
                  </select>
                </Field>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <Btn type="submit">Save formula</Btn>
                <Btn type="button" variant="secondary" onClick={() => runPreview(fForm.formula)}>Preview @ 100</Btn>
                {preview != null && <span className="text-sm font-semibold text-emerald-700">→ {preview}</span>}
              </div>
            </form>
          </Card>
          <Card padding={false}>
            {formulas.length === 0 ? <Empty text="No formulas yet — apply a template or add one" /> : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500">
                  <tr>
                    <th className="p-3">Category</th>
                    <th className="p-3">Price list</th>
                    <th className="p-3">Formula</th>
                    <th className="p-3">Sales tax</th>
                    <th className="p-3">Template</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {formulas.map((f) => (
                    <tr key={f.id} className="border-t dark:border-slate-800">
                      <td className="p-3">{f.category_name}</td>
                      <td className="p-3 font-medium">{f.price_list_name}</td>
                      <td className="p-3 font-mono text-xs">{f.formula}</td>
                      <td className="p-3">{f.sales_tax_rate != null ? `${f.sales_tax_rate}%` : '—'}</td>
                      <td className="p-3 text-xs text-slate-500">{f.formula_template_name || '—'}</td>
                      <td className="p-3 text-right">
                        <button onClick={() => removeFormula(f.id)} className="text-xs text-rose-600 hover:underline">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
