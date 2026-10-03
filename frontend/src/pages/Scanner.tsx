import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import api from '../api'
import { useWarehouse } from '../warehouseContext'
import { enqueueStockAdjust, processQueue } from '../offlineQueue'
import { PageHeader, Card, Btn, Field, inputClass, Badge } from '../ui'
import { useI18n } from '../i18n'

export default function Scanner() {
  const { t, tf } = useI18n()
  const { warehouses, warehouseId, setWarehouseId, current } = useWarehouse()
  const [mode, setMode] = useState<'in' | 'out'>('out')
  const [qty, setQty] = useState(1)
  const [lastResult, setLastResult] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [scanning, setScanning] = useState(false)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const processing = useRef(false)
  const acceptedBarcode = useRef<string | null>(null)
  const scanReleaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastAdjust = useRef<{ barcode: string; quantity_delta: number; warehouse_id: number; at: number } | null>(null)

  useEffect(() => {
    return () => {
      if (scanReleaseTimer.current) clearTimeout(scanReleaseTimer.current)
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {})
      }
    }
  }, [])

  function playBeep() {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.value = 0.15
      osc.start()
      setTimeout(() => {
        osc.stop()
        ctx.close()
      }, 120)
    } catch {}
  }

  function vibrate() {
    if (navigator.vibrate) navigator.vibrate(80)
  }

  async function handleScan(barcode: string) {
    if (processing.current || !warehouseId) return
    if (acceptedBarcode.current === barcode) return
    acceptedBarcode.current = barcode
    processing.current = true
    setLastResult(barcode)
    playBeep()
    vibrate()

    const delta = mode === 'in' ? qty : -qty
    const payload = {
      barcode,
      quantity_delta: delta,
      warehouse_id: warehouseId,
      reason: 'scan',
    }

    setStatus(`Queued: ${barcode} (${delta > 0 ? '+' : ''}${delta})`)

    if (!navigator.onLine) {
      await enqueueStockAdjust(payload)
      setStatus(`Offline queued: ${barcode}`)
      processing.current = false
      return
    }

    try {
      const key = crypto.randomUUID?.() || String(Date.now())
      const { data } = await api.post('/stocks/adjust', payload, {
        headers: { 'X-Idempotency-Key': key },
      })
      setStatus(`OK: ${data.product_sku || barcode} → qty ${data.quantity}`)
      lastAdjust.current = { barcode, quantity_delta: delta, warehouse_id: warehouseId, at: Date.now() }
    } catch (err: any) {
      await enqueueStockAdjust(payload)
      setStatus(`Error – queued offline: ${err.response?.data?.detail || err.message}`)
    }
    processing.current = false
  }

  async function startScanner() {
    if (scanning) return
    const html5 = new Html5Qrcode('reader')
    scannerRef.current = html5
    try {
      await html5.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decoded) => {
          if (scanReleaseTimer.current) {
            clearTimeout(scanReleaseTimer.current)
            scanReleaseTimer.current = null
          }
          void handleScan(decoded)
        },
        () => {
          if (acceptedBarcode.current && !scanReleaseTimer.current) {
            scanReleaseTimer.current = setTimeout(() => {
              acceptedBarcode.current = null
              scanReleaseTimer.current = null
            }, 800)
          }
        }
      )
      setScanning(true)
    } catch (e: any) {
      setStatus('Camera error: ' + e.message)
    }
  }

  async function stopScanner() {
    if (scannerRef.current?.isScanning) {
      await scannerRef.current.stop()
    }
    if (scanReleaseTimer.current) clearTimeout(scanReleaseTimer.current)
    scanReleaseTimer.current = null
    acceptedBarcode.current = null
    setScanning(false)
  }

  async function undoLast() {
    const last = lastAdjust.current
    if (!last || Date.now() - last.at > 30000) {
      setStatus('Nothing to undo (30s window)')
      return
    }
    try {
      const { data } = await api.post('/stocks/adjust', {
        barcode: last.barcode,
        quantity_delta: -last.quantity_delta,
        warehouse_id: last.warehouse_id,
        reason: 'undo_scan',
      })
      setStatus(`Undone → qty ${data.quantity}`)
      lastAdjust.current = null
    } catch (err: any) {
      setStatus(err.response?.data?.detail || 'Undo failed')
    }
  }

  async function syncNow() {
    const n = await processQueue((url, data, headers) => api.post(url, data, { headers }))
    setStatus(`Synced ${n} items`)
  }

  return (
    <div className="w-full min-w-0 space-y-4">
      <PageHeader
        title={t.scanner.title}
        subtitle={current ? `Warehouse ${current.code}` : 'Select a warehouse in the header'}
      />

      <Card className="space-y-4">
        <Field label="Warehouse">
          <select
            value={warehouseId ?? ''}
            onChange={(e) => setWarehouseId(Number(e.target.value))}
            className={inputClass}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} – {w.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode('in')}
            className={`py-3 rounded-xl font-semibold text-sm transition ${
              mode === 'in'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            + IN
          </button>
          <button
            type="button"
            onClick={() => setMode('out')}
            className={`py-3 rounded-xl font-semibold text-sm transition ${
              mode === 'out'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            − OUT
          </button>
        </div>

        <Field label="Quantity per scan">
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
            className={`${inputClass} text-center text-lg font-semibold max-w-[120px]`}
          />
        </Field>
      </Card>

      <div
        id="reader"
        className="w-full overflow-hidden rounded-2xl bg-slate-900 min-h-[220px] border border-slate-800"
      />

      <div className="flex gap-2">
        {!scanning ? (
          <Btn onClick={startScanner} className="flex-1 py-3.5" disabled={!warehouseId}>
            Start camera
          </Btn>
        ) : (
          <Btn onClick={stopScanner} variant="secondary" className="flex-1 py-3.5">
            Stop camera
          </Btn>
        )}
        <Btn onClick={syncNow} variant="secondary">
          Sync
        </Btn>
        <Btn onClick={undoLast} variant="ghost">
          Undo
        </Btn>
      </div>

      {lastResult && (
        <Card className="!p-3 font-mono text-sm bg-slate-900 text-white border-slate-800 dark:bg-slate-950">
          Last: {lastResult}
        </Card>
      )}
      {status && (
        <div className="bg-sky-50 dark:bg-sky-950 text-sky-900 dark:text-sky-100 rounded-xl p-3 text-sm border border-sky-100 dark:border-sky-900">
          {status}
        </div>
      )}
      {!warehouseId && <Badge color="amber">Select a warehouse first</Badge>}
    </div>
  )
}
