import '@/styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

// The theme follows macOS. The class is set before the first paint and flipped when the system appearance changes.
const darkScheme = window.matchMedia('(prefers-color-scheme: dark)')
const applyScheme = () => document.documentElement.classList.toggle('dark', darkScheme.matches)
applyScheme()
darkScheme.addEventListener('change', applyScheme)

const root = document.getElementById('root')
if (!root) throw new Error('index.html has no #root')

createRoot(root).render(
  <StrictMode>
    <TooltipProvider>
      <App />
      {/* Without a next-themes provider the Toaster's theme falls back to "system". */}
      <Toaster position="bottom-left" />
    </TooltipProvider>
  </StrictMode>,
)
