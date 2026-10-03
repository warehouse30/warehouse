import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import api from './api'

export type Warehouse = {
  id: number
  code: string
  name: string
  gate_enabled?: boolean
  gate_host?: string
}

type Ctx = {
  warehouses: Warehouse[]
  warehouseId: number | null
  setWarehouseId: (id: number | null) => void
  current: Warehouse | null
  loading: boolean
  refresh: () => void
}

const WarehouseContext = createContext<Ctx | null>(null)

const STORAGE_KEY = 'wh_selected_id'

export function WarehouseProvider({ children }: { children: ReactNode }) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseId, setWarehouseIdState] = useState<number | null>(() => {
    const s = localStorage.getItem(STORAGE_KEY)
    return s ? Number(s) : null
  })
  const [loading, setLoading] = useState(true)

  function refresh() {
    const token = localStorage.getItem('token')
    if (!token) {
      setWarehouses([])
      setLoading(false)
      return
    }
    setLoading(true)
    api
      .get('/warehouses')
      .then((r) => {
        const list: Warehouse[] = r.data || []
        setWarehouses(list)
        setWarehouseIdState((prev) => {
          if (prev && list.some((w) => w.id === prev)) return prev
          if (list.length) {
            localStorage.setItem(STORAGE_KEY, String(list[0].id))
            return list[0].id
          }
          return null
        })
      })
      .catch(() => setWarehouses([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    refresh()
    // Re-fetch after login (token appears)
    const onStorage = () => refresh()
    window.addEventListener('storage', onStorage)
    window.addEventListener('warehouse-auth', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('warehouse-auth', onStorage)
    }
  }, [])

  function setWarehouseId(id: number | null) {
    setWarehouseIdState(id)
    if (id != null) localStorage.setItem(STORAGE_KEY, String(id))
    else localStorage.removeItem(STORAGE_KEY)
  }

  const current = warehouses.find((w) => w.id === warehouseId) || null

  return (
    <WarehouseContext.Provider
      value={{ warehouses, warehouseId, setWarehouseId, current, loading, refresh }}
    >
      {children}
    </WarehouseContext.Provider>
  )
}

export function useWarehouse() {
  const ctx = useContext(WarehouseContext)
  if (!ctx) throw new Error('useWarehouse must be used within WarehouseProvider')
  return ctx
}
