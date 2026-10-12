// Service worker: guarda la app en el teléfono para que funcione sin internet.
//
// - VERSION la escribe dev/publicar.py con la de js/version.js. Así este archivo cambia en
//   cada versión: el iPhone solo busca actualizaciones cuando este archivo es distinto.
// - Si agregas un archivo nuevo a la app, súmalo a FILES
//   (python3 dev/revisar-sw.py avisa si falta alguno).

const VERSION = "1.0.7"; // la reemplaza dev/publicar.py
const CACHE = `pace-${VERSION}`;

const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "css/theme.css",
  "js/app.js",
  "js/backup.js",
  "js/db.js",
  "js/pwa.js",
  "js/store.js",
  "js/ui.js",
  "js/version.js",
  "js/logic/calendar.js",
  "js/logic/dates.js",
  "js/logic/describe.js",
  "js/logic/energy.js",
  "js/logic/events.js",
  "js/logic/limits.js",
  "js/logic/planner.js",
  "js/logic/recurrence.js",
  "js/logic/time-of-day.js",
  "js/screens/evening.js",
  "js/screens/history.js",
  "js/screens/move.js",
  "js/screens/settings.js",
  "js/screens/styleguide.js",
  "js/screens/task-edit.js",
  "js/screens/tasks.js",
  "js/screens/today.js",
  "js/screens/week.js",
  "js/data/seed.js",
  "fonts/figtree.woff2",
  "fonts/fraunces.woff2",
  "vendor/lucide.min.js",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon.svg",
];

// Instalar: descarga y guarda todos los archivos de esta versión.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES.map((file) => new Request(file, { cache: "reload" }))))
      // Si la app guardada en el teléfono no es Pace (por ejemplo, se subió otra app por error),
      // la versión nueva se instala sola, sin esperar a que toques "Update".
      .then(() => foreignEntries())
      .then((foreign) => foreign.length && self.skipWaiting()),
  );
});

// Archivos de esta dirección (/pace/) guardados por OTRA app del mismo dominio.
// Solo se miran las entradas de /pace/; lo de las otras apps no se toca.
async function foreignEntries() {
  const found = [];
  for (const key of await caches.keys()) {
    if (key.startsWith("pace-")) continue;
    const cache = await caches.open(key);
    for (const request of await cache.keys()) {
      if (request.url.startsWith(self.registration.scope)) found.push({ cache, request });
    }
  }
  return found;
}

// Activar: borra las versiones anteriores guardadas.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("pace-") && k !== CACHE).map((k) => caches.delete(k))))
      // Quita las copias de /pace/ que guardó otra app (sin tocar el resto de esa app).
      .then(() => foreignEntries())
      .then((foreign) => Promise.all(foreign.map(({ cache, request }) => cache.delete(request))))
      .then(() => self.clients.claim()),
  );
});

// La app pide activar la versión nueva cuando tocas "Update".
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Abrir la app: siempre la página guardada.
  if (request.mode === "navigate") {
    event.respondWith(caches.match("index.html", { cacheName: CACHE }).then((cached) => cached || fetch(request)));
    return;
  }

  // Resto de archivos: primero lo guardado; si no está, de internet (y se guarda).
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
          return response;
        }),
    ),
  );
});
