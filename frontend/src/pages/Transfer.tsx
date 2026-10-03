import { useEffect, useState } from 'react'
import api from '../api'
import { useWarehouse } from '../warehouseContext'
import { useI18n } from '../i18n'

type Product = { id: number; sku: string; name: string; barcode?: string }
type Warehouse = { id: number; code: string; name: string }
type HistoryItem = {
  id: string
  from: string
  to: string
  sku: string
  name: string
  qty: number
  at: string
  ok: boolean
  error?: string
}

export default function Transfer() {
  const { t, tf } = useI18n()
  const { warehouses: whCtx, warehouseId: globalWhId } = useWarehouse()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [fromId, setFromId] = useState<number>(0)
  const [toId, setToId] = useState<number>(0)
  const [productId, setProductId] = useState<number>(0)
  const [search, setSearch] = useState('')
  const [qty, setQty] = useState(1)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('transferHistory') || '[]')
    } catch {
      return []
    }
  })

  useEffect(() => {
    const list = whCtx.length ? whCtx : []
    setWarehouses(list as Warehouse[])
    if (globalWhId) setFromId(globalWhId)
    else if (list.length >= 1) setFromId(list[0].id)
    if (list.length >= 2) {
      const other = list.find((w: any) => w.id !== (globalWhId || list[0].id))
      setToId(other ? other.id : list[1].id)
    } else if (list.length === 1) setToId(list[0].id)
    api.get('/products', { params: { page_size: 200 } }).then((r) => setProducts(r.data.items || []))
  }, [whCtx, globalWhId])

  const filtered = products.filter((p) => {
    if (!search.trim()) return true
    const t = search.toLowerCase()
    return (
      p.sku.toLowerCase().includes(t) ||
      p.name.toLowerCase().includes(t) ||
      (p.barcode || '').toLowerCase().includes(t)
    )
  })

  const selected = products.find((p) => p.id === productId)
  const fromWh = warehouses.find((w) => w.id === fromId)
  const toWh = warehouses.find((w) => w.id === toId)

  function swapWarehouses() {
    setFromId(toId)
    setToId(fromId)
  }

  function pushHistory(item: HistoryItem) {
    const next = [item, ...history].slice(0, 20)
    setHistory(next)
    sessionStorage.setItem('transferHistory', JSON.stringify(next))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (!fromId || !toId || !productId || qty <= 0) {
      setMsg({ type: 'err', text: 'Select warehouses, product, and quantity > 0' })
      return
    }
    if (fromId === toId) {
      setMsg({ type: 'err', text: 'Source and destination warehouses must be different' })
      return
    }
    setLoading(true)
    try {
      await api.post('/stocks/transfer', null, {
        params: {
          product_id: productId,
          from_warehouse_id: fromId,
          to_warehouse_id: toId,
          quantity: qty,
        },
      })
      const text = `Moved ${qty} × ${selected?.sku} from ${fromWh?.code} → ${toWh?.code}`
      setMsg({ type: 'ok', text })
      pushHistory({
        id: String(Date.now()),
        from: fromWh?.code || '',
        to: toWh?.code || '',
        sku: selected?.sku || '',
        name: selected?.name || '',
        qty,
        at: new Date().toLocaleString(),
        ok: true,
      })
      setQty(1)
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message || 'Transfer failed'
      setMsg({ type: 'err', text: detail })
      pushHistory({
        id: String(Date.now()),
        from: fromWh?.code || '',
        to: toWh?.code || '',
        sku: selected?.sku || '',
        name: selected?.name || '',
        qty,
        at: new Date().toLocaleString(),
        ok: false,
        error: String(detail),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Stock transfer</h1>
        <p className="text-sm text-slate-500 mt-1">
          Move quantity between warehouses. Stock is locked on both sides to prevent races.
        </p>
      </div>

      <form onSubmit={submit} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* From / To */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 p-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">From</label>
            <select
              value={fromId}
              onChange={(e) => setFromId(Number(e.target.value))}
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl px-3 py-3 text-sm font-medium focus:ring-2 focus:ring-sky-500 outline-none"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={swapWarehouses}
            className="mb-1 w-11 h-11 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-sky-900 text-slate-600 dark:text-slate-300 flex items-center justify-center text-lg transition"
            title="Swap warehouses"
          >
            ⇄
          </button>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">To</label>
            <select
              value={toId}
              onChange={(e) => setToId(Number(e.target.value))}
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl px-3 py-3 text-sm font-medium focus:ring-2 focus:ring-sky-500 outline-none"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-4 space-y-3">
          <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide">Product</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SKU, name, or barcode…"
            className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500"
          />
          <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-100 dark:border-slate-800 divide-y dark:divide-slate-800">
            {filtered.length === 0 && (
              <div className="p-3 text-sm text-slate-400 text-center">No products match</div>
            )}
            {filtered.slice(0, 50).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProductId(p.id)}
                className={`w-full text-left px-3 py-2.5 text-sm transition ${
                  productId === p.id
                    ? 'bg-sky-50 dark:bg-sky-950 border-l-4 border-sky-500'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span className="font-mono text-xs text-sky-700 dark:text-sky-400">{p.sku}</span>
                <span className="ml-2 text-slate-700 dark:text-slate-200">{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-4 flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[120px]">
            <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">Quantity</label>
            <input
              type="number"
              min={0.001}
              step="any"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl px-3 py-3 text-lg font-semibold text-center outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !productId || fromId === toId}
            className="flex-1 min-w-[140px] bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white font-semibold py-3.5 rounded-xl text-base transition shadow-sm"
          >
            {loading ? 'Transferring…' : 'Transfer stock'}
          </button>
        </div>
      </form>

      {msg && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-medium ${
            msg.type === 'ok'
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-100'
              : 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200 border border-rose-100'
          }`}
        >
          {msg.text}
        </div>
      )}

      {history.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200">
            This session
          </div>
          <ul className="divide-y dark:divide-slate-800">
            {history.map((h) => (
              <li key={h.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  <span className={`inline-block w-2 h-2 rounded-full mr-2 ${h.ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <span className="font-mono text-xs">{h.sku}</span>
                  <span className="text-slate-500 mx-1">×</span>
                  <span className="font-semibold">{h.qty}</span>
                  <span className="text-slate-400 mx-2">{h.from} → {h.to}</span>
                </div>
                <span className="text-xs text-slate-400">{h.at}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
