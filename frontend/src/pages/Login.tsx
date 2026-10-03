import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../api'
import { useI18n, type Lang } from '../i18n'

export default function Login() {
  const [email, setEmail] = useState('admin@warehouse.local')
  const [password, setPassword] = useState('admin123')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { t, lang, setLang } = useI18n()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.detail || t.login.failed)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8 w-full max-w-sm space-y-5 border border-slate-200/10"
      >
        <div className="flex justify-end">
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            className="text-xs border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg px-2 py-1"
          >
            <option value="en">English</option>
            <option value="tr">Türkçe</option>
          </select>
        </div>
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-sky-600 text-white font-bold text-lg mb-2">
            W
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{t.login.title}</h1>
          <p className="text-sm text-slate-500">{t.login.subtitle}</p>
        </div>
        {error && (
          <div className="bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-200 text-sm p-3 rounded-xl border border-rose-100 dark:border-rose-900">
            {error}
          </div>
        )}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t.login.email}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500"
            required
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t.login.password}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500"
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl disabled:opacity-50 transition shadow-sm"
        >
          {loading ? t.login.signingIn : t.login.submit}
        </button>
        <p className="text-[11px] text-center text-slate-400">{t.login.demo}</p>
      </form>
    </div>
  )
}
