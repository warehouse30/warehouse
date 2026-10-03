import { useState, useEffect } from 'react'
import api from '../api'
import { useI18n } from '../i18n'
import { PageHeader, Card, Btn, Field, inputClass } from '../ui'

export default function BulkImport() {
  const { t } = useI18n()
  const [file, setFile] = useState<File | null>(null)
  const [warehouseId, setWarehouseId] = useState<number | ''>('')
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [jobId, setJobId] = useState<string | null>(null)
  const [status, setStatus] = useState<any>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.get('/warehouses').then((r) => setWarehouses(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!jobId) return
    const id = setInterval(() => {
      api.get(`/bulk/jobs/${jobId}`).then((r) => {
        setStatus(r.data)
        if (r.data.status === 'done' || r.data.status === 'failed') clearInterval(id)
      }).catch(() => clearInterval(id))
    }, 1000)
    return () => clearInterval(id)
  }, [jobId])

  async function upload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setMsg('')
    const fd = new FormData()
    fd.append('file', file)
    if (warehouseId) fd.append('warehouse_id', String(warehouseId))
    try {
      const { data } = await api.post('/bulk/import/products', fd)
      setJobId(data.job_id)
      setMsg('Upload started…')
    } catch (err: any) {
      setMsg(err.response?.data?.detail || 'Upload failed')
    }
  }

  return (
    <div className="w-full min-w-0 space-y-4">
      <PageHeader title={t.bulkPage?.title || t.bulk.title} subtitle={t.bulkPage?.subtitle} />
      <Card>
        <form onSubmit={upload} className="space-y-3">
          <Field label={t.bulkPage?.upload || 'File'}>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm"
            />
          </Field>
          <Field label={t.common.warehouse}>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : '')}
              className={inputClass}
            >
              <option value="">No initial stock</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} – {w.name}
                </option>
              ))}
            </select>
          </Field>
          <Btn type="submit" disabled={!file} className="w-full">
            Upload & Import
          </Btn>
        </form>
      </Card>
      {msg && <div className="text-sm text-slate-600 dark:text-slate-300">{msg}</div>}
      {status && (
        <Card className="text-sm space-y-2">
          <div>
            Status: <strong>{status.status}</strong>
          </div>
          <div>
            Progress: {status.progress} / {status.total}
          </div>
          {status.errors?.length > 0 && (
            <div className="text-rose-600 text-xs">Errors: {status.errors.slice(0, 5).join('; ')}</div>
          )}
          {status.total > 0 && (
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
              <div
                className="bg-sky-500 h-2 rounded-full transition-all"
                style={{ width: `${(status.progress / Math.max(status.total, 1)) * 100}%` }}
              />
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
