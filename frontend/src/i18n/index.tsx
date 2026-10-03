import { createContext, useContext, useMemo, useState, useEffect, ReactNode } from 'react'
import { en, type Dict } from './en'
import { tr } from './tr'

export type Lang = 'en' | 'tr'

const dicts: Record<Lang, Dict> = { en, tr }

type I18nCtx = {
  lang: Lang
  setLang: (l: Lang) => void
  t: Dict
  /** Replace {key} placeholders in a string */
  tf: (template: string, vars: Record<string, string | number>) => string
}

const Ctx = createContext<I18nCtx | null>(null)
const STORAGE = 'wh_lang'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const s = localStorage.getItem(STORAGE)
    if (s === 'tr' || s === 'en') return s
    const nav = (navigator.language || '').toLowerCase()
    return nav.startsWith('tr') ? 'tr' : 'en'
  })

  useEffect(() => {
    localStorage.setItem(STORAGE, lang)
    document.documentElement.lang = lang
  }, [lang])

  function setLang(l: Lang) {
    setLangState(l)
  }

  const t = dicts[lang]

  function tf(template: string, vars: Record<string, string | number>) {
    return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
  }

  const value = useMemo(() => ({ lang, setLang, t, tf }), [lang, t])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
