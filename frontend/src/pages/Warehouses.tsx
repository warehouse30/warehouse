import { useEffect, useState } from 'react'
import api from '../api'
import { useWarehouse } from '../warehouseContext'
import { PageHeader, Card, Btn, Field, inputClass, Badge, Empty } from '../ui'
import { useI18n } from '../i18n'

const EMPTY_FORM = {
  code: '',
  name: '',
  address: '',
  gate_enabled: false,
  gate_host: '',
  gate_port: 80,
  gate_username: 'admin',
  gate_password: '',
  gate_door_no: 1,
  gate_use_https: false,
  gate_open_on_print: true,
  gate_model: 'DS-K1T510EBWX-E1',
}

type Row = typeof EMPTY_FORM & {
  id: number
  is_active: boolean
  sku_count?: number
  total_qty?: number
  created_at?: string
}

export default function Warehouses() {
  const { t, tf } = useI18n()
  const { setWarehouseId, refresh: refreshGlobal, warehouseId } = useWarehouse()
  const [list, setList] = useState<Row[]>([])
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [editId, setEditId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err' | 'info'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')

  async function load() {
    try {
      const { data } = await api.get('/warehouses/summary')
      setList(data)
    } catch {
      const { data } = await api.get('/warehouses', { params: { include_inactive: true } })
      setList(data)
    }
    refreshGlobal()
  }

  useEffect(() => {
    load()
  }, [])

  function openCreate() {
    setEditId(null)
    setForm({ ...EMPTY_FORM })
    setShowForm(true)
    setMsg(null)
  }

  function openEdit(w: Row) {
    setEditId(w.id)
    setForm({
      code: w.code,
      name: w.name,
      address: w.address || '',
      gate_enabled: !!w.gate_enabled,
      gate_host: w.gate_host || '',
      gate_port: w.gate_port || 80,
      gate_username: w.gate_username || 'admin',
      gate_password: '',
      gate_door_no: w.gate_door_no || 1,
      gate_use_https: !!w.gate_use_https,
      gate_open_on_print: w.gate_open_on_print !== false,
      gate_model: w.gate_model || 'DS-K1T510EBWX-E1',
    })
    setShowForm(true)
    setMsg(null)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      if (editId) {
        const payload: any = { ...form }
        if (!payload.gate_password) delete payload.gate_password
        delete payload.code // code immutable on edit
        await api.patch(`/warehouses/${editId}`, payload)
        setMsg({ type: 'ok', text: 'Warehouse updated' })
      } else {
        await api.post('/warehouses', form)
        setMsg({ type: 'ok', text: 'Warehouse created' })
      }
      setShowForm(false)
      setEditId(null)
      await load()
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.detail || 'Save failed' })
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(w: Row) {
    setBusy(true)
    try {
      if (w.is_active) {
        await api.post(`/warehouses/${w.id}/deactivate`)
        setMsg({ type: 'info', text: `${w.code} deactivated` })
      } else {
        await api.post(`/warehouses/${w.id}/activate`)
        setMsg({ type: 'ok', text: `${w.code} activated` })
      }
      await load()
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.detail || 'Action failed' })
    } finally {
      setBusy(false)
    }
  }

  async function testGate(id: number) {
    setMsg({ type: 'info', text: 'Testing gate connection…' })
    try {
      const { data } = await api.post(`/warehouses/${id}/gate/test`)
      setMsg({ type: 'ok', text: 'Gate reachable: ' + JSON.stringify(data).slice(0, 140) })
    } catch (err: any) {
      setMsg({ type: 'err', text: 'Gate test failed: ' + (err.response?.data?.detail || err.message) })
    }
  }

  async function openGate(id: number) {
    setMsg({ type: 'info', text: 'Sending open command…' })
    try {
      const { data } = await api.post(`/warehouses/${id}/gate/open`)
      setMsg({
        type: data.ok ? 'ok' : 'err',
        text: data.ok ? 'Door open command sent' : 'Open failed: ' + JSON.stringify(data),
      })
    } catch (err: any) {
      setMsg({ type: 'err', text: 'Open failed: ' + (err.response?.data?.detail || err.message) })
    }
  }

  function useAsActive(id: number) {
    setWarehouseId(id)
    setMsg({ type: 'ok', text: 'Set as active warehouse in header' })
  }

  const filtered = list.filter((w) => {
    if (!showInactive && !w.is_active) return false
    if (!search.trim()) return true
    const t = search.toLowerCase()
    return (
      w.code.toLowerCase().includes(t) ||
      w.name.toLowerCase().includes(t) ||
      (w.address || '').toLowerCase().includes(t) ||
      (w.gate_host || '').toLowerCase().includes(t)
    )
  })

  const activeCount = list.filter((w) => w.is_active).length

  return (
    <div className="w-full min-w-0 space-y-5">
      <PageHeader
        title={t.warehouses.title}
        subtitle={`${activeCount} active · ${list.length} total`}
        actions={
          <Btn onClick={openCreate}>+ Add warehouse</Btn>
        }
      />

      {msg && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-medium ${
            msg.type === 'ok'
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
              : msg.type === 'err'
              ? 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200'
              : 'bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Filters */}
      <Card className="!p-3 flex flex-wrap gap-3 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search code, name, address, gate IP…"
          className={`${inputClass} flex-1 min-w-[180px]`}
        />
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded"
          />
          Show inactive
        </label>
      </Card>

      {/* Form panel */}
      {showForm && (
        <Card className="border-sky-200 dark:border-sky-900">
          <form onSubmit={save} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg text-slate-800 dark:text-slate-100">
                {editId ? 'Edit warehouse' : 'New warehouse'}
              </h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-slate-400 hover:text-slate-700 text-sm"
              >
                Close
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Code">
                <input
                  required
                  value={form.code}
                  disabled={!!editId}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className={`${inputClass} font-mono ${editId ? 'opacity-60' : ''}`}
                  placeholder="WH-A"
                />
              </Field>
              <Field label="Name">
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={inputClass}
                  placeholder="Main warehouse"
                />
              </Field>
            </div>
            <Field label="Address">
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className={inputClass}
                placeholder="Optional address"
              />
            </Field>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={form.gate_enabled}
                  onChange={(e) => setForm({ ...form, gate_enabled: e.target.checked })}
                  className="rounded"
                />
                Hikvision access controller (DS-K1T510EBWX-E1)
              </label>

              {form.gate_enabled && (
                <div className="grid sm:grid-cols-2 gap-3 pl-1">
                  <Field label="Host / IP">
                    <input
                      value={form.gate_host}
                      onChange={(e) => setForm({ ...form, gate_host: e.target.value })}
                      className={inputClass}
                      placeholder="192.168.1.64"
                      required={form.gate_enabled}
                    />
                  </Field>
                  <Field label="Port">
                    <input
                      type="number"
                      value={form.gate_port}
                      onChange={(e) => setForm({ ...form, gate_port: Number(e.target.value) })}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Username">
                    <input
                      value={form.gate_username}
                      onChange={(e) => setForm({ ...form, gate_username: e.target.value })}
                      className={inputClass}
                    />
                  </Field>
                  <Field label={editId ? 'Password (leave blank to keep)' : 'Password'}>
                    <input
                      type="password"
                      value={form.gate_password}
                      onChange={(e) => setForm({ ...form, gate_password: e.target.value })}
                      className={inputClass}
                      placeholder={editId ? '••••••••' : ''}
                    />
                  </Field>
                  <Field label="Door number">
                    <input
                      type="number"
                      min={1}
                      value={form.gate_door_no}
                      onChange={(e) => setForm({ ...form, gate_door_no: Number(e.target.value) })}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Model">
                    <input
                      value={form.gate_model}
                      onChange={(e) => setForm({ ...form, gate_model: e.target.value })}
                      className={inputClass}
                    />
                  </Field>
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={form.gate_open_on_print}
                      onChange={(e) => setForm({ ...form, gate_open_on_print: e.target.checked })}
                      className="rounded"
                    />
                    Open gate automatically when a slip is printed
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.gate_use_https}
                      onChange={(e) => setForm({ ...form, gate_use_https: e.target.checked })}
                      className="rounded"
                    />
                    Use HTTPS
                  </label>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Btn type="submit" disabled={busy}>
                {busy ? 'Saving…' : editId ? 'Save changes' : 'Create warehouse'}
              </Btn>
              <Btn type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Btn>
            </div>
          </form>
        </Card>
      )}

      {/* List */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <Card>
            <Empty text={search ? 'No warehouses match your search' : 'No warehouses yet — add one to get started'} />
          </Card>
        )}
        {filtered.map((w) => (
          <Card
            key={w.id}
            className={`!p-0 overflow-hidden ${
              warehouseId === w.id ? 'ring-2 ring-sky-500/50' : ''
            } ${!w.is_active ? 'opacity-70' : ''}`}
          >
            <div className="p-4 sm:p-5 flex flex-wrap gap-4 justify-between">
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-bold text-lg text-sky-700 dark:text-sky-400">{w.code}</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{w.name}</span>
                  {!w.is_active && <Badge color="slate">Inactive</Badge>}
                  {warehouseId === w.id && <Badge color="sky">Active</Badge>}
                  {w.gate_enabled && <Badge color="emerald">Gate</Badge>}
                </div>
                {w.address && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">{w.address}</p>
                )}
                <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    <strong className="text-slate-700 dark:text-slate-200">{w.sku_count ?? '—'}</strong> SKUs
                  </span>
                  <span>
                    <strong className="text-slate-700 dark:text-slate-200">
                      {w.total_qty != null ? Number(w.total_qty).toLocaleString() : '—'}
                    </strong>{' '}
                    total qty
                  </span>
                  {w.gate_enabled && (
                    <span>
                      Gate: {w.gate_host}:{w.gate_port} · door {w.gate_door_no}
                      {w.gate_open_on_print ? ' · open on print' : ''}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 items-start">
                {w.is_active && (
                  <Btn
                    variant="secondary"
                    className="!py-1.5 !px-2.5 text-xs"
                    onClick={() => useAsActive(w.id)}
                  >
                    Use
                  </Btn>
                )}
                <Btn variant="secondary" className="!py-1.5 !px-2.5 text-xs" onClick={() => openEdit(w)}>
                  Edit
                </Btn>
                {w.gate_enabled && (
                  <>
                    <Btn variant="secondary" className="!py-1.5 !px-2.5 text-xs" onClick={() => testGate(w.id)}>
                      Test gate
                    </Btn>
                    <Btn variant="success" className="!py-1.5 !px-2.5 text-xs" onClick={() => openGate(w.id)}>
                      Open door
                    </Btn>
                  </>
                )}
                <Btn
                  variant={w.is_active ? 'ghost' : 'secondary'}
                  className="!py-1.5 !px-2.5 text-xs"
                  disabled={busy}
                  onClick={() => toggleActive(w)}
                >
                  {w.is_active ? 'Deactivate' : 'Activate'}
                </Btn>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
