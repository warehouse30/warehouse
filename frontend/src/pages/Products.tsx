import { useEffect, useState } from 'react'
import api from '../api'
import RichTextEditor from '../components/RichTextEditor'
import { PageHeader, Card, Btn, Field, inputClass, Empty, Badge } from '../ui'
import { useI18n } from '../i18n'

const empty = {
  sku: '',
  barcode: '',
  name: '',
  description: '',
  category_id: '' as number | '',
  unit: 'pcs',
  min_stock: 0,
  bin_location: '',
  photo_url: '',
  purchase_price: 0,
  purchase_currency: 'USD',
  purchase_tax_id: '' as number | '',
}

export default function Products() {
  const { t, tf } = useI18n()
  const [items, setItems] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [categories, setCategories] = useState<any[]>([])
  const [taxes, setTaxes] = useState<any[]>([])
  const [form, setForm] = useState({ ...empty })
  const [editId, setEditId] = useState<number | null>(null)
  const [show, setShow] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [previewHtml, setPreviewHtml] = useState(false)

  function load(p = page) {
    api
      .get('/products', { params: { page: p, page_size: 25, search: search || undefined } })
      .then((r) => {
        setItems(r.data.items || [])
        setTotal(r.data.total || 0)
      })
  }

  useEffect(() => {
    load(1)
    api.get('/products/categories').then((r) => setCategories(r.data)).catch(() => {})
    api.get('/pricing/taxes').then((r) => setTaxes(r.data)).catch(() => {})
  }, [])

  function openNew() {
    setEditId(null)
    setForm({ ...empty })
    setShow(true)
    setPreviewHtml(false)
    setMsg('')
  }

  function openEdit(p: any) {
    setEditId(p.id)
    setForm({
      sku: p.sku || '',
      barcode: p.barcode || '',
      name: p.name || '',
      description: p.description || '',
      category_id: p.category_id || p.category?.id || '',
      unit: p.unit || 'pcs',
      min_stock: Number(p.min_stock || 0),
      bin_location: p.bin_location || '',
      photo_url: p.photo_url || '',
      purchase_price: Number(p.purchase_price || 0),
      purchase_currency: p.purchase_currency || 'USD',
      purchase_tax_id: p.purchase_tax_id || '',
    })
    setShow(true)
    setPreviewHtml(false)
    setMsg('')
  }

  async function uploadImage(file: File) {
    if (!editId) {
      setMsg('Save product first, then upload image')
      return
    }
    const fd = new FormData()
    fd.append('file', file)
    try {
      const { data } = await api.post(`/uploads/products/${editId}/image`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setForm((f) => ({ ...f, photo_url: data.photo_url }))
      setMsg('Image uploaded')
      load(page)
    } catch (err: any) {
      setMsg(err.response?.data?.detail || 'Upload failed')
    }
  }

  async function printLabel(id: number) {
    const token = localStorage.getItem('token')
    const res = await fetch(`/api/v1/labels/product/${id}.pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `label-${id}.pdf`
    a.click()
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    const payload = {
      ...form,
      category_id: form.category_id || null,
      purchase_tax_id: form.purchase_tax_id || null,
      description: form.description || null,
      barcode: form.barcode || null,
      photo_url: form.photo_url || null,
      bin_location: form.bin_location || null,
    }
    try {
      if (editId) {
        const { sku, ...rest } = payload as any
        await api.patch(`/products/${editId}`, rest)
        setMsg(t.products.updated)
      } else {
        await api.post('/products', payload)
        setMsg(t.products.created)
      }
      setShow(false)
      load(page)
    } catch (err: any) {
      const d = err.response?.data?.detail
      setMsg(typeof d === 'string' ? d : err.message || 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  // Auto purchase tax display
  const tax = taxes.find((t) => t.id === form.purchase_tax_id)
  const taxPct = tax ? Number(tax.rate) : 0
  const net = Number(form.purchase_price) || 0
  const taxAmt = Number(((net * taxPct) / 100).toFixed(4))
  const gross = Number((net + taxAmt).toFixed(4))

  return (
    <div className="w-full min-w-0 space-y-5">
      <PageHeader
        title={t.products.title}
        subtitle={t.products.subtitle}
        actions={<Btn onClick={openNew}>{t.products.add}</Btn>}
      />
      {msg && <div className="text-sm bg-sky-50 dark:bg-sky-950 p-3 rounded-xl">{msg}</div>}

      <Card className="!p-3 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.products.searchPh}
          className={`${inputClass} flex-1 min-w-[160px]`}
          onKeyDown={(e) => e.key === 'Enter' && (setPage(1), load(1))}
        />
        <Btn
          variant="secondary"
          onClick={() => {
            setPage(1)
            load(1)
          }}
        >
          Search
        </Btn>
      </Card>

      {show && (
        <Card>
          <form onSubmit={save} className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold text-lg">{editId ? t.products.edit : t.products.new}</h2>
              <button type="button" className="text-sm text-slate-400" onClick={() => setShow(false)}>
                {t.close}
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label={t.products.sku}>
                <input
                  required
                  value={form.sku}
                  disabled={!!editId}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  className={`${inputClass} font-mono ${editId ? 'opacity-60' : ''}`}
                />
              </Field>
              <Field label={t.products.barcode}>
                <input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className={inputClass} />
              </Field>
              <Field label={t.products.name}>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
              </Field>
              <Field label={t.products.category}>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value ? Number(e.target.value) : '' })}
                  className={inputClass}
                >
                  <option value="">—</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t.products.unit}>
                <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={inputClass} />
              </Field>
              <Field label={t.products.bin}>
                <input value={form.bin_location} onChange={(e) => setForm({ ...form, bin_location: e.target.value })} className={inputClass} />
              </Field>
              <Field label={t.products.minStock}>
                <input
                  type="number"
                  step="any"
                  value={form.min_stock}
                  onChange={(e) => setForm({ ...form, min_stock: Number(e.target.value) })}
                  className={inputClass}
                />
              </Field>
              <Field label={t.products.photoUrl}>
                <input value={form.photo_url} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} className={inputClass} placeholder="https://… or upload after save" />
              </Field>
              {editId && (
                <Field label="Upload image">
                  <input
                    type="file"
                    accept="image/*"
                    className={inputClass}
                    onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])}
                  />
                </Field>
              )}
              <Field label={t.products.purchasePrice}>
                <input
                  type="number"
                  step="any"
                  value={form.purchase_price}
                  onChange={(e) => setForm({ ...form, purchase_price: Number(e.target.value) })}
                  className={inputClass}
                />
              </Field>
              <Field label="Purchase currency">
                <input
                  value={form.purchase_currency}
                  onChange={(e) => setForm({ ...form, purchase_currency: e.target.value.toUpperCase() })}
                  className={inputClass}
                  placeholder="USD"
                  maxLength={10}
                />
              </Field>
              <Field label={t.products.purchaseTax}>
                <select
                  value={form.purchase_tax_id}
                  onChange={(e) => setForm({ ...form, purchase_tax_id: e.target.value ? Number(e.target.value) : '' })}
                  className={inputClass}
                >
                  <option value="">{t.products.noTax}</option>
                  {taxes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.rate}%)
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {(net > 0 || taxPct > 0) && (
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-2">
                  <div className="text-xs text-slate-500">{t.products.net}</div>
                  <div className="font-semibold tabular-nums">{net.toFixed(2)}</div>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-2">
                  <div className="text-xs text-slate-500">{t.products.tax} {taxPct}%</div>
                  <div className="font-semibold tabular-nums">{taxAmt.toFixed(2)}</div>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-2">
                  <div className="text-xs text-slate-500">{t.products.gross}</div>
                  <div className="font-semibold tabular-nums">{gross.toFixed(2)}</div>
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t.products.description}</span>
                <button
                  type="button"
                  className="text-xs text-sky-600"
                  onClick={() => setPreviewHtml(!previewHtml)}
                >
                  {previewHtml ? t.products.editMode : t.products.preview}
                </button>
              </div>
              {previewHtml ? (
                <div
                  className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 min-h-[140px] prose prose-sm dark:prose-invert max-w-none bg-white dark:bg-slate-800"
                  dangerouslySetInnerHTML={{ __html: form.description || '<p class="text-slate-400">Empty</p>' }}
                />
              ) : (
                <RichTextEditor
                  value={form.description}
                  onChange={(html) => setForm({ ...form, description: html })}
                  placeholder={t.products.descPlaceholder}
                  minHeight={160}
                />
              )}
            </div>

            <div className="flex gap-2">
              <Btn type="submit" disabled={busy}>
                {busy ? t.products.saving : editId ? t.products.saveBtn : t.products.createBtn}
              </Btn>
              <Btn type="button" variant="secondary" onClick={() => setShow(false)}>
                Cancel
              </Btn>
            </div>
          </form>
        </Card>
      )}

      <Card padding={false}>
        {items.length === 0 ? (
          <Empty text={t.products.empty} />
        ) : (
          <ul className="divide-y dark:divide-slate-800">
            {items.map((p) => (
              <li key={p.id} className="p-4 flex flex-wrap gap-3 justify-between hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                <div className="min-w-0 flex gap-3">
                  {p.photo_url ? (
                    <img src={p.photo_url} alt="" className="w-12 h-12 object-cover rounded-lg border border-slate-200 dark:border-slate-700" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs text-slate-400">
                      —
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800 dark:text-slate-100">{p.name}</div>
                    <div className="text-xs font-mono text-sky-600">{p.sku}</div>
                    {p.description && (
                      <div
                        className="text-xs text-slate-500 mt-1 line-clamp-2 max-w-md prose prose-xs dark:prose-invert"
                        dangerouslySetInnerHTML={{
                          __html: p.description.replace(/<[^>]+>/g, ' ').slice(0, 120) + (p.description.length > 120 ? '…' : ''),
                        }}
                      />
                    )}
                    <div className="flex flex-wrap gap-2 mt-1">
                      {p.category?.name && <Badge color="slate">{p.category.name}</Badge>}
                      {Number(p.purchase_price) > 0 && (
                        <span className="text-xs text-slate-500">Buy {Number(p.purchase_price).toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 self-start">
                  <Btn variant="secondary" className="!text-xs !py-1.5" onClick={() => openEdit(p)}>
                    {t.edit}
                  </Btn>
                  <Btn variant="ghost" className="!text-xs !py-1.5" onClick={() => printLabel(p.id)}>
                    Label
                  </Btn>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex justify-between text-sm text-slate-500">
        <span>{tf(t.products.count, { n: total })}</span>
        <div className="flex gap-2">
          <Btn variant="secondary" className="!py-1.5" disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load(p) }}>
            Prev
          </Btn>
          <span className="self-center">{t.page} {page}</span>
          <Btn variant="secondary" className="!py-1.5" disabled={items.length < 25} onClick={() => { const p = page + 1; setPage(p); load(p) }}>
            Next
          </Btn>
        </div>
      </div>
    </div>
  )
}
