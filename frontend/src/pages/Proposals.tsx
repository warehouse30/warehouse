import { useEffect, useState } from 'react'
import api from '../api'
import { PageHeader, Card, Btn, Field, inputClass, Badge, Empty } from '../ui'
import { useWarehouse } from '../warehouseContext'
import { useI18n } from '../i18n'

type ProposalLine = {
  product_id: number
  sku: string
  name: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  tax_rate: number
  image_url: string
}

const proposalStatusActions = [
  { value: 'draft', label: 'Draft (Waiting)', activeClass: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200' },
  { value: 'accepted', label: 'Approved (Onaylanmış)', activeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  { value: 'cancelled', label: 'Cancelled (İptal)', activeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200' },
] as const

async function downloadAuth(url: string, filename: string) {
  const token = localStorage.getItem('token')
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new Error('Download failed')
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}

async function fetchProposalPreview(proposal: any) {
  const token = localStorage.getItem('token')
  const res = await fetch(`/api/v1/proposals/${proposal.id}/preview`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error('Preview could not be rendered')
  return res.text()
}

async function captureProposalPreview(proposal: any) {
  const html = await fetchProposalPreview(proposal)
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-same-origin')
  frame.title = 'Proposal export renderer'
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;'
  document.body.appendChild(frame)
  try {
    await new Promise<void>((resolve, reject) => {
      frame.onload = () => resolve()
      frame.onerror = () => reject(new Error('Preview could not be loaded'))
      frame.srcdoc = html
    })
    const doc = frame.contentDocument
    if (!doc) throw new Error('Preview document is unavailable')
    await Promise.all(Array.from(doc.images).map((image) => image.decode().catch(() => {})))
    await doc.fonts?.ready
    const width = Math.max(doc.documentElement.scrollWidth, frame.clientWidth)
    const height = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight)
    const { default: html2canvas } = await import('html2canvas')
    return await html2canvas(doc.documentElement, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
    })
  } finally {
    frame.remove()
  }
}

async function saveCanvasImage(canvas: HTMLCanvasElement, filename: string) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Image export failed')), 'image/png')
  })
  const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
  URL.revokeObjectURL(url)
}

async function saveCanvasPdf(canvas: HTMLCanvasElement, filename: string) {
  const { jsPDF } = await import('jspdf')
  const pageWidth = 210
  const pageHeight = 297
  const pixelsPerMm = canvas.width / pageWidth
  const pagePixels = Math.floor(pageHeight * pixelsPerMm)
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  for (let top = 0; top < canvas.height; top += pagePixels) {
    const sliceHeight = Math.min(pagePixels, canvas.height - top)
    const page = document.createElement('canvas')
    page.width = canvas.width
    page.height = sliceHeight
    page.getContext('2d')?.drawImage(canvas, 0, top, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)
    if (top) pdf.addPage()
    pdf.addImage(page.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pageWidth, sliceHeight / pixelsPerMm)
  }
  pdf.save(filename)
}

export default function Proposals() {
  const { warehouseId } = useWarehouse()
  const { t, tf } = useI18n()
  const [list, setList] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [priceLists, setPriceLists] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [show, setShow] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const [selected, setSelected] = useState<any>(null)
  const [form, setForm] = useState({
    customer_id: 0,
    price_list_id: '' as number | '',
    template_id: '' as number | '',
    title: '',
    notes: '',
    currency: 'TRY',
    discount_percent: 0,
  })
  const [items, setItems] = useState<ProposalLine[]>([
    { product_id: 0, sku: '', quantity: 1, name: '', description: '', unit: 'pcs', unit_price: 0, tax_rate: 0, image_url: '' },
  ])

  function load() {
    api.get('/proposals').then((r) => setList(r.data))
    api.get('/customers').then((r) => setCustomers(r.data))
    api.get('/products', { params: { page_size: 200 } }).then((r) => setProducts(r.data.items || []))
    api.get('/pricing/price-lists').then((r) => setPriceLists(r.data))
    api.get('/proposals/templates').then((r) => setTemplates(r.data))
  }
  useEffect(() => { load() }, [])

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  const discountAmount = subtotal * (Number(form.discount_percent) || 0) / 100
  const taxTotal = items.reduce((sum, item) => {
    const lineSubtotal = item.quantity * item.unit_price
    const discountedLine = lineSubtotal * (1 - (Number(form.discount_percent) || 0) / 100)
    return sum + discountedLine * item.tax_rate / 100
  }, 0)
  const grandTotal = subtotal - discountAmount + taxTotal

  function onCustomerChange(id: number) {
    const c = customers.find((x) => x.id === id)
    setForm((f) => ({
      ...f,
      customer_id: id,
      price_list_id: c?.default_price_list_id || f.price_list_id,
    }))
  }

  async function onProductPick(idx: number, productId: number) {
    const p = products.find((x) => x.id === productId)
    const next = [...items]
    if (!p) {
      next[idx] = { ...next[idx], product_id: 0 }
      setItems(next)
      return
    }
    next[idx] = { ...next[idx], product_id: productId, sku: p.sku, name: p.name, image_url: p.photo_url || '' }
    // auto price from list
    if (form.price_list_id) {
      try {
        const { data } = await api.get(`/pricing/products/${productId}/price`, {
          params: { price_list_id: form.price_list_id },
        })
        next[idx].unit_price = data.sales_unit_price
        next[idx].tax_rate = data.tax_percent
      } catch {}
    }
    setItems(next)
  }

  function openNew() {
    setEditingId(null)
    setForm({ customer_id: 0, price_list_id: '', template_id: '', title: '', notes: '', currency: 'TRY', discount_percent: 0 })
    setItems([{ product_id: 0, sku: '', quantity: 1, name: '', description: '', unit: 'pcs', unit_price: 0, tax_rate: 0, image_url: '' }])
    setShow(true)
  }

  function openEdit(proposal: any) {
    setEditingId(proposal.id)
    setForm({
      customer_id: proposal.customer_id,
      price_list_id: proposal.price_list_id || '',
      template_id: proposal.template_id || '',
      title: proposal.title || '',
      notes: proposal.notes || '',
      currency: proposal.currency || 'TRY',
      discount_percent: Number(proposal.discount_percent || 0),
    })
    setItems(proposal.items.map((item: any) => ({
      product_id: item.product_id || 0,
      sku: item.sku || '',
      name: item.name || '',
      description: item.description || '',
      quantity: Number(item.quantity || 0),
      unit: item.unit || 'pcs',
      unit_price: Number(item.unit_price || 0),
      tax_rate: Number(item.tax_rate || 0),
      image_url: item.image_url || '',
    })))
    setSelected(proposal)
    setShow(true)
  }

  async function saveProposal(e: React.FormEvent) {
    e.preventDefault()
    try {
      const payload = {
        ...form,
        price_list_id: form.price_list_id || null,
        template_id: form.template_id || null,
        items: items.filter((i) => i.name || i.product_id).map((i) => ({
          product_id: i.product_id || null,
          sku: i.sku || null,
          name: i.name,
          description: i.description || null,
          quantity: i.quantity,
          unit: i.unit,
          unit_price: i.unit_price,
          tax_rate: i.tax_rate,
          image_url: i.image_url || null,
        })),
      }
      const { data } = editingId
        ? await api.put(`/proposals/${editingId}`, payload)
        : await api.post('/proposals', payload)
      setMsg(`${editingId ? 'Saved new version ' : 'Created '}${data.number}`)
      setShow(false)
      setEditingId(null)
      setSelected(data)
      load()
    } catch (err: any) {
      setMsg(err.response?.data?.detail || 'Create failed')
    }
  }

  async function deleteProposal(proposal: any) {
    if (!window.confirm(`Delete proposal ${proposal.number}? This cannot be undone.`)) return
    try {
      await api.delete(`/proposals/${proposal.id}`)
      setMsg(`Deleted ${proposal.number}`)
      if (selected?.id === proposal.id) setSelected(null)
      load()
    } catch (err: any) {
      setMsg(err.response?.data?.detail || 'Delete failed')
    }
  }

  async function setProposalStatus(proposal: any, status: typeof proposalStatusActions[number]['value']) {
    if (proposal.status === status || updatingStatusId === proposal.id) return
    setUpdatingStatusId(proposal.id)
    try {
      const { data } = await api.patch(`/proposals/${proposal.id}/status`, { status })
      setList((current) => current.map((item) => item.id === data.id ? data : item))
      setSelected((current: any) => current?.id === data.id ? data : current)
      setMsg(`${data.number} status updated to ${proposalStatusActions.find((action) => action.value === status)?.label}`)
    } catch (err: any) {
      setMsg(err.response?.data?.detail || 'Status update failed')
    } finally {
      setUpdatingStatusId(null)
    }
  }

  async function toSlip(p: any) {
    if (!warehouseId) {
      setMsg('Select warehouse in header')
      return
    }
    try {
      const { data } = await api.post(`/proposals/${p.id}/to-slip`, null, { params: { warehouse_id: warehouseId } })
      setMsg(`Slip ${data.slip_number} created, stock reserved`)
    } catch (err: any) {
      setMsg(err.response?.data?.detail || 'Convert failed')
    }
  }

  async function einvoiceStub(p: any) {
    try {
      const { data } = await api.get(`/einvoice/proposals/${p.id}/ubl-stub`)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${p.number}-einvoice-stub.json`
      a.click()
      setMsg('E-invoice stub exported')
    } catch (err: any) {
      setMsg(err.response?.data?.detail || 'Export failed')
    }
  }

  async function downloadHtml(p: any) {
    try {
      const html = await fetchProposalPreview(p)
      const blob = new Blob([html], { type: 'text/html' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${p.number}.html`
      a.click()
      setMsg('HTML template exported')
    } catch (e: any) {
      setMsg(e.message || 'HTML export failed')
    }
  }

  async function exp(kind: 'pdf' | 'excel' | 'image', p: any) {
    try {
      if (kind === 'pdf' || kind === 'image') {
        const canvas = await captureProposalPreview(p)
        if (kind === 'pdf') await saveCanvasPdf(canvas, `${p.number}.pdf`)
        else await saveCanvasImage(canvas, `${p.number}.png`)
      } else {
        await downloadAuth(`/api/v1/proposals/${p.id}/export/excel`, `${p.number}.xlsx`)
      }
      setMsg(`Exported ${kind}`)
    } catch (e: any) {
      setMsg(e.message)
    }
  }

  function preview(p: any) {
    fetchProposalPreview(p)
      .then((html) => {
        const w = window.open('', '_blank')
        if (w) {
          w.document.write(html)
          w.document.close()
        }
      })
  }

  return (
    <div className="w-full min-w-0 space-y-5">
      <PageHeader
        title={t.proposals.title}
        subtitle={t.proposals.subtitle}
        actions={<Btn onClick={openNew}>+ New proposal</Btn>}
      />
      {msg && <div className="text-sm bg-sky-50 dark:bg-sky-950 p-3 rounded-xl">{msg}</div>}

      {show && (
        <Card>
          <form onSubmit={saveProposal} className="space-y-4">
            <h2 className="font-semibold text-lg">{editingId ? `Edit ${selected?.number || 'proposal'} · saves as a new version` : 'New proposal'}</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Customer">
                <select required value={form.customer_id} onChange={(e) => onCustomerChange(Number(e.target.value))} className={inputClass}>
                  <option value={0}>Select…</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Price list">
                <select value={form.price_list_id} onChange={(e) => setForm({ ...form, price_list_id: e.target.value ? Number(e.target.value) : '' })} className={inputClass}>
                  <option value="">—</option>
                  {priceLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
              <Field label="Template">
                <select value={form.template_id} onChange={(e) => setForm({ ...form, template_id: e.target.value ? Number(e.target.value) : '' })} className={inputClass}>
                  <option value="">Default</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Title">
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} />
              </Field>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-500 uppercase">Lines</div>
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end border border-slate-100 dark:border-slate-800 rounded-xl p-2">
                  <div className="sm:col-span-5">
                    <select value={it.product_id} onChange={(e) => onProductPick(idx, Number(e.target.value))} className={inputClass}>
                      <option value={0}>Product…</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                    </select>
                    <input value={it.name} onChange={(e) => setItems(items.map((line, index) => index === idx ? { ...line, name: e.target.value } : line))} className={`${inputClass} mt-2`} placeholder="Line description" />
                  </div>
                  <div className="sm:col-span-2">
                    <input type="number" min={0.001} step="any" value={it.quantity} onChange={(e) => {
                      setItems(items.map((line, index) => index === idx ? { ...line, quantity: Number(e.target.value) } : line))
                    }} className={inputClass} placeholder="Qty" />
                  </div>
                  <div className="sm:col-span-2">
                    <input type="number" step="any" value={it.unit_price} onChange={(e) => {
                      setItems(items.map((line, index) => index === idx ? { ...line, unit_price: Number(e.target.value) } : line))
                    }} className={inputClass} placeholder="Price" />
                  </div>
                  <div className="sm:col-span-2">
                    <input type="number" step="any" value={it.tax_rate} onChange={(e) => {
                      setItems(items.map((line, index) => index === idx ? { ...line, tax_rate: Number(e.target.value) } : line))
                    }} className={inputClass} placeholder="Tax%" />
                  </div>
                  <div className="sm:col-span-1 text-center text-xs text-slate-400">
                    {it.image_url ? '🖼' : '—'}
                  </div>
                  <button type="button" className="text-xs text-rose-600 sm:col-span-12 sm:text-right" onClick={() => setItems(items.filter((_, index) => index !== idx))}>
                    Remove line
                  </button>
                </div>
              ))}
              <button type="button" className="text-sm text-sky-600" onClick={() => setItems([...items, { product_id: 0, sku: '', quantity: 1, name: '', description: '', unit: 'pcs', unit_price: 0, tax_rate: 0, image_url: '' }])}>
                + Add line
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Discount (%)">
                <input type="number" min={0} max={100} step="0.01" value={form.discount_percent} onChange={(e) => setForm({ ...form, discount_percent: Math.min(100, Math.max(0, Number(e.target.value))) })} className={inputClass} />
              </Field>
              <div className="self-end rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-800">
                <div className="flex justify-between gap-4"><span>Subtotal</span><span>{subtotal.toFixed(2)} {form.currency}</span></div>
                <div className="flex justify-between gap-4"><span>Discount</span><span>−{discountAmount.toFixed(2)} {form.currency}</span></div>
                <div className="flex justify-between gap-4"><span>Tax</span><span>{taxTotal.toFixed(2)} {form.currency}</span></div>
                <div className="mt-1 flex justify-between gap-4 border-t border-slate-200 pt-1 font-semibold dark:border-slate-700"><span>Total</span><span>{grandTotal.toFixed(2)} {form.currency}</span></div>
              </div>
            </div>
            <Field label="Notes"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputClass} rows={2} /></Field>
            <div className="flex gap-2">
              <Btn type="submit">{editingId ? 'Save new version' : 'Create'}</Btn>
              <Btn type="button" variant="secondary" onClick={() => { setShow(false); setEditingId(null) }}>Cancel</Btn>
            </div>
          </form>
        </Card>
      )}

      {selected && (
        <Card>
          <div className="flex flex-wrap justify-between gap-2 items-center">
            <div>
              <div className="font-mono font-bold text-lg">{selected.number}</div>
              <div className="text-sm text-slate-500">{selected.customer_name} · {selected.status}</div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Btn variant="secondary" className="!text-xs !py-1.5" onClick={() => preview(selected)}>Preview</Btn>
              <Btn className="!text-xs !py-1.5" onClick={() => exp('pdf', selected)}>PDF</Btn>
              <Btn variant="secondary" className="!text-xs !py-1.5" onClick={() => exp('excel', selected)}>Excel</Btn>
              <Btn variant="secondary" className="!text-xs !py-1.5" onClick={() => exp('image', selected)}>Image</Btn>
              <Btn variant="secondary" className="!text-xs !py-1.5" onClick={() => downloadHtml(selected)}>HTML</Btn>
              <Btn variant="secondary" className="!text-xs !py-1.5" onClick={() => openEdit(selected)}>Edit</Btn>
              <Btn variant="ghost" className="!text-xs !py-1.5" onClick={() => deleteProposal(selected)}>Delete</Btn>
              <Btn className="!text-xs !py-1.5" onClick={() => toSlip(selected)}>→ Slip</Btn>
              <Btn variant="ghost" className="!text-xs !py-1.5" onClick={() => einvoiceStub(selected)}>E-invoice</Btn>
            </div>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {list.length === 0 && <Card><Empty text="No proposals yet" /></Card>}
        {list.map((p) => (
          <Card key={p.id} className="!p-4 flex flex-wrap justify-between gap-2 cursor-pointer hover:border-sky-300"
            onClick={() => setSelected(p)}>
            <div>
              <span className="font-mono font-semibold">{p.number}</span>
              <span className="ml-2 text-slate-700 dark:text-slate-200">{p.customer_name}</span>
              {p.title && <span className="ml-2 text-sm text-slate-400">{p.title}</span>}
            </div>
            <div className="flex gap-2 items-center">
              <Badge color="slate">{p.status === 'draft' ? 'Draft (Waiting)' : p.status === 'accepted' ? 'Approved' : p.status === 'cancelled' ? 'Cancelled' : p.status}</Badge>
              <span className="text-xs text-slate-400">{p.items?.length || 0} lines</span>
              <div className="flex flex-wrap gap-1" role="group" aria-label={`Status for ${p.number}`}>
                {proposalStatusActions.map((action) => {
                  const active = p.status === action.value
                  return (
                    <button
                      key={action.value}
                      type="button"
                      aria-pressed={active}
                      disabled={active || updatingStatusId === p.id}
                      onClick={(event) => {
                        event.stopPropagation()
                        void setProposalStatus(p, action.value)
                      }}
                      className={`rounded-md border px-2 py-1 text-[10px] font-medium transition disabled:cursor-default ${
                        active
                          ? action.activeClass
                          : 'border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-100'
                      }`}
                    >
                      {updatingStatusId === p.id ? 'Updating…' : action.label}
                    </button>
                  )
                })}
              </div>
              <Btn type="button" variant="secondary" className="!text-xs !py-1.5" onClick={(e) => { e.stopPropagation(); openEdit(p) }}>Edit</Btn>
              <Btn type="button" variant="ghost" className="!text-xs !py-1.5" onClick={(e) => { e.stopPropagation(); deleteProposal(p) }}>Delete</Btn>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
