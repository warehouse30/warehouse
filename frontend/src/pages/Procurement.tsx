import { useEffect, useState } from 'react'
import api from '../api'
import { useWarehouse } from '../warehouseContext'
import { useI18n } from '../i18n'
import { PageHeader, Card, Btn, Field, inputClass, Empty, Badge } from '../ui'

export default function Procurement() {
  const { warehouseId, warehouses } = useWarehouse()
  const { t } = useI18n()
  const [orders, setOrders] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [show, setShow] = useState(false)
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({
    supplier_name: '',
    warehouse_id: warehouseId || 0,
    notes: '',
  })
  const [items, setItems] = useState([{ product_id: 0, quantity_ordered: 1, unit_cost: 0, tax_rate: 20 }])

  function load() {
    api.get('/procurement/orders').then((r) => setOrders(r.data))
    api.get('/products', { params: { page_size: 200 } }).then((r) => setProducts(r.data.items || []))
  }
  useEffect(() => {
    load()
    if (warehouseId) setForm((f) => ({ ...f, warehouse_id: warehouseId }))
  }, [warehouseId])

  async function createPO(e: React.FormEvent) {
    e.preventDefault()
    try {
      const { data } = await api.post('/procurement/orders', {
        ...form,
        items: items.filter((i) => i.product_id),
      })
      setMsg(`Created ${data.number}`)
      setShow(false)
      load()
    } catch (err: any) {
      setMsg(err.response?.data?.detail || 'Failed')
    }
  }

  async function receiveAll(po: any) {
    const lines = po.items
      .filter((i: any) => i.quantity_ordered > i.quantity_received)
      .map((i: any) => ({
        product_id: i.product_id,
        quantity: i.quantity_ordered - i.quantity_received,
        unit_cost: i.unit_cost,
      }))
    if (!lines.length) {
      setMsg('Nothing left to receive')
      return
    }
    try {
      const { data } = await api.post('/procurement/receipts', {
        purchase_order_id: po.id,
        items: lines,
      })
      setMsg(`Receipt ${data.number} — PO ${data.po_status}`)
      load()
    } catch (err: any) {
      setMsg(err.response?.data?.detail || 'Receive failed')
    }
  }

  return (
    <div className="w-full min-w-0 space-y-5">
      <PageHeader
        title={t.procurement?.title || "Procurement"}
        subtitle={t.procurement?.subtitle || ""}
        actions={<Btn onClick={() => setShow(true)}>+ Purchase order</Btn>}
      />
      {msg && <div className="text-sm bg-sky-50 dark:bg-sky-950 p-3 rounded-xl">{msg}</div>}

      {show && (
        <Card>
          <form onSubmit={createPO} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Supplier">
                <input required value={form.supplier_name} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Warehouse">
                <select value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: Number(e.target.value) })} className={inputClass}>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.code}</option>
                  ))}
                </select>
              </Field>
            </div>
            {items.map((it, idx) => (
              <div key={idx} className="grid sm:grid-cols-4 gap-2">
                <select
                  value={it.product_id}
                  onChange={(e) => {
                    const n = [...items]
                    n[idx].product_id = Number(e.target.value)
                    setItems(n)
                  }}
                  className={inputClass}
                >
                  <option value={0}>Product…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
                  ))}
                </select>
                <input type="number" step="any" value={it.quantity_ordered} onChange={(e) => { const n = [...items]; n[idx].quantity_ordered = Number(e.target.value); setItems(n) }} className={inputClass} placeholder="Qty" />
                <input type="number" step="any" value={it.unit_cost} onChange={(e) => { const n = [...items]; n[idx].unit_cost = Number(e.target.value); setItems(n) }} className={inputClass} placeholder="Unit cost" />
                <input type="number" step="any" value={it.tax_rate} onChange={(e) => { const n = [...items]; n[idx].tax_rate = Number(e.target.value); setItems(n) }} className={inputClass} placeholder="Tax %" />
              </div>
            ))}
            <button type="button" className="text-sm text-sky-600" onClick={() => setItems([...items, { product_id: 0, quantity_ordered: 1, unit_cost: 0, tax_rate: 20 }])}>+ Line</button>
            <div className="flex gap-2">
              <Btn type="submit">Create PO</Btn>
              <Btn type="button" variant="secondary" onClick={() => setShow(false)}>{t.cancel}</Btn>
            </div>
          </form>
        </Card>
      )}

      <div className="space-y-2">
        {orders.length === 0 && <Card><Empty text="No purchase orders" /></Card>}
        {orders.map((po) => (
          <Card key={po.id} className="!p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <span className="font-mono font-bold">{po.number}</span>
                <span className="ml-2">{po.supplier_name}</span>
                <Badge color="slate">{po.status}</Badge>
              </div>
              {po.status !== 'received' && po.status !== 'cancelled' && (
                <Btn className="!text-xs !py-1.5" onClick={() => receiveAll(po)}>Receive remaining</Btn>
              )}
            </div>
            <ul className="mt-2 text-sm text-slate-600 dark:text-slate-300 space-y-1">
              {po.items?.map((it: any) => (
                <li key={it.id}>
                  {it.sku} × ordered {it.quantity_ordered} / received {it.quantity_received} @ {it.unit_cost}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  )
}
