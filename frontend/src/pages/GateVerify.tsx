import { useState } from 'react'
import api from '../api'
import { useI18n } from '../i18n'
import { PageHeader, Card, Btn, inputClass, Badge } from '../ui'

export default function GateVerify() {
  const { t } = useI18n()
  const [code, setCode] = useState('')
  const [result, setResult] = useState<any>(null)
  const [msg, setMsg] = useState('')

  async function verify() {
    setMsg('')
    setResult(null)
    try {
      const { data } = await api.get(`/slips/verify/${encodeURIComponent(code.trim())}`)
      setResult(data)
    } catch (err: any) {
      setMsg(err.response?.data?.detail || 'Not found')
    }
  }

  async function markExit() {
    if (!result?.slip) return
    try {
      await api.post(`/slips/verify/${result.slip.slip_number}/exit`)
      setMsg('Exit recorded')
      verify()
    } catch (err: any) {
      setMsg(err.response?.data?.detail || 'Exit failed')
    }
  }

  return (
    <div className="w-full min-w-0 space-y-4">
      <PageHeader title={t.gatePage?.title || t.gate.title} subtitle={t.gatePage?.subtitle} />
      <Card className="!p-3 flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && verify()}
          placeholder={t.gatePage?.slipNumber || 'Slip number'}
          className={`${inputClass} flex-1`}
          autoFocus
        />
        <Btn onClick={verify}>{t.gatePage?.verify || 'Verify'}</Btn>
      </Card>
      {msg && <div className="text-sm p-3 rounded-xl bg-slate-100 dark:bg-slate-800">{msg}</div>}
      {result?.slip && (
        <Card className="space-y-3">
          <div className="flex justify-between items-start">
            <div className="font-mono font-bold text-lg">{result.slip.slip_number}</div>
            <Badge color={result.can_exit ? 'emerald' : 'rose'}>
              {result.can_exit ? t.gatePage?.canExit || 'OK' : t.gatePage?.blocked || 'Blocked'}
            </Badge>
          </div>
          <div className="text-sm space-y-1">
            <div>Status: <strong className="uppercase">{result.slip.status}</strong></div>
            <div>Type: {result.slip.slip_type}</div>
            {result.slip.customer_name && <div>Customer: {result.slip.customer_name}</div>}
            {result.slip.vehicle_number && <div>Vehicle: {result.slip.vehicle_number}</div>}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-1">SKU</th>
                <th className="pb-1 text-right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {result.slip.items?.map((it: any) => (
                <tr key={it.id} className="border-t dark:border-slate-800">
                  <td className="py-1.5">
                    {it.product_sku} {it.product_name}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{it.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.can_exit && (
            <Btn onClick={markExit} variant="success" className="w-full">
              Record exit
            </Btn>
          )}
        </Card>
      )}
    </div>
  )
}
