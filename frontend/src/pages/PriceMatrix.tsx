import { useEffect, useState } from 'react'
import api from '../api'
import { useI18n } from '../i18n'
import { PageHeader, Card, Empty } from '../ui'

export default function PriceMatrix() {
  const { t } = useI18n()
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    api.get('/pricing/price-matrix', { params: { limit: 80 } }).then((r) => setData(r.data))
  }, [])

  if (!data) return <div className="p-6 text-slate-500">{t.loading}</div>

  return (
    <div className="space-y-4">
      <PageHeader title={t.priceMatrix?.title || "Price matrix"} subtitle={t.priceMatrix?.subtitle || ""} />
      <Card padding={false} className="overflow-x-auto">
        {!data.rows?.length ? (
          <Empty text="No products" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500">
              <tr>
                <th className="p-2 sticky left-0 bg-slate-50 dark:bg-slate-800">SKU</th>
                <th className="p-2">Name</th>
                <th className="p-2 text-right">Purchase</th>
                {data.price_lists.map((pl: any) => (
                  <th key={pl.code} className="p-2 text-right">{pl.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row: any) => (
                <tr key={row.product_id} className="border-t dark:border-slate-800">
                  <td className="p-2 font-mono text-xs sticky left-0 bg-white dark:bg-slate-900">{row.sku}</td>
                  <td className="p-2">{row.name}</td>
                  <td className="p-2 text-right tabular-nums">
                    {row.purchase?.purchase_price?.toFixed?.(2) ?? row.purchase?.purchase_price}
                    <span className="text-xs text-slate-400 ml-1">
                      +{row.purchase?.purchase_tax_percent}%
                    </span>
                  </td>
                  {data.price_lists.map((pl: any) => {
                    const cell = row.lists?.[pl.code]
                    return (
                      <td key={pl.code} className="p-2 text-right tabular-nums">
                        {cell ? (
                          <>
                            <div className="font-medium">{Number(cell.sales_price_incl_tax).toFixed(2)}</div>
                            <div className="text-[10px] text-slate-400">{cell.formula || '—'}</div>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
