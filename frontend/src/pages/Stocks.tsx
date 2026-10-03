import { useEffect, useState } from 'react'
import api from '../api'
import { useWarehouse } from '../warehouseContext'
import { PageHeader, Card, Btn, inputClass, Empty } from '../ui'
import { useI18n } from '../i18n'

export default function Stocks() {
  const { t, tf } = useI18n()
  const { warehouseId, warehouses, setWarehouseId, current } = useWarehouse()
  const [items, setItems] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  function load(p = page) {
    setLoading(true)
    api
      .get('/stocks', {
        params: {
          page: p,
          page_size: 30,
          search: search || undefined,
          warehouse_id: warehouseId || undefined,
        },
      })
      .then((r) => {
        setItems(r.data.items)
        setTotal(r.data.total)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setPage(1)
    load(1)
  }, [warehouseId])

  useEffect(() => {
    load()
  }, [page])

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.stocks.title}
        subtitle={current ? `Filtered: ${current.code} — ${current.name}` : 'All warehouses'}
      />

      <Card className="!p-3 flex flex-wrap gap-2 items-center">
        <select
          value={warehouseId ?? ''}
          onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : null)}
          className={`${inputClass} max-w-[200px]`}
        >
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code}
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search SKU / name / barcode…"
          className={`${inputClass} flex-1 min-w-[160px]`}
          onKeyDown={(e) => e.key === 'Enter' && (setPage(1), load(1))}
        />
        <Btn
          onClick={() => {
            setPage(1)
            load(1)
          }}
        >
          Search
        </Btn>
      </Card>

      <Card padding={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-slate-500">
              <tr>
                <th className="p-3 font-medium">SKU</th>
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Warehouse</th>
                <th className="p-3 font-medium text-right">Qty</th>
                <th className="p-3 font-medium text-right">Avail</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <Empty text="No stock found for this warehouse" />
                  </td>
                </tr>
              ) : (
                items.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="p-3 font-mono text-xs text-sky-700 dark:text-sky-400">{s.product_sku}</td>
                    <td className="p-3">{s.product_name}</td>
                    <td className="p-3">
                      <span className="text-xs font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                        {s.warehouse_code}
                      </span>
                    </td>
                    <td className="p-3 text-right tabular-nums font-medium">{s.quantity}</td>
                    <td className="p-3 text-right tabular-nums text-slate-500">{s.available}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex justify-between items-center text-sm">
        <span className="text-slate-500">{total} items</span>
        <div className="flex gap-2 items-center">
          <Btn variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="!py-1.5">
            Prev
          </Btn>
          <span className="text-slate-600 dark:text-slate-300 tabular-nums">Page {page}</span>
          <Btn
            variant="secondary"
            disabled={items.length < 30}
            onClick={() => setPage((p) => p + 1)}
            className="!py-1.5"
          >
            Next
          </Btn>
        </div>
      </div>
    </div>
  )
}
