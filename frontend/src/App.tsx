import { Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { getUser, logout } from './api'
import { useWarehouse } from './warehouseContext'
import { useI18n, type Lang } from './i18n'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Scanner from './pages/Scanner'
import Stocks from './pages/Stocks'
import Products from './pages/Products'
import Slips from './pages/Slips'
import Reports from './pages/Reports'
import BulkImport from './pages/BulkImport'
import Warehouses from './pages/Warehouses'
import CycleCountPage from './pages/CycleCount'
import GateVerify from './pages/GateVerify'
import Transfer from './pages/Transfer'
import Pricing from './pages/Pricing'
import Customers from './pages/Customers'
import Proposals from './pages/Proposals'
import ProposalTemplates from './pages/ProposalTemplates'
import Procurement from './pages/Procurement'
import PriceMatrix from './pages/PriceMatrix'
import Currencies from './pages/Currencies'
import RequireRole from './RequireRole'

function Layout({ children }: { children: React.ReactNode }) {
  const user = getUser()
  const navigate = useNavigate()
  const location = useLocation()
  const { warehouses, warehouseId, setWarehouseId, current } = useWarehouse()
  const { t, lang, setLang } = useI18n()
  const [pending, setPending] = useState(0)
  const [online, setOnline] = useState(navigator.onLine)
  const [dark, setDark] = useState(() => localStorage.getItem('dark') === '1')
  const [unread, setUnread] = useState(0)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifs, setNotifs] = useState<any[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('dark', dark ? '1' : '0')
  }, [dark])

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    import('./offlineQueue').then(({ getPendingCount }) => {
      getPendingCount().then(setPending)
      const tmr = setInterval(() => getPendingCount().then(setPending), 5000)
      return () => clearInterval(tmr)
    })
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    const poll = () => {
      import('./api').then(({ default: api }) => {
        api.get('/notifications/unread-count').then((r) => setUnread(r.data.count)).catch(() => {})
      })
    }
    poll()
    const nt = setInterval(poll, 20000)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      clearInterval(nt)
    }
  }, [])

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  if (!user) return <Navigate to="/login" replace />

  const role = String((user as any)?.role || '').toLowerCase()

  const allNav: { to: string; label: string; short: string; roles?: string[] }[] = [
    { to: '/', label: t.nav.dashboard, short: t.nav.home },
    { to: '/scanner', label: t.nav.scanner, short: t.nav.scan },
    { to: '/products', label: t.nav.products, short: t.nav.products },
    { to: '/stocks', label: t.nav.stocks, short: t.nav.stocks },
    { to: '/transfer', label: t.nav.transfer, short: t.nav.transfer },
    { to: '/cycle-count', label: t.nav.cycleCount, short: t.nav.count },
    { to: '/slips', label: t.nav.slips, short: t.nav.slips },
    { to: '/gate', label: t.nav.gate, short: t.nav.gate },
    { to: '/warehouses', label: t.nav.warehouses, short: t.nav.wh },
    { to: '/reports', label: t.nav.reports, short: t.nav.reports },
    { to: '/bulk', label: t.nav.bulk, short: t.nav.bulk, roles: ['admin', 'manager'] },
    { to: '/pricing', label: t.nav.pricing, short: t.nav.price, roles: ['admin', 'manager'] },
    { to: '/customers', label: t.nav.customers, short: t.nav.crm },
    { to: '/proposals', label: t.nav.proposals, short: t.nav.quote },
    { to: '/proposal-templates', label: t.nav.templates, short: t.nav.tpl, roles: ['admin', 'manager'] },
    { to: '/procurement', label: t.nav.procurement || 'Procurement', short: 'PO', roles: ['admin', 'manager'] },
    { to: '/price-matrix', label: t.nav.matrix || 'Matrix', short: 'Matrix', roles: ['admin', 'manager'] },
    { to: '/currencies', label: 'Currencies', short: 'FX', roles: ['admin', 'manager'] },
  ]

  const NAV = allNav.filter((n) => {
    if (!n.roles) return true
    if (role === 'admin') return true
    return n.roles.includes(role)
  })

  return (
    <div className={`min-h-screen ${dark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50'}`}>
      <div className="min-h-screen lg:flex">
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-slate-900 text-white shadow-2xl transition-transform duration-200 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:w-64 lg:translate-x-0 lg:shadow-none`}
        >
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
            <Link to="/" className="flex min-w-0 items-center gap-3 font-semibold tracking-tight">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-sky-400 text-sm font-black text-slate-950">
                W
              </span>
              <span className="truncate">{t.appName}</span>
            </Link>
            <button
              type="button"
              aria-label="Close navigation"
              title="Close navigation"
              className="ml-3 rounded p-2 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              ×
            </button>
          </div>

          <div className="border-b border-slate-800 px-4 py-4">
            <label htmlFor="active-warehouse" className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              {t.nav.warehouses}
            </label>
            <div className="relative">
              <select
                id="active-warehouse"
                value={warehouseId ?? ''}
                onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : null)}
                className="w-full appearance-none rounded-md border border-slate-700 bg-slate-800 py-2 pl-3 pr-8 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500"
                title="Active warehouse"
              >
                {warehouses.length === 0 && <option value="">—</option>}
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">▾</span>
            </div>
            {current?.gate_enabled && (
              <div className="mt-3 flex items-center gap-2 text-xs text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Gate connected
              </div>
            )}
          </div>

          <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
            {NAV.map((n) => {
              const active = n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setSidebarOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-md border-l-2 px-3 py-2.5 text-sm transition-colors ${
                    active
                      ? 'border-sky-400 bg-sky-400/10 text-white'
                      : 'border-transparent text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded text-[10px] font-bold ${active ? 'bg-sky-400 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                    {n.short.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="truncate">{n.label}</span>
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center justify-between gap-3 border-t border-slate-800 px-4 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-700 text-sm font-semibold text-slate-200">
                {String(user.full_name || user.email).slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{user.full_name}</div>
                <div className="text-xs capitalize text-slate-400">{role}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                logout()
                navigate('/login')
              }}
              className="shrink-0 rounded px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
              title={t.logout}
            >
              {t.logout}
            </button>
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 text-slate-800 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 dark:text-white">
            <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  aria-label="Open navigation"
                  title="Open navigation"
                  className="grid h-9 w-9 shrink-0 place-content-center gap-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
                  onClick={() => setSidebarOpen(true)}
                >
                  <span className="h-0.5 w-4 bg-current" />
                  <span className="h-0.5 w-4 bg-current" />
                  <span className="h-0.5 w-4 bg-current" />
                </button>
                <div className="min-w-0">
                  <h1 className="truncate text-sm font-semibold sm:text-base">
                    {NAV.find((n) => n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to))?.label || t.appName}
                  </h1>
                  <p className="hidden truncate text-xs text-slate-500 dark:text-slate-400 sm:block">
                    {current ? `${current.code} — ${current.name}` : t.appName}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                {!online && (
                  <span className="rounded bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800 dark:bg-amber-500 dark:text-black">
                    {t.offline}
                  </span>
                )}
                {pending > 0 && (
                  <span className="rounded bg-sky-100 px-2 py-1 text-[10px] font-bold text-sky-800 dark:bg-sky-500 dark:text-white">
                    {pending} {t.queued}
                  </span>
                )}
                <div className="relative">
                  <button
                    type="button"
                    aria-label={t.notifications?.title || 'Notifications'}
                    title={t.notifications?.title || 'Notifications'}
                    className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                    onClick={() => {
                      setNotifOpen(!notifOpen)
                      if (!notifOpen) {
                        import('./api').then(({ default: api }) => {
                          api.get('/notifications').then((r) => setNotifs(r.data)).catch(() => {})
                        })
                      }
                    }}
                  >
                    🔔
                    {unread > 0 && (
                      <span className="absolute right-0 top-0 min-w-4 rounded-full bg-rose-500 px-1 text-[9px] leading-4 text-white">
                        {unread}
                      </span>
                    )}
                  </button>
                  {notifOpen && (
                    <div className="absolute right-0 z-50 mt-2 max-h-80 w-72 overflow-y-auto rounded-md border border-slate-200 bg-white text-xs text-slate-800 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                      <div className="flex justify-between border-b border-slate-200 p-2 dark:border-slate-800">
                        <span className="font-semibold">{t.notifications?.title || 'Notifications'}</span>
                        <button
                          type="button"
                          className="text-sky-600"
                          onClick={() => {
                            import('./api').then(({ default: api }) => {
                              api.post('/notifications/read-all').then(() => {
                                setUnread(0)
                                setNotifs((ns) => ns.map((n) => ({ ...n, is_read: true })))
                              })
                            })
                          }}
                        >
                          {t.notifications?.markAll || 'Mark all read'}
                        </button>
                      </div>
                      {notifs.length === 0 && (
                        <div className="p-3 text-slate-400">{t.notifications?.empty || 'No notifications'}</div>
                      )}
                      {notifs.map((n) => (
                        <div
                          key={n.id}
                          className={`border-b border-slate-100 p-2 dark:border-slate-800 ${n.is_read ? 'opacity-60' : ''}`}
                        >
                          <div className="font-medium">{n.title}</div>
                          {n.body && <div className="text-slate-500">{n.body}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value as Lang)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  title={t.language}
                  aria-label={t.language}
                >
                  <option value="en">EN</option>
                  <option value="tr">TR</option>
                </select>
                <button
                  type="button"
                  onClick={() => setDark(!dark)}
                  className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                  title={dark ? t.light : t.dark}
                  aria-label={dark ? t.light : t.dark}
                >
                  {dark ? '☀' : '☾'}
                </button>
              </div>
            </div>
          </header>

          <main className="w-full min-w-0 flex-1 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Layout><Dashboard /></Layout>} />
      <Route path="/scanner" element={<Layout><Scanner /></Layout>} />
      <Route path="/products" element={<Layout><Products /></Layout>} />
      <Route path="/stocks" element={<Layout><Stocks /></Layout>} />
      <Route path="/transfer" element={<Layout><Transfer /></Layout>} />
      <Route path="/cycle-count" element={<Layout><CycleCountPage /></Layout>} />
      <Route path="/slips" element={<Layout><Slips /></Layout>} />
      <Route path="/gate" element={<Layout><GateVerify /></Layout>} />
      <Route path="/warehouses" element={<Layout><RequireRole roles={["admin","manager"]}><Warehouses /></RequireRole></Layout>} />
      <Route path="/reports" element={<Layout><Reports /></Layout>} />
      <Route path="/bulk" element={<Layout><RequireRole roles={["admin","manager"]}><BulkImport /></RequireRole></Layout>} />
      <Route path="/pricing" element={<Layout><RequireRole roles={["admin","manager"]}><Pricing /></RequireRole></Layout>} />
      <Route path="/customers" element={<Layout><Customers /></Layout>} />
      <Route path="/proposals" element={<Layout><Proposals /></Layout>} />
      <Route path="/proposal-templates" element={<Layout><RequireRole roles={["admin","manager"]}><ProposalTemplates /></RequireRole></Layout>} />
      <Route path="/procurement" element={<Layout><RequireRole roles={["admin","manager"]}><Procurement /></RequireRole></Layout>} />
      <Route path="/price-matrix" element={<Layout><RequireRole roles={["admin","manager"]}><PriceMatrix /></RequireRole></Layout>} />
      <Route path="/currencies" element={<Layout><RequireRole roles={["admin","manager"]}><Currencies /></RequireRole></Layout>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
