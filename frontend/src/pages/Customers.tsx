import { useEffect, useState } from 'react'
import api from '../api'
import { PageHeader, Card, Btn, Field, inputClass, Badge, Empty } from '../ui'
import { useI18n } from '../i18n'

const empty = {
  code: '', name: '', company_name: '', area: '', branch: '', email: '', phone: '', address: '', tax_id: '',
  default_price_list_id: '' as number | '', notes: '', is_active: true,
}

export default function Customers() {
  const { t, tf } = useI18n()
  const [list, setList] = useState<any[]>([])
  const [lists, setLists] = useState<any[]>([])
  const [form, setForm] = useState({ ...empty })
  const [editId, setEditId] = useState<number | null>(null)
  const [show, setShow] = useState(false)
  const [search, setSearch] = useState('')
  const [msg, setMsg] = useState('')

  function load() {
    api.get('/customers', { params: { search: search || undefined, active_only: false } }).then((r) => setList(r.data))
    api.get('/pricing/price-lists').then((r) => setLists(r.data))
  }
  useEffect(() => { load() }, [])

  function openNew() {
    setEditId(null)
    setForm({ ...empty })
    setShow(true)
  }
  function openEdit(c: any) {
    setEditId(c.id)
    setForm({
      code: c.code, name: c.name, company_name: c.company_name || '', area: c.area || '', branch: c.branch || '', email: c.email || '', phone: c.phone || '',
      address: c.address || '', tax_id: c.tax_id || '',
      default_price_list_id: c.default_price_list_id || '',
      notes: c.notes || '', is_active: c.is_active,
    })
    setShow(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      ...form,
      default_price_list_id: form.default_price_list_id || null,
    }
    try {
      if (editId) await api.patch(`/customers/${editId}`, payload)
      else await api.post('/customers', payload)
      setMsg(editId ? 'Customer updated' : 'Customer created')
      setShow(false)
      load()
    } catch (err: any) {
      setMsg(err.response?.data?.detail || 'Save failed')
    }
  }

  return (
    <div className="w-full min-w-0 space-y-5">
      <PageHeader title={t.customers.title} subtitle={t.customers.subtitle} actions={<Btn onClick={openNew}>+ Customer</Btn>} />
      {msg && <div className="text-sm bg-sky-50 p-3 rounded-xl">{msg}</div>}
      <Card className="!p-3 flex gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className={`${inputClass} flex-1`}
          onKeyDown={(e) => e.key === 'Enter' && load()} />
        <Btn variant="secondary" onClick={load}>Search</Btn>
      </Card>

      {show && (
        <Card>
          <form onSubmit={save} className="space-y-3">
            <h2 className="font-semibold">{editId ? 'Edit customer' : 'New customer'}</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Code"><input required value={form.code} disabled={!!editId} onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputClass} /></Field>
              <Field label="Name"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} /></Field>
              <Field label="Company Name / Firma Adı"><input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} className={inputClass} /></Field>
              <Field label="Area / Bölge"><input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} className={inputClass} /></Field>
              <Field label="Branch / Şube"><input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} className={inputClass} /></Field>
              <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} /></Field>
              <Field label="Phone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} /></Field>
              <Field label="Tax ID"><input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} className={inputClass} /></Field>
              <Field label="Default price list">
                <select value={form.default_price_list_id} onChange={(e) => setForm({ ...form, default_price_list_id: e.target.value ? Number(e.target.value) : '' })} className={inputClass}>
                  <option value="">— None —</option>
                  {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Address"><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputClass} /></Field>
            <div className="flex gap-2">
              <Btn type="submit">Save</Btn>
              <Btn type="button" variant="secondary" onClick={() => setShow(false)}>Cancel</Btn>
            </div>
          </form>
        </Card>
      )}

      <div className="space-y-2">
        {list.length === 0 && <Card><Empty text="No customers" /></Card>}
        {list.map((c) => (
          <Card key={c.id} className="!p-4 flex flex-wrap justify-between gap-2">
            <div>
              <div className="font-semibold">{c.name} <span className="font-mono text-xs text-sky-600 ml-1">{c.code}</span></div>
              <div className="text-sm text-slate-500">
                {[c.company_name, c.area, c.branch, c.email || c.phone].filter(Boolean).join(' · ') || '—'}
                {c.default_price_list_name && <> · Price list: <strong>{c.default_price_list_name}</strong></>}
              </div>
            </div>
            <div className="flex gap-2 items-center">
              {!c.is_active && <Badge color="slate">Inactive</Badge>}
              <Btn variant="secondary" className="!py-1.5 !text-xs" onClick={() => openEdit(c)}>Edit</Btn>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
