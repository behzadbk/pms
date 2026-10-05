import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initNativeShell } from './lib/native'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

void initNativeShell()

// PWA/گوشی: منوی زمینه‌ی مرورگر (نگه‌داشتن روی لینک/تصویر/متن) باز نشود؛ فقط در فیلدهای متنی بماند.
if (window.matchMedia('(hover: none) and (pointer: coarse), (display-mode: standalone)').matches) {
  document.addEventListener('contextmenu', (e) => {
    const t = e.target as HTMLElement | null
    if (t?.closest('input, textarea, [contenteditable="true"], [data-selectable]')) return
    e.preventDefault()
  })
}
