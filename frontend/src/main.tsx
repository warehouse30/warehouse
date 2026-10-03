import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { WarehouseProvider } from './warehouseContext'
import { I18nProvider } from './i18n'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <I18nProvider>
        <WarehouseProvider>
          <App />
        </WarehouseProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
)
