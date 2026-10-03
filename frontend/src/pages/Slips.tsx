import { useState, useEffect } from 'react'
import api from '../api'
import { useWarehouse } from '../warehouseContext'
import { useI18n } from '../i18n'

async function downloadWithAuth(url: string, filename: string, mime: string) {
  const token = localStorage.getItem('token')
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Download failed')
  }
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(a.href)
}

async function openPrintHtml(url: string) {
  const token = localStorage.getItem('token')
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error('Failed to load print preview')
  const html = await res.text()
  const w = window.open('', '_blank', 'width=320,height=600')
  if (!w) throw new Error('Popup blocked – allow popups for print')
  w.document.write(html)
  w.document.close()
}

export default function Slips() {
  const { t } = useI18n()
  const { warehouses, warehouseId, setWarehouseId } = useWarehouse()
  const [products, setProducts] = useState<any[]>([])
  const [recent, setRecent] = useState<any[]>([])
  const [form, setForm] = useState({
    slip_type: 'out',
    warehouse_id: 0,
    customer_name: '',
    vehicle_number: '',
    notes: '',
  })
  const [items, setItems] = useState([{ product_id: 0, quantity: 1 }])
  const [created, setCreated] = useState<any>(null)
  const [msg, setMsg] = useState('')
  const [printing, setPrinting] = useState(false)

  function loadRecent() {
    api.get('/slips', { params: { limit: 15 } })
      .then((r) => setRecent(r.data))
      .catch(() => {})
  }

  useEffect(() => {
    if (warehouseId) setForm((f) => ({ ...f, warehouse_id: warehouseId }))
  }, [warehouseId])

  useEffect(() => {
    api.get('/products', { params: { page_size: 100 } }).then((r) => setProducts(r.data.items || []))
    loadRecent()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    try {
      const payload = {
        ...form,
        items: items.filter((i) => i.product_id).map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
        })),
      }
      if (!payload.items.length) {
        setMsg('Add at least one product line')
        return
      }
      const { data } = await api.post('/slips', payload)
      setCreated(data)
      setMsg('Slip created: ' + data.slip_number)
      loadRecent()
    } catch (err: any) {
      setMsg(err.response?.data?.detail || 'Error creating slip')
    }
  }

  async function confirm() {
    if (!created) return
    try {
      const { data } = await api.post(`/slips/${created.id}/confirm`)
      setCreated(data)
      setMsg('Confirmed & stock updated')
      loadRecent()
    } catch (err: any) {
      setMsg(err.response?.data?.detail || 'Confirm failed')
    }
  }

  async function cancelSlip() {
    if (!created) return
    if (!confirm('Cancel this slip and release any stock reservation?')) return
    try {
      const { data } = await api.post(`/slips/${created.id}/cancel`)
      setCreated(data)
      setMsg('Cancelled — reservations released')
      loadRecent()
    } catch (err: any) {
      setMsg(err.response?.data?.detail || 'Cancel failed')
    }
  }

  async function printPdf(slipId?: number, slipNumber?: string) {
    const id = slipId ?? created?.id
    const num = slipNumber ?? created?.slip_number ?? 'slip'
    if (!id) return
    setPrinting(true)
    setMsg('')
    try {
      await downloadWithAuth(`/api/v1/slips/${id}/print/pdf`, `${num}.pdf`, 'application/pdf')
      setMsg('PDF downloaded')
      loadRecent()
    } catch (e: any) {
      setMsg(e.message || 'PDF print failed')
    } finally {
      setPrinting(false)
    }
  }

  async function printThermalText(slipId?: number, slipNumber?: string) {
    const id = slipId ?? created?.id
    const num = slipNumber ?? created?.slip_number ?? 'slip'
    if (!id) return
    setPrinting(true)
    setMsg('')
    try {
      await downloadWithAuth(`/api/v1/slips/${id}/print/thermal`, `${num}-thermal.txt`, 'text/plain')
      setMsg('Thermal text downloaded (send to POS printer)')
      loadRecent()
    } catch (e: any) {
      setMsg(e.message || 'Thermal download failed')
    } finally {
      setPrinting(false)
    }
  }

  async function printThermalBrowser(slipId?: number) {
    const id = slipId ?? created?.id
    if (!id) return
    setPrinting(true)
    setMsg('')
    try {
      await openPrintHtml(`/api/v1/slips/${id}/print/thermal-html`)
      setMsg('Print dialog opened (80mm layout)')
      loadRecent()
    } catch (e: any) {
      setMsg(e.message || 'Browser print failed')
    } finally {
      setPrinting(false)
    }
  }

  function selectSlip(s: any) {
    setCreated(s)
    setMsg(`Loaded ${s.slip_number}`)
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      <h1 className="text-xl font-bold text-slate-800">Gate-Pass / Slips</h1>

      {/* Create form */}
      <form onSubmit={submit} className="bg-white rounded-xl shadow p-4 space-y-3">
        <h2 className="font-semibold text-slate-700">Create new slip</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Type</label>
            <select
              value={form.slip_type}
              onChange={(e) => setForm({ ...form, slip_type: e.target.value })}
              className="w-full border rounded-lg px-2 py-2 text-sm"
            >
              <option value="out">OUT (Dispatch)</option>
              <option value="in">IN (Receipt)</option>
              <option value="adjust">ADJUST</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">Warehouse</label>
            <select
              value={form.warehouse_id}
              onChange={(e) => {
                const id = Number(e.target.value)
                setForm({ ...form, warehouse_id: id })
                setWarehouseId(id)
              }}
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
              ))}
            </select>
          </div>
        </div>
        <input
          placeholder="Customer name"
          value={form.customer_name}
          onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
        <input
          placeholder="Vehicle number"
          value={form.vehicle_number}
          onChange={(e) => setForm({ ...form, vehicle_number: e.target.value })}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
        {items.map((it, idx) => (
          <div key={idx} className="flex gap-2">
            <select
              value={it.product_id}
              onChange={(e) => {
                const next = [...items]
                next[idx].product_id = Number(e.target.value)
                setItems(next)
              }}
              className="flex-1 border rounded-lg px-2 py-2 text-sm"
            >
              <option value={0}>Select product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.sku} – {p.name}</option>
              ))}
            </select>
            <input
              type="number"
              min={0.001}
              step="any"
              value={it.quantity}
              onChange={(e) => {
                const next = [...items]
                next[idx].quantity = Number(e.target.value)
                setItems(next)
              }}
              className="w-24 border rounded-lg px-2 py-2 text-sm"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setItems([...items, { product_id: 0, quantity: 1 }])}
          className="text-sm text-sky-600"
        >
          + Add line
        </button>
        <button type="submit" className="w-full bg-sky-600 text-white py-2.5 rounded-lg font-medium">
          Create Slip
        </button>
      </form>

      {msg && (
        <div className="bg-sky-50 text-sky-900 p-3 rounded-xl text-sm border border-sky-100">
          {msg}
        </div>
      )}

      {/* Active slip + print panel */}
      {created && (
        <div className="bg-white rounded-xl shadow p-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-mono font-bold text-lg">{created.slip_number}</div>
              <div className="text-sm text-slate-500 mt-1">
                Status: <span className="font-medium uppercase">{created.status}</span>
                {' · '}Type: {created.slip_type}
                {created.customer_name && <> · {created.customer_name}</>}
              </div>
            </div>
            {created.qr_image_b64 && (
              <img
                src={`data:image/png;base64,${created.qr_image_b64}`}
                alt="Slip QR"
                className="w-28 h-28 border border-slate-200 rounded-lg bg-white"
              />
            )}
          </div>

          {created.items?.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-1">SKU</th>
                  <th className="py-1">Product</th>
                  <th className="py-1 text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {created.items.map((it: any) => (
                  <tr key={it.id} className="border-b border-slate-50">
                    <td className="py-1.5 font-mono text-xs">{it.product_sku}</td>
                    <td className="py-1.5">{it.product_name}</td>
                    <td className="py-1.5 text-right">{it.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {created.status === 'draft' && (
              <>
                <button
                  onClick={confirm}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                  {t.slips.confirm}
                </button>
                <button
                  onClick={cancelSlip}
                  className="bg-rose-100 hover:bg-rose-200 text-rose-800 px-4 py-2 rounded-lg text-sm font-medium"
                >
                  {t.slips.cancelRelease}
                </button>
              </>
            )}
            <button
              onClick={() => printPdf()}
              disabled={printing}
              className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {t.slips.downloadPdf}
            </button>
            <button
              onClick={() => printThermalBrowser()}
              disabled={printing}
              className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Print 80mm (browser)
            </button>
            <button
              onClick={() => printThermalText()}
              disabled={printing}
              className="bg-slate-500 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Download thermal .txt
            </button>
          </div>
          <p className="text-xs text-slate-400">
            PDF = official A4. Browser print = 80mm layout + QR (use thermal printer as system printer).
            .txt = raw text for ESC/POS / network POS printers.
          </p>
        </div>
      )}

      {/* Recent slips */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold text-slate-700 text-sm">Recent slips</div>
        <div className="divide-y">
          {recent.length === 0 && (
            <div className="p-4 text-sm text-slate-400">No slips yet</div>
          )}
          {recent.map((s) => (
            <div
              key={s.id}
              className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 hover:bg-slate-50 cursor-pointer"
              onClick={() => selectSlip(s)}
            >
              <div>
                <span className="font-mono text-sm font-medium">{s.slip_number}</span>
                <span className="ml-2 text-xs uppercase text-slate-500">{s.status}</span>
                <span className="ml-2 text-xs text-slate-400">{s.slip_type}</span>
                {s.customer_name && (
                  <span className="ml-2 text-xs text-slate-500">{s.customer_name}</span>
                )}
              </div>
              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => printPdf(s.id, s.slip_number)}
                  className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200"
                >
                  PDF
                </button>
                <button
                  onClick={() => printThermalBrowser(s.id)}
                  className="text-xs px-2 py-1 rounded bg-sky-50 text-sky-700 hover:bg-sky-100"
                >
                  80mm
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
