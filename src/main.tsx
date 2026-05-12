import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// ── PWA update handling (especially for iOS homescreen) ──

if ('serviceWorker' in navigator) {
  // When app comes back to foreground, check for SW updates
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) reg.update();
      });
    }
  });

  // Listen for a new SW waiting to activate → reload
  navigator.serviceWorker.getRegistration().then((reg) => {
    if (!reg) return;

    // If a new SW is already waiting (installed before page loaded)
    if (reg.waiting) {
      promptReload();
    }

    // Listen for new SW installing
    reg.addEventListener('updatefound', () => {
      const newSW = reg.installing;
      if (!newSW) return;

      newSW.addEventListener('statechange', () => {
        // New SW installed and waiting — prompt user
        if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
          promptReload();
        }
      });
    });
  });

  // When the new SW takes over, reload the page
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

function promptReload() {
  // Auto-reload on iOS standalone (homescreen) since there's no browser refresh
  const isStandalone =
    ('standalone' in navigator && (navigator as unknown as { standalone: boolean }).standalone) ||
    window.matchMedia('(display-mode: standalone)').matches;

  if (isStandalone) {
    // On homescreen PWA: show a brief toast then reload
    const toast = document.createElement('div');
    toast.textContent = 'Updating app...';
    toast.style.cssText =
      'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:#185FA5;color:#fff;' +
      'padding:8px 20px;border-radius:20px;font-size:13px;z-index:9999;font-family:system-ui;';
    document.body.appendChild(toast);
    setTimeout(() => window.location.reload(), 800);
  } else {
    // In browser: just reload silently (skipWaiting + clientsClaim handle it)
    window.location.reload();
  }
}
