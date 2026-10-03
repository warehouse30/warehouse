import { useEffect, useState } from 'react'
import api from '../api'
import { useI18n } from '../i18n'
import { PageHeader, Card, Btn, Field, inputClass, Badge, Empty } from '../ui'

export default function Currencies() {
  const { t } = useI18n()
  const [items, setItems] = useState<any[]>([])
  const [defaultCode, setDefaultCode] = useState('USD')
  const [msg, setMsg] = useState('')
  const [show, setShow] = useState(false)
  const [form, setForm] = useState({
    code: '',
    name: '',
    symbol: '',
    rate: 1,
    is_default: false,
  })
  const [convert, setConvert] = useState({ amount: 100, from: 'USD', to: 'TRY', result: null as any })

  function load() {
    api.get('/currencies').then((r) => {
      setItems(r.data.items || [])
      setDefaultCode(r.data.default_code || 'USD')
    })
  }

  useEffect(() => {
    load()
  }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.post('/currencies', {
        code: form.code.toUpperCase(),
        name: form.name,
        symbol: form.symbol || form.code,
        rate: form.rate,
        is_default: form.is_default,
      })
      setMsg('Currency created')
      setShow(false)
      setForm({ code: '', name: '', symbol: '', rate: 1, is_default: false })
      load()
    } catch (err: any) {
      setMsg(err.response?.data?.detail || 'Failed')
    }
  }

  async function updateRate(id: number, rate: number) {
    try {
      await api.put(`/currencies/${id}/rate`, { rate })
      setMsg('Rate updated')
      load()
    } catch (err: any) {
      setMsg(err.response?.data?.detail || 'Failed')
    }
  }

  async function setDefault(id: number) {
    try {
      const { data } = await api.post(`/currencies/${id}/set-default`)
      setMsg(data.message || 'Default updated')
      load()
    } catch (err: any) {
      setMsg(err.response?.data?.detail || 'Failed')
    }
  }

  async function doConvert() {
    try {
      const { data } = await api.get('/currencies/convert', {
        params: { amount: convert.amount, from: convert.from, to: convert.to },
      })
      setConvert((c) => ({ ...c, result: data }))
    } catch (err: any) {
      setMsg(err.response?.data?.detail || 'Convert failed')
    }
  }

  return (
    <div className="w-full min-w-0 space-y-5">
      <PageHeader
        title="Currencies"
        subtitle={`Base (default): ${defaultCode} · Rate = value of 1 unit in ${defaultCode}`}
        actions={<Btn onClick={() => setShow(true)}>+ Currency</Btn>}
      />
      {msg && <div className="text-sm bg-sky-50 dark:bg-sky-950 p-3 rounded-xl">{msg}</div>}

      <Card className="space-y-3">
        <h3 className="font-semibold text-sm text-slate-600 dark:text-slate-300">Convert</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <input
            type="number"
            step="any"
            value={convert.amount}
            onChange={(e) => setConvert({ ...convert, amount: Number(e.target.value) })}
            className={inputClass}
          />
          <select value={convert.from} onChange={(e) => setConvert({ ...convert, from: e.target.value })} className={inputClass}>
            {items.map((c) => (
              <option key={c.code} value={c.code}>{c.code}</option>
            ))}
          </select>
          <select value={convert.to} onChange={(e) => setConvert({ ...convert, to: e.target.value })} className={inputClass}>
            {items.map((c) => (
              <option key={c.code} value={c.code}>{c.code}</option>
            ))}
          </select>
          <Btn type="button" onClick={doConvert}>Convert</Btn>
        </div>
        {convert.result && (
          <div className="text-sm tabular-nums">
            {convert.result.amount} {convert.result.from} ={' '}
            <strong>
              {convert.result.converted} {convert.result.to}
            </strong>
            <span className="text-slate-400 ml-2">rate {convert.result.rate}</span>
          </div>
        )}
      </Card>

      {show && (
        <Card>
          <form onSubmit={create} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Code">
                <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputClass} placeholder="EUR" />
              </Field>
              <Field label="Name">
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Symbol">
                <input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} className={inputClass} placeholder="€" />
              </Field>
              <Field label={`Rate (1 unit = ? ${defaultCode})`}>
                <input type="number" step="any" value={form.rate} onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })} className={inputClass} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
              Set as default (base)
            </label>
            <div className="flex gap-2">
              <Btn type="submit">Create</Btn>
              <Btn type="button" variant="secondary" onClick={() => setShow(false)}>{t.cancel}</Btn>
            </div>
          </form>
        </Card>
      )}

      <Card padding={false}>
        {items.length === 0 ? (
          <Empty text="No currencies — run seed or add USD" />
        ) : (
          <ul className="divide-y dark:divide-slate-800">
            {items.map((c) => (
              <li key={c.id} className="p-4 flex flex-wrap gap-3 justify-between items-center">
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    <span className="text-lg">{c.symbol}</span>
                    {c.code} — {c.name}
                    {c.is_default && <Badge color="sky">Default</Badge>}
                    {!c.is_active && <Badge color="slate">Inactive</Badge>}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    1 {c.code} = {Number(c.rate).toFixed(6)} {defaultCode}
                    {c.rate_updated_at && <> · updated {c.rate_updated_at.slice(0, 16)}</>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {!c.is_default && (
                    <>
                      <input
                        type="number"
                        step="any"
                        defaultValue={c.rate}
                        id={`rate-${c.id}`}
                        className={`${inputClass} !w-28 !py-1.5 text-sm`}
                      />
                      <Btn
                        variant="secondary"
                        className="!text-xs !py-1.5"
                        onClick={() => {
                          const el = document.getElementById(`rate-${c.id}`) as HTMLInputElement
                          updateRate(c.id, Number(el.value))
                        }}
                      >
                        Update rate
                      </Btn>
                      <Btn variant="ghost" className="!text-xs !py-1.5" onClick={() => setDefault(c.id)}>
                        Set default
                      </Btn>
                    </>
                  )}
                  {c.is_default && <span className="text-xs text-slate-400">Base rate = 1</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-xs text-slate-400">
        Changing the default recalculates all rates so relative values stay consistent. Product purchase prices and
        proposals store amounts in their own currency codes.
      </p>
    </div>
  )
}
