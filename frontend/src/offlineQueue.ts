import { openDB, DBSchema, IDBPDatabase } from 'idb'

interface QueueItem {
  id?: number
  type: 'stock_adjust'
  payload: any
  idempotencyKey: string
  createdAt: string
  retries: number
  status: 'pending' | 'syncing' | 'failed'
}

interface WarehouseDB extends DBSchema {
  queue: {
    key: number
    value: QueueItem
    indexes: { 'by-status': string }
  }
}

let dbPromise: Promise<IDBPDatabase<WarehouseDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<WarehouseDB>('warehouse-offline', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true })
          store.createIndex('by-status', 'status')
        }
      },
    })
  }
  return dbPromise
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export async function enqueueStockAdjust(payload: any) {
  const db = await getDB()
  const item: QueueItem = {
    type: 'stock_adjust',
    payload,
    idempotencyKey: uuid(),
    createdAt: new Date().toISOString(),
    retries: 0,
    status: 'pending',
  }
  await db.add('queue', item)
  return item
}

export async function getPendingCount(): Promise<number> {
  const db = await getDB()
  return db.countFromIndex('queue', 'by-status', 'pending')
}

export async function processQueue(apiPost: (url: string, data: any, headers?: Record<string, string>) => Promise<any>) {
  const db = await getDB()
  const pending = await db.getAllFromIndex('queue', 'by-status', 'pending')
  let synced = 0
  for (const item of pending) {
    try {
      item.status = 'syncing'
      await db.put('queue', item)
      await apiPost('/stocks/adjust', item.payload, {
        'X-Idempotency-Key': item.idempotencyKey,
      })
      await db.delete('queue', item.id!)
      synced++
    } catch (e) {
      item.status = 'pending'
      item.retries += 1
      await db.put('queue', item)
      if (item.retries > 5) {
        item.status = 'failed'
        await db.put('queue', item)
      }
    }
  }
  return synced
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    import('./api').then(({ default: api }) => {
      processQueue((url, data, headers) =>
        api.post(url, data, { headers })
      )
    })
  })
}
