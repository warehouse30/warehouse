import { useEffect, useState, useRef } from 'react'
import api from '../api'
import { useWarehouse } from '../warehouseContext'
import { useI18n } from '../i18n'

export default function CycleCountPage() {
  const { t } = useI18n()
  const { warehouses, warehouseId, setWarehouseId } = useWarehouse()
  const [list, setList] = useState<any[]>([])
  const [active, setActive] = useState<any>(null)
  const [name, setName] = useState('')
  const [barcode, setBarcode] = useState('')
  const [qty, setQty] = useState(1)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err' | 'info'; text: string } | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'variance'>('all')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function refresh() {
    api.get('/cycle-counts').then((r) => setList(r.data)).catch(() => {})
  }

  useEffect(() => {
    refresh()
    setName(`Stock take ${new Date().toLocaleDateString()}`)
  }, [])

  async function create() {
    if (!name.trim() || !warehouseId) return
    setBusy(true)
    setMsg(null)
    try {
      const { data } = await api.post('/cycle-counts', { name, warehouse_id: warehouseId })
      setMsg({ type: 'ok', text: `Started “${name}” with ${data.lines} product lines` })
      refresh()
      await open(data.id)
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.detail || 'Failed to start count' })
    } finally {
      setBusy(false)
    }
  }

  async function open(id: number) {
    const { data } = await api.get(`/cycle-counts/${id}`)
    setActive(data)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function submitCount() {
    if (!active || !barcode.trim()) return
    const code = barcode.trim()
    const line = active.lines.find(
      (l: any) =>
        l.barcode === code ||
        l.sku === code ||
        (l.sku && l.sku.toLowerCase() === code.toLowerCase())
    )
    if (!line) {
      setMsg({ type: 'err', text: `No line matching “${code}” in this count` })
      return
    }
    setBusy(true)
    try {
      const { data } = await api.post(`/cycle-counts/${active.id}/count`, {
        product_id: line.product_id,
        counted_qty: qty,
      })
      const v = data.variance
      setMsg({
        type: v === 0 ? 'ok' : 'info',
        text: `${line.sku}: counted ${data.counted_qty} (system ${data.system_qty}, variance ${v >= 0 ? '+' : ''}${v})`,
      })
      await open(active.id)
      setBarcode('')
      setQty(1)
      inputRef.current?.focus()
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.detail || 'Count failed' })
    } finally {
      setBusy(false)
    }
  }

  async function complete() {
    if (!active || !confirm('Apply stock adjustments for all counted lines and close this count?')) return
    setBusy(true)
    try {
      const { data } = await api.post(`/cycle-counts/${active.id}/complete?apply_adjustments=true`)
      setMsg({ type: 'ok', text: `Completed. Adjusted ${data.adjusted_lines} lines.` })
      await open(active.id)
      refresh()
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.detail || 'Complete failed' })
    } finally {
      setBusy(false)
    }
  }

  const lines = active?.lines || []
  const counted = lines.filter((l: any) => l.counted_qty != null).length
  const withVar = lines.filter((l: any) => l.variance != null && l.variance !== 0).length
  const progress = lines.length ? Math.round((counted / lines.length) * 100) : 0

  const visible = lines.filter((l: any) => {
    if (filter === 'pending') return l.counted_qty == null
    if (filter === 'variance') return l.variance != null && l.variance !== 0
    return true
  })

  return (
    <div className="w-full min-w-0 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{t.cycleCount.title}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {t.cycleCount.subtitle}
        </p>
      </div>

      {/* New count */}
      {!active && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">Start a new count</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Warehouse</label>
              <select
                value={warehouseId ?? ''}
                onChange={(e) => setWarehouseId(Number(e.target.value))}
                className="mt-1 w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={create}
            disabled={busy || !name.trim()}
            className="w-full sm:w-auto bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white font-semibold px-6 py-3 rounded-xl transition"
          >
            {busy ? 'Starting…' : 'Start cycle count'}
          </button>
        </div>
      )}

      {msg && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-medium ${
            msg.type === 'ok'
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
              : msg.type === 'err'
              ? 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200'
              : 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Active count workspace */}
      {active && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-lg text-slate-800 dark:text-slate-100">{active.name}</div>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`text-xs font-semibold uppercase px-2 py-0.5 rounded-full ${
                    active.status === 'open'
                      ? 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {active.status}
                </span>
                <span className="text-xs text-slate-500">
                  {counted}/{lines.length} counted · {withVar} with variance
                </span>
              </div>
            </div>
            <button
              onClick={() => setActive(null)}
              className="text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              ← All counts
            </button>
          </div>

          {/* Progress */}
          <div className="px-5 pt-3">
            <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-xs text-slate-400 mt-1 text-right">{progress}%</div>
          </div>

          {active.status === 'open' && (
            <div className="px-5 py-4 space-y-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap gap-2">
                <input
                  ref={inputRef}
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitCount()}
                  placeholder="Scan barcode or type SKU"
                  className="flex-1 min-w-[160px] border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-sky-500"
                />
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                  className="w-24 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl px-3 py-3 text-center text-base font-semibold outline-none focus:ring-2 focus:ring-sky-500"
                />
                <button
                  onClick={submitCount}
                  disabled={busy || !barcode.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-semibold px-5 py-3 rounded-xl"
                >
                  Count
                </button>
              </div>
              <button
                onClick={complete}
                disabled={busy}
                className="w-full bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 text-white font-medium py-3 rounded-xl text-sm"
              >
                Complete & apply stock adjustments
              </button>
            </div>
          )}

          {/* Filters */}
          <div className="px-5 py-2 flex gap-2 text-xs">
            {(['all', 'pending', 'variance'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full capitalize ${
                  filter === f
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">SKU</th>
                  <th className="px-4 py-2 font-medium">Product</th>
                  <th className="px-4 py-2 font-medium">Bin</th>
                  <th className="px-4 py-2 font-medium text-right">System</th>
                  <th className="px-4 py-2 font-medium text-right">Counted</th>
                  <th className="px-4 py-2 font-medium text-right">Variance</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      No lines in this filter
                    </td>
                  </tr>
                )}
                {visible.map((l: any) => (
                  <tr
                    key={l.id}
                    className={`border-t border-slate-50 dark:border-slate-800 ${
                      l.counted_qty == null ? '' : l.variance !== 0 ? 'bg-amber-50/50 dark:bg-amber-950/20' : 'bg-emerald-50/30 dark:bg-emerald-950/10'
                    }`}
                  >
                    <td className="px-4 py-2 font-mono text-xs text-sky-700 dark:text-sky-400">{l.sku}</td>
                    <td className="px-4 py-2">{l.name}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{l.bin_location || '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{l.system_qty}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">
                      {l.counted_qty ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td
                      className={`px-4 py-2 text-right tabular-nums font-semibold ${
                        l.variance == null
                          ? 'text-slate-300'
                          : l.variance === 0
                          ? 'text-emerald-600'
                          : 'text-rose-600'
                      }`}
                    >
                      {l.variance == null ? '—' : l.variance > 0 ? `+${l.variance}` : l.variance}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Past counts */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 font-semibold text-sm text-slate-700 dark:text-slate-200">
          Recent counts
        </div>
        {list.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400">No cycle counts yet</div>
        ) : (
          <ul className="divide-y dark:divide-slate-800">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => open(c.id)}
                  className="w-full text-left px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center justify-between gap-3 transition"
                >
                  <div>
                    <span className="font-medium text-slate-800 dark:text-slate-100">{c.name}</span>
                    <span className="ml-2 text-xs text-slate-400">#{c.id}</span>
                  </div>
                  <span
                    className={`text-xs font-semibold uppercase px-2 py-0.5 rounded-full ${
                      c.status === 'open'
                        ? 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800'
                    }`}
                  >
                    {c.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
