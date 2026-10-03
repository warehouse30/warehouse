import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'
import { useWarehouse } from '../warehouseContext'
import { useI18n } from '../i18n'
import { PageHeader, Card } from '../ui'

export default function Dashboard() {
  const { current, warehouseId } = useWarehouse()
  const { t, tf } = useI18n()
  const [stats, setStats] = useState({ products: 0, lowStock: 0, warehouses: 0 })

  useEffect(() => {
    Promise.all([
      api.get('/products', { params: { page_size: 1 } }),
      api.get('/stocks', {
        params: { low_stock_only: true, page_size: 1, warehouse_id: warehouseId || undefined },
      }),
      api.get('/warehouses'),
    ])
      .then(([p, s, w]) => {
        setStats({
          products: p.data.total || 0,
          lowStock: s.data.total || 0,
          warehouses: w.data.length || 0,
        })
      })
      .catch(() => {})
  }, [warehouseId])

  const cards = [
    { label: t.dashboard.products, value: stats.products, to: '/products', color: 'from-sky-500 to-sky-600' },
    { label: t.dashboard.lowStock, value: stats.lowStock, to: '/reports', color: 'from-amber-500 to-amber-600' },
    { label: t.dashboard.warehouses, value: stats.warehouses, to: '/warehouses', color: 'from-emerald-500 to-emerald-600' },
  ]

  const actions = [
    { to: '/scanner', title: t.dashboard.scannerTitle, desc: t.dashboard.scannerDesc, accent: 'border-sky-400' },
    { to: '/transfer', title: t.dashboard.transferTitle, desc: t.dashboard.transferDesc, accent: 'border-violet-400' },
    { to: '/cycle-count', title: t.dashboard.cycleTitle, desc: t.dashboard.cycleDesc, accent: 'border-emerald-400' },
    { to: '/slips', title: t.dashboard.slipsTitle, desc: t.dashboard.slipsDesc, accent: 'border-amber-400' },
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        title={t.dashboard.title}
        subtitle={
          current
            ? tf(t.dashboard.subtitle, { code: current.code, name: current.name })
            : t.dashboard.selectWh
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            to={c.to}
            className={`bg-gradient-to-br ${c.color} text-white rounded-2xl p-5 shadow-md hover:shadow-lg hover:scale-[1.01] transition`}
          >
            <div className="text-3xl font-bold tabular-nums">{c.value}</div>
            <div className="text-sm opacity-90 mt-1">{c.label}</div>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{t.dashboard.quickActions}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {actions.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-l-4 ${a.accent} rounded-2xl p-5 shadow-sm hover:shadow-md transition group`}
            >
              <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition">
                {a.title}
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1.5 leading-relaxed">{a.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
