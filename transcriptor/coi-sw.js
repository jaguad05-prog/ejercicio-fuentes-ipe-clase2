/* Activa el aislamiento entre orígenes (necesario para que Whisper use varios núcleos).
   Solo afecta a la carpeta /transcriptor/. */
if (typeof window === 'undefined') {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
  self.addEventListener('fetch', e => {
    const r = e.request;
    if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return;
    const req = r.mode === 'no-cors' ? new Request(r, { credentials: 'omit' }) : r;
    e.respondWith(fetch(req).then(res => {
      if (res.status === 0) return res;
      const h = new Headers(res.headers);
      h.set('Cross-Origin-Embedder-Policy', 'credentialless');
      h.set('Cross-Origin-Opener-Policy', 'same-origin');
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
    }));
  });
} else {
  (() => {
    if (window.crossOriginIsolated || !window.isSecureContext || !navigator.serviceWorker) return;
    if (sessionStorage.getItem('coiReload')) { sessionStorage.removeItem('coiReload'); return; }
    navigator.serviceWorker.register(document.currentScript.src).then(reg => {
      const go = () => { sessionStorage.setItem('coiReload', '1'); location.reload(); };
      if (reg.active && !navigator.serviceWorker.controller) go();
      else if (reg.installing) reg.installing.addEventListener('statechange', function () { if (this.state === 'activated') go(); });
    });
  })();
}
