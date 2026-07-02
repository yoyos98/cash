/* ================================================================
   FINANCIAL TRACKER PRO – SERVICE WORKER
   Strategia: Cache First con Network Fallback
   Garantisce funzionamento offline su iOS (PWA standalone)
   ================================================================ */

'use strict';

/* ----------------------------------------------------------------
   1. CONFIGURAZIONE CACHE
---------------------------------------------------------------- */

/** Nome della cache corrente. Cambiare versione per invalidare la cache */
const CACHE_NAME = 'finance-app-v1';

/**
 * Lista dei file statici da pre-caricare in cache durante l'installazione.
 * Questi file vengono scaricati subito e garantiscono il funzionamento offline.
 */
const PRECACHE_URLS = [
  'index.html',
  'style.css',
  'script.js',
  'manifest.json'
];

/* ----------------------------------------------------------------
   2. EVENTO INSTALL
   Viene eseguito una sola volta quando il SW viene installato.
   Scarica e mette in cache tutti i file essenziali (precache).
---------------------------------------------------------------- */
self.addEventListener('install', event => {
  console.log('[SW] Installazione in corso...', CACHE_NAME);

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-caching delle risorse essenziali:', PRECACHE_URLS);
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log('[SW] Pre-cache completata.');
        // Forza l'attivazione immediata senza aspettare che le schede
        // esistenti vengano chiuse – fondamentale per iOS PWA
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('[SW] Errore durante il pre-cache:', err);
      })
  );
});

/* ----------------------------------------------------------------
   3. EVENTO ACTIVATE
   Viene eseguito quando il SW diventa il controller attivo.
   Rimuove le versioni obsolete della cache per liberare spazio.
---------------------------------------------------------------- */
self.addEventListener('activate', event => {
  console.log('[SW] Attivazione...', CACHE_NAME);

  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        // Crea un array di promesse per eliminare le cache vecchie
        const deletePromises = cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(oldName => {
            console.log('[SW] Eliminazione cache obsoleta:', oldName);
            return caches.delete(oldName);
          });

        return Promise.all(deletePromises);
      })
      .then(() => {
        console.log('[SW] Attivazione completata. Cache aggiornata.');
        // Prende il controllo di tutte le schede aperte immediatamente,
        // senza richiedere un ricaricamento della pagina
        return self.clients.claim();
      })
      .catch(err => {
        console.error('[SW] Errore durante l\'attivazione:', err);
      })
  );
});

/* ----------------------------------------------------------------
   4. EVENTO FETCH – Strategia "Cache First, Network Fallback"
   
   Flusso decisionale per ogni risorsa richiesta:
   
   1. Cerca la risorsa nella cache locale
   2. Se trovata → risponde subito dalla cache (velocità istantanea, offline)
   3. Se NON trovata → effettua la richiesta di rete
      a. Se la rete risponde → salva in cache per la prossima volta
      b. Se anche la rete fallisce → risponde con la pagina offline
   
   Nota: Le richieste a CDN esterni (es. Chart.js) vengono gestite
   con la stessa strategia: se non in cache vengono scaricate e messe
   in cache per l'uso offline successivo.
---------------------------------------------------------------- */
self.addEventListener('fetch', event => {
  // Ignora richieste non-GET (POST, PUT, DELETE, ecc.)
  // che non possono essere gestite dalla cache
  if (event.request.method !== 'GET') return;

  // Ignora richieste a origini diverse che potrebbero causare problemi CORS
  // (es. analytics, tracking) – ma gestiamo CDN come Chart.js
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isCDN = url.hostname.includes('cdn.jsdelivr.net') ||
                url.hostname.includes('cdnjs.cloudflare.com') ||
                url.hostname.includes('unpkg.com');

  // Gestisce solo richieste same-origin e CDN noti
  if (!isSameOrigin && !isCDN) return;

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // CACHE HIT: risposta trovata in cache
        if (cachedResponse) {
          console.log('[SW] Cache hit:', event.request.url);
          return cachedResponse;
        }

        // CACHE MISS: richiesta alla rete
        console.log('[SW] Cache miss, fetch dalla rete:', event.request.url);

        return fetch(event.request)
          .then(networkResponse => {
            // Verifica che la risposta sia valida prima di metterla in cache
            if (
              !networkResponse ||
              networkResponse.status !== 200 ||
              networkResponse.type === 'error'
            ) {
              return networkResponse;
            }

            // Clona la risposta: il body di Response è uno stream
            // e può essere consumato una sola volta.
            // Una copia va alla cache, l'altra al browser.
            const responseToCache = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
                console.log('[SW] Risposta messa in cache:', event.request.url);
              })
              .catch(err => {
                console.warn('[SW] Impossibile mettere in cache:', event.request.url, err);
              });

            return networkResponse;
          })
          .catch(err => {
            // NETWORK FAILURE: rete non disponibile
            console.warn('[SW] Rete non disponibile per:', event.request.url, err);

            // Fallback specifico per le navigazioni HTML:
            // se la pagina richiesta non è in cache, mostra index.html
            if (event.request.destination === 'document') {
              return caches.match('index.html')
                .then(fallback => {
                  if (fallback) {
                    console.log('[SW] Fallback su index.html per navigazione offline.');
                    return fallback;
                  }
                  // Risposta di emergenza se anche index.html non è in cache
                  return new Response(
                    `<!DOCTYPE html>
                    <html lang="it">
                    <head>
                      <meta charset="UTF-8">
                      <meta name="viewport" content="width=device-width, initial-scale=1.0">
                      <title>Offline – Financial Tracker</title>
                      <style>
                        body {
                          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                          background: #121214; color: #f1f1f3;
                          display: flex; align-items: center; justify-content: center;
                          min-height: 100vh; margin: 0; text-align: center; padding: 20px;
                        }
                        h1 { font-size: 1.5rem; margin-bottom: 8px; }
                        p  { color: #8e8ea0; font-size: 0.9rem; }
                      </style>
                    </head>
                    <body>
                      <div>
                        <h1>📱 Sei offline</h1>
                        <p>Connettiti a internet per caricare l'applicazione.</p>
                      </div>
                    </body>
                    </html>`,
                    {
                      status: 503,
                      headers: { 'Content-Type': 'text/html; charset=utf-8' }
                    }
                  );
                });
            }

            // Per le altre risorse (immagini, script), fallisce silenziosamente
            return new Response('', { status: 503, statusText: 'Service Unavailable' });
          });
      })
  );
});

/* ----------------------------------------------------------------
   5. MESSAGGIO DAL CLIENT
   Permette alla pagina di inviare comandi al SW.
   Utile per forzare un aggiornamento immediato della cache.
---------------------------------------------------------------- */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Ricevuto SKIP_WAITING – attivazione immediata.');
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME)
      .then(() => {
        console.log('[SW] Cache eliminata su richiesta del client.');
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ success: true });
        }
      });
  }
});
