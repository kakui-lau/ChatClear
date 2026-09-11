import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { createAcceptanceApi } from './acceptance-api'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles.css'

if (import.meta.env.DEV && !window.chatclear && window.location.search.includes('acceptance')) {
  window.chatclear = createAcceptanceApi()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
