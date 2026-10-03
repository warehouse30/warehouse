import { useEffect, useRef, useState } from 'react'
import grapesjs, { type Editor } from 'grapesjs'
import webpagePreset from 'grapesjs-preset-webpage'
import 'grapesjs/dist/css/grapes.min.css'

type Props = {
  html: string
  css: string
  canvasCss: string
  onChange: (html: string, css: string) => void
}

const blocks = [
  { id: 'proposal-section', label: 'Section', category: 'Layout', content: '<section style="padding:24px 0"><div style="max-width:960px;margin:auto"><h2>Section heading</h2><p>Add proposal content here.</p></div></section>' },
  { id: 'proposal-columns', label: 'Two columns', category: 'Layout', content: '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:16px 0"><div><h3>Left column</h3><p>Content</p></div><div><h3>Right column</h3><p>Content</p></div></div>' },
  { id: 'proposal-heading', label: 'Heading', category: 'Content', content: '<h2 style="margin:16px 0 8px">Heading</h2>' },
  { id: 'proposal-text', label: 'Text', category: 'Content', content: '<p style="margin:8px 0">Write proposal text here.</p>' },
  { id: 'proposal-divider', label: 'Divider', category: 'Content', content: '<hr style="border:0;border-top:1px solid #cbd5e1;margin:20px 0">' },
  { id: 'proposal-customer', label: 'Customer details', category: 'Proposal fields', content: '<section style="padding:12px 0"><h3>{{ customer.name }}</h3><p>{{ customer.code }}</p><p>{{ customer.address }}</p><p>{{ customer.email }}</p></section>' },
  { id: 'proposal-summary', label: 'Proposal summary', category: 'Proposal fields', content: '<section style="padding:12px 0"><h2>{{ proposal.title }}</h2><p>{{ proposal.number }} · {{ proposal.created_at }}</p><p>{{ proposal.notes }}</p></section>' },
  { id: 'proposal-table', label: 'Table (3 × 3)', category: 'Tables', content: '<table style="width:100%;border-collapse:collapse;margin:16px 0"><thead><tr><th style="border:1px solid #cbd5e1;padding:8px">Header 1</th><th style="border:1px solid #cbd5e1;padding:8px">Header 2</th><th style="border:1px solid #cbd5e1;padding:8px">Header 3</th></tr></thead><tbody><tr><td style="border:1px solid #cbd5e1;padding:8px">Cell</td><td style="border:1px solid #cbd5e1;padding:8px">Cell</td><td style="border:1px solid #cbd5e1;padding:8px">Cell</td></tr><tr><td style="border:1px solid #cbd5e1;padding:8px">Cell</td><td style="border:1px solid #cbd5e1;padding:8px">Cell</td><td style="border:1px solid #cbd5e1;padding:8px">Cell</td></tr></tbody></table>' },
]

function componentTag(component: any) {
  return String(component?.get?.('tagName') || component?.getName?.() || '').toLowerCase()
}

function closestComponent(component: any, tags: string[]) {
  let current = component
  while (current) {
    if (tags.includes(componentTag(current))) return current
    current = current.parent?.()
  }
  return undefined
}

function childCells(row: any) {
  return (row?.components?.().models || []).filter((component: any) => ['td', 'th'].includes(componentTag(component)))
}

function sectionGrid(table: any, section: any) {
  const rows = table.find('tr').filter((row: any) => closestComponent(row, ['thead', 'tbody', 'tfoot']) === section)
  const grid: any[][] = []
  const positions = new Map<any, { row: number; column: number; rowSpan: number; columnSpan: number }>()
  rows.forEach((row: any, rowIndex: number) => {
    grid[rowIndex] ||= []
    let columnIndex = 0
    childCells(row).forEach((cell: any) => {
      while (grid[rowIndex][columnIndex]) columnIndex += 1
      const attrs = cell.getAttributes()
      const rowSpan = Math.max(1, Number(attrs.rowspan) || 1)
      const columnSpan = Math.max(1, Number(attrs.colspan) || 1)
      positions.set(cell, { row: rowIndex, column: columnIndex, rowSpan, columnSpan })
      for (let rowOffset = 0; rowOffset < rowSpan && rowIndex + rowOffset < rows.length; rowOffset += 1) {
        grid[rowIndex + rowOffset] ||= []
        for (let columnOffset = 0; columnOffset < columnSpan; columnOffset += 1) {
          grid[rowIndex + rowOffset][columnIndex + columnOffset] = cell
        }
      }
      columnIndex += columnSpan
    })
  })
  return { rows, grid, positions }
}

export default function VisualTemplateEditor({ html, css, canvasCss, onChange }: Props) {
  const mount = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const onChangeRef = useRef(onChange)
  const [selectedCellCount, setSelectedCellCount] = useState(0)
  const [cellWidth, setCellWidth] = useState(160)
  const [cellHeight, setCellHeight] = useState(48)
  const [tableMessage, setTableMessage] = useState('Select a table cell to add rows or columns. Ctrl/Shift-click adjacent cells to merge.')
  onChangeRef.current = onChange

  function syncCanvasHtml() {
    const editor = editorRef.current
    const canvasDocument = editor?.Canvas.getDocument()
    if (!editor || !canvasDocument?.body) return
    const body = canvasDocument.body.cloneNode(true) as HTMLElement
    body.querySelector('[data-proposal-template-styles]')?.remove()
    body.querySelectorAll('*').forEach((element) => {
      for (const attribute of Array.from(element.attributes)) {
        if (attribute.name.startsWith('data-gjs') || attribute.name === 'contenteditable') {
          element.removeAttribute(attribute.name)
        }
      }
      element.classList.remove('gjs-selected', 'gjs-hover', 'gjs-hovered')
    })
    onChangeRef.current(body.innerHTML, editor.getCss())
  }

  function beginCellTextEdit(component: any, element = component?.getEl?.() as HTMLElement | undefined) {
    if (!component || !element || element.isContentEditable) return
    element.contentEditable = 'true'
    element.focus()
    setTableMessage('Edit the cell text. Click outside the cell or press Escape to save.')
    const finishEditing = () => {
      const content = element.innerHTML
      element.removeAttribute('contenteditable')
      component.components(content)
      syncCanvasHtml()
    }
    element.addEventListener('input', syncCanvasHtml)
    element.addEventListener('blur', finishEditing, { once: true })
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
        event.preventDefault()
        element.blur()
      }
    }, { once: true })
  }

  useEffect(() => {
    const updateSelection = () => {
      const currentEditor = editorRef.current
      if (!currentEditor) return
      const cells = currentEditor.getSelectedAll()
        .map((component) => closestComponent(component, ['td', 'th']))
        .filter((component, index, all) => component && all.indexOf(component) === index)
      setSelectedCellCount(cells.length)
      const style = cells[0]?.getStyle?.() || {}
      setCellWidth(Number.parseInt(style.width, 10) || 160)
      setCellHeight(Number.parseInt(style.height, 10) || 48)
    }
    const selectAdditionalCells = (event: MouseEvent) => {
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey) return
      const target = event.target as HTMLElement | null
      const cell = target?.closest('td, th')
      if (!cell) return
      event.preventDefault()
      event.stopPropagation()
      editorRef.current?.selectAdd(cell)
      updateSelection()
    }
    const editTableCell = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const cell = target?.closest('td, th') as HTMLElement | null
      const currentEditor = editorRef.current
      if (!cell || !currentEditor || cell.isContentEditable) return
      event.preventDefault()
      currentEditor.select(cell)
      beginCellTextEdit(currentEditor.getSelected(), cell)
    }
    if (!mount.current) return
    const editor = grapesjs.init({
      container: mount.current,
      height: '660px',
      width: 'auto',
      fromElement: false,
      storageManager: false,
      components: html,
      style: css,
      plugins: [webpagePreset],
      blockManager: { blocks },
    })
    editorRef.current = editor
    const applyCanvasStyles = () => {
      const canvasDocument = editor.Canvas.getDocument()
      if (!canvasCss || !canvasDocument?.body || canvasDocument.querySelector('[data-proposal-template-styles]')) return
      const templateStyles = canvasDocument.createElement('style')
      templateStyles.dataset.proposalTemplateStyles = 'true'
      templateStyles.textContent = canvasCss
      canvasDocument.body.insertBefore(templateStyles, canvasDocument.body.firstChild)
    }
    const bindCanvas = () => {
      const canvasDocument = editor.Canvas.getDocument()
      if (!canvasDocument || canvasDocument.documentElement.dataset.tableSelectionBound) return
      canvasDocument.documentElement.dataset.tableSelectionBound = 'true'
      canvasDocument.addEventListener('click', selectAdditionalCells, true)
      canvasDocument.addEventListener('dblclick', editTableCell, true)
    }
    editor.on('load', applyCanvasStyles)
    editor.on('canvas:frame:load', applyCanvasStyles)
    editor.on('canvas:frame:load', bindCanvas)
    editor.on('component:selected', updateSelection)
    editor.on('component:deselected', updateSelection)
    applyCanvasStyles()
    bindCanvas()
    editor.on('update', syncCanvasHtml)

    return () => {
      const canvasDocument = editor.Canvas.getDocument()
      canvasDocument?.removeEventListener('click', selectAdditionalCells, true)
      canvasDocument?.removeEventListener('dblclick', editTableCell, true)
      editor.destroy()
      editorRef.current = null
    }
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    if (editor && editor.getCss() !== css) editor.setStyle(css)
  }, [css])

  function addTable() {
    const editor = editorRef.current
    if (!editor) return
    const table = editor.addComponents(blocks.find((block) => block.id === 'proposal-table')!.content)[0]
    editor.select(table)
    setTableMessage('Table added. Select a cell to edit its rows and columns.')
  }

  function selectedTableContext() {
    const editor = editorRef.current
    const selected = editor?.getSelectedAll() || []
    const cell = selected.map((component) => closestComponent(component, ['td', 'th'])).find(Boolean)
    if (!cell) return undefined
    const row = closestComponent(cell, ['tr'])
    const table = closestComponent(cell, ['table'])
    return row && table ? { cell, row, table } : undefined
  }

  function editSelectedCellText() {
    const context = selectedTableContext()
    if (!context) return setTableMessage('Select a table cell before editing its text.')
    beginCellTextEdit(context.cell)
  }

  function addRow() {
    const context = selectedTableContext()
    if (!context) return setTableMessage('Select a cell inside a table first.')
    const columnCount = Math.max(1, ...context.table.find('tr').map((row: any) => childCells(row).length))
    const body = context.table.find('tbody')[0] || context.table.append('<tbody></tbody>')[0]
    body.append({
      type: 'row',
      tagName: 'tr',
      components: Array.from({ length: columnCount }, () => ({ type: 'cell', tagName: 'td', components: 'New cell' })),
    })
    setTableMessage(`Added a row with ${columnCount} cells.`)
  }

  function addColumn() {
    const context = selectedTableContext()
    if (!context) return setTableMessage('Select a cell inside a table first.')
    const selectedRowCells = childCells(context.row)
    const columnIndex = selectedRowCells.indexOf(context.cell)
    if (columnIndex < 0) return setTableMessage('Select a table cell first.')
    context.table.find('tr').forEach((row: any) => {
      const cells = childCells(row)
      const reference = cells[Math.min(columnIndex, cells.length - 1)]
      const index = reference ? row.components().models.indexOf(reference) + 1 : row.components().length
      const tag = cells.length && componentTag(cells[0]) === 'th' ? 'th' : 'td'
      row.append({ type: 'cell', tagName: tag, components: 'New cell' }, { at: index })
    })
    setTableMessage('Added a column after the selected cell.')
  }

  function mergeCells() {
    const editor = editorRef.current
    if (!editor) return
    const cells = editor.getSelectedAll()
      .map((component) => closestComponent(component, ['td', 'th']))
      .filter((component, index, all) => component && all.indexOf(component) === index)
    if (cells.length < 2) return setTableMessage('Ctrl/Shift-click at least two cells in the same table.')
    const table = closestComponent(cells[0], ['table'])
    if (!table || cells.some((cell) => closestComponent(cell, ['table']) !== table)) {
      return setTableMessage('Cells must belong to the same table.')
    }
    const section = closestComponent(cells[0], ['thead', 'tbody', 'tfoot']) || table
    if (cells.some((cell) => (closestComponent(cell, ['thead', 'tbody', 'tfoot']) || table) !== section)) {
      return setTableMessage('Cells must belong to the same table section.')
    }
    const { grid, positions } = sectionGrid(table, section)
    const selected = new Set(cells)
    const cellPositions = cells.map((cell) => positions.get(cell)).filter(Boolean) as Array<{ row: number; column: number; rowSpan: number; columnSpan: number }>
    if (cellPositions.length !== cells.length) return setTableMessage('Could not resolve all selected table cells.')
    const firstRow = Math.min(...cellPositions.map((position) => position.row))
    const firstColumn = Math.min(...cellPositions.map((position) => position.column))
    const lastRow = Math.max(...cellPositions.map((position) => position.row + position.rowSpan - 1))
    const lastColumn = Math.max(...cellPositions.map((position) => position.column + position.columnSpan - 1))
    for (let rowIndex = firstRow; rowIndex <= lastRow; rowIndex += 1) {
      for (let columnIndex = firstColumn; columnIndex <= lastColumn; columnIndex += 1) {
        if (!selected.has(grid[rowIndex]?.[columnIndex])) {
          return setTableMessage('Select a complete rectangular group of cells to merge.')
        }
      }
    }
    const orderedCells = [...cells].sort((left, right) => {
      const leftPosition = positions.get(left)!
      const rightPosition = positions.get(right)!
      return leftPosition.row - rightPosition.row || leftPosition.column - rightPosition.column
    })
    const first = orderedCells[0]
    const combinedContent = orderedCells
      .map((cell) => cell.components().models.map((child: any) => child.toHTML()).join(''))
      .filter(Boolean)
      .join('<br>')
    first.components(combinedContent)
    first.addAttributes({ rowspan: lastRow - firstRow + 1, colspan: lastColumn - firstColumn + 1 })
    orderedCells.slice(1).forEach((cell) => cell.remove())
    editor.select(first)
    setTableMessage(`Merged ${orderedCells.length} cells across ${lastRow - firstRow + 1} rows and ${lastColumn - firstColumn + 1} columns.`)
  }

  function resizeSelectedCells() {
    const editor = editorRef.current
    if (!editor) return
    const cells = editor.getSelectedAll()
      .map((component) => closestComponent(component, ['td', 'th']))
      .filter((component, index, all) => component && all.indexOf(component) === index)
    if (!cells.length) return setTableMessage('Select one or more cells to resize.')
    if (cellWidth < 20 || cellHeight < 20) return setTableMessage('Cell dimensions must be at least 20 pixels.')
    cells.forEach((cell) => cell.addStyle({ width: `${cellWidth}px`, 'min-width': `${cellWidth}px`, height: `${cellHeight}px`, 'min-height': `${cellHeight}px` }))
    setTableMessage(`Resized ${cells.length} selected cell${cells.length === 1 ? '' : 's'}.`)
  }

  function resizeSelectedColumn() {
    const context = selectedTableContext()
    if (!context) return setTableMessage('Select a cell inside a table first.')
    if (cellWidth < 20) return setTableMessage('Column width must be at least 20 pixels.')
    const section = closestComponent(context.cell, ['thead', 'tbody', 'tfoot']) || context.table
    const { grid, positions } = sectionGrid(context.table, section)
    const selectedPosition = positions.get(context.cell)
    if (!selectedPosition) return setTableMessage('Could not locate the selected column.')
    const updated = new Set<any>()
    const sections = context.table.find('thead, tbody, tfoot')
    ;(sections.length ? sections : [context.table]).forEach((tableSection: any) => {
      const sectionGridData = sectionGrid(context.table, tableSection)
      sectionGridData.grid.forEach((row) => {
        const cell = row[selectedPosition.column]
        if (cell && !updated.has(cell)) {
          updated.add(cell)
          cell.addStyle({ width: `${cellWidth}px`, 'min-width': `${cellWidth}px` })
        }
      })
    })
    setTableMessage(`Set column ${selectedPosition.column + 1} to ${cellWidth}px.`)
  }

  const buttonClass = 'rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Table tools</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{selectedCellCount ? `${selectedCellCount} cell${selectedCellCount === 1 ? '' : 's'} selected · double-click a cell to edit its text` : `${tableMessage} Double-click any cell to edit its text.`}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass} onClick={addTable}>Add table</button>
          <button type="button" className={buttonClass} disabled={!selectedCellCount} onClick={editSelectedCellText}>Edit cell text</button>
          <button type="button" className={buttonClass} disabled={!selectedCellCount} onClick={addRow}>Add row</button>
          <button type="button" className={buttonClass} disabled={!selectedCellCount} onClick={addColumn}>Add column</button>
          <button type="button" className={buttonClass} disabled={selectedCellCount < 2} onClick={mergeCells}>Merge cells</button>
        </div>
        <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
          <label className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
            Cell width (px)
            <input aria-label="Cell width in pixels" type="number" min={20} value={cellWidth} onChange={(event) => setCellWidth(Number(event.target.value))} className="mt-1 block w-24 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
          </label>
          <label className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
            Cell height (px)
            <input aria-label="Cell height in pixels" type="number" min={20} value={cellHeight} onChange={(event) => setCellHeight(Number(event.target.value))} className="mt-1 block w-24 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
          </label>
          <button type="button" className={buttonClass} disabled={!selectedCellCount} onClick={resizeSelectedCells}>Apply cell size</button>
          <button type="button" className={buttonClass} disabled={!selectedCellCount} onClick={resizeSelectedColumn}>Apply column width</button>
        </div>
      </div>
      <div ref={mount} className="min-h-[660px] overflow-hidden" />
    </div>
  )
}