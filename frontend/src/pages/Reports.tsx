import { useEffect, useState } from 'react'
import api from '../api'
import { useWarehouse } from '../warehouseContext'
import { PageHeader, Card, Btn, Empty, Badge } from '../ui'
import { useI18n } from '../i18n'

export default function Reports() {
  const { t, tf } = useI18n()
  const { warehouseId, current, warehouses, setWarehouseId } = useWarehouse()
  const [tab, setTab] = useState<'inventory' | 'audit' | 'alerts'>('inventory')
  const [inv, setInv] = useState<any>({ items: [], total: 0 })
  const [audit, setAudit] = useState<any>({ items: [], total: 0 })
  const [alerts, setAlerts] = useState<any>({ items: [], count: 0 })
  const [lowOnly, setLowOnly] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    if (tab === 'inventory') {
      api
        .get('/reports/inventory', {
          params: {
            low_stock_only: lowOnly,
            page_size: 50,
            warehouse_id: warehouseId || undefined,
          },
        })
        .then((r) => setInv(r.data))
    } else if (tab === 'audit') {
      api.get('/reports/audit', { params: { page_size: 50, date_from: dateFrom || undefined, date_to: dateTo || undefined } }).then((r) => setAudit(r.data))
    } else {
      api
        .get('/reports/alerts/low-stock', { params: { warehouse_id: warehouseId || undefined } })
        .then((r) => setAlerts(r.data))
    }
  }, [tab, lowOnly, warehouseId, dateFrom, dateTo])

  async function exportCsv() {
    const token = localStorage.getItem('token')
    const q = new URLSearchParams()
    if (lowOnly) q.set('low_stock_only', 'true')
    if (warehouseId) q.set('warehouse_id', String(warehouseId))
    const res = await fetch(`/api/v1/reports/export/inventory.csv?${q}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `inventory${current ? '-' + current.code : ''}.csv`
    a.click()
  }

  const tabs = [
    { id: 'inventory' as const, label: 'Inventory' },
    { id: 'alerts' as const, label: `Alerts${alerts.count ? ` (${alerts.count})` : ''}` },
    { id: 'audit' as const, label: 'Audit' },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.reports.title}
        subtitle={current ? `Warehouse ${current.code}` : 'All warehouses'}
        actions={
          <Btn variant="secondary" onClick={exportCsv}>
            {t.reports.exportCsv}
          </Btn>
        }
      />

      <div className="flex flex-wrap gap-2 items-center">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              tab === t.id
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
        <select
          value={warehouseId ?? ''}
          onChange={(e) => setWarehouseId(Number(e.target.value))}
          className="ml-auto text-sm border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl px-3 py-2"
        >
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code}
            </option>
          ))}
        </select>
      </div>

      {tab === 'inventory' && (
        <>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} className="rounded" />
            Low stock only
          </label>
          <Card padding={false} className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500">
                  <tr>
                    <th className="p-3 font-medium">Warehouse</th>
                    <th className="p-3 font-medium">SKU</th>
                    <th className="p-3 font-medium">Name</th>
                    <th className="p-3 font-medium">Bin</th>
                    <th className="p-3 font-medium text-right">Qty</th>
                    <th className="p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.items.length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        <Empty text="No inventory rows" />
                      </td>
                    </tr>
                  )}
                  {inv.items.map((r: any, i: number) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="p-3">{r.warehouse}</td>
                      <td className="p-3 font-mono text-xs text-sky-700 dark:text-sky-400">{r.sku}</td>
                      <td className="p-3">{r.name}</td>
                      <td className="p-3 text-xs text-slate-500">{r.bin_location || '—'}</td>
                      <td className="p-3 text-right tabular-nums">{r.quantity}</td>
                      <td className="p-3">
                        {r.is_low ? <Badge color="amber">Low</Badge> : <Badge color="emerald">OK</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {tab === 'alerts' && (
        <Card padding={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-amber-50 dark:bg-amber-950/40 text-left">
                <tr>
                  <th className="p-3 font-medium">Warehouse</th>
                  <th className="p-3 font-medium">SKU</th>
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium text-right">Qty</th>
                  <th className="p-3 font-medium text-right">Min</th>
                  <th className="p-3 font-medium text-right">Deficit</th>
                </tr>
              </thead>
              <tbody>
                {alerts.items.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <Empty text="No low-stock items" />
                    </td>
                  </tr>
                )}
                {alerts.items.map((a: any, i: number) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="p-3">{a.warehouse}</td>
                    <td className="p-3 font-mono text-xs">{a.sku}</td>
                    <td className="p-3">{a.name}</td>
                    <td className="p-3 text-right tabular-nums">{a.quantity}</td>
                    <td className="p-3 text-right tabular-nums">{a.min_stock}</td>
                    <td className="p-3 text-right tabular-nums text-rose-600 font-semibold">{a.deficit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'audit' && (
        <div className="flex flex-wrap gap-2 items-center text-sm mb-2">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border rounded-lg px-2 py-1 dark:bg-slate-800 dark:border-slate-700" />
          <span>→</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border rounded-lg px-2 py-1 dark:bg-slate-800 dark:border-slate-700" />
          <button
            type="button"
            className="text-sky-600 text-xs font-medium"
            onClick={async () => {
              const token = localStorage.getItem('token')
              const q = new URLSearchParams()
              if (dateFrom) q.set('date_from', dateFrom)
              if (dateTo) q.set('date_to', dateTo)
              const res = await fetch(`/api/v1/reports/export/audit.csv?${q}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              })
              const blob = await res.blob()
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = 'audit.csv'
              a.click()
            }}
          >
            Export audit CSV
          </button>
        </div>
      )}
      {tab === 'audit' && (
        <Card padding={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500">
                <tr>
                  <th className="p-3 font-medium">Time</th>
                  <th className="p-3 font-medium">User</th>
                  <th className="p-3 font-medium">Action</th>
                  <th className="p-3 font-medium">Entity</th>
                  <th className="p-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {audit.items.map((a: any) => (
                  <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="p-3 text-xs whitespace-nowrap text-slate-500">{a.created_at?.slice(0, 19)}</td>
                    <td className="p-3">{a.user}</td>
                    <td className="p-3 font-mono text-xs">{a.action}</td>
                    <td className="p-3 text-xs">
                      {a.entity_type}:{a.entity_id}
                    </td>
                    <td className="p-3 text-xs max-w-xs truncate text-slate-500">{a.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
