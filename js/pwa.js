// Registro del service worker (modo sin internet) y aviso de "nueva versión".

import { APP_VERSION } from "./version.js";

export function setupPWA() {
  if (!("serviceWorker" in navigator)) return;
  // En la computadora de desarrollo no se usa (para ver los cambios al instante),
  // salvo que la dirección lleve ?sw=1 para probarlo.
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  if (local && !new URLSearchParams(location.search).has("sw")) return;

  navigator.serviceWorker
    .register(`sw.js?v=${APP_VERSION}`)
    .then((registration) => {
      // Ya había una versión nueva esperando.
      if (registration.waiting && navigator.serviceWorker.controller) showUpdate(registration.waiting);

      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdate(worker);
        });
      });

      // Al volver a abrir la app desde la pantalla de inicio, busca versiones nuevas.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") registration.update().catch(() => {});
      });
    })
    .catch((error) => {
      // Si el navegador no lo permite, la app funciona igual (solo que sin modo sin internet).
      console.warn("No offline mode:", error.message);
    });

  // Cuando la versión nueva toma el control, recarga para usarla.
  // En la primera visita no hay versión anterior: no hace falta recargar.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
}

function showUpdate(worker) {
  if (document.getElementById("update-bar")) return;
  const bar = document.createElement("div");
  bar.id = "update-bar";
  bar.className = "update-bar";
  bar.setAttribute("role", "status");
  bar.innerHTML = `
    <span>A new version of Pace is ready.</span>
    <button class="btn btn-primary" type="button">Update</button>`;
  bar.querySelector("button").addEventListener("click", () => worker.postMessage("skipWaiting"));
  document.body.append(bar);
}
