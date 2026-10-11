// Punto de entrada: decide qué pantalla mostrar según la dirección (#/...).

import { renderToday } from "./screens/today.js";
import { renderTasks } from "./screens/tasks.js";
import { renderTaskEdit } from "./screens/task-edit.js";
import { renderHistory } from "./screens/history.js";
import { renderSettings } from "./screens/settings.js";
import { renderStyleguide } from "./screens/styleguide.js";
import { renderWeek } from "./screens/week.js";
import { icon } from "./ui.js";
import { init } from "./store.js";
import { setupPWA } from "./pwa.js";

const view = document.getElementById("view");

// [patrón, pantalla, pestaña activa]
const routes = [
  [/^today$/, renderToday, "today"],
  [/^week(?:\/(\d{4}-\d{2}-\d{2}))?$/, renderWeek, "today"],
  [/^tasks$/, renderTasks, "tasks"],
  [/^task\/(.+)$/, renderTaskEdit, "tasks"],
  [/^history$/, renderHistory, "history"],
  [/^settings(?:\/([a-z-]+))?$/, renderSettings, "settings"],
  [/^styleguide$/, renderStyleguide, "settings"],
];

// Íconos de la barra inferior.
document.querySelectorAll(".tab").forEach((tab) => {
  tab.innerHTML = icon(tab.dataset.icon);
});

async function route() {
  const path = location.hash.replace(/^#\/?/, "") || "today";
  let match;
  const found = routes.find(([pattern]) => (match = path.match(pattern))) || routes[0];
  const [, render, tab] = found;

  // Limpia lo que dejó la pantalla anterior.
  view.cleanup?.();
  view.cleanup = null;
  view.onclick = view.oninput = view.onchange = null;
  document.querySelectorAll(".sheet-backdrop").forEach((s) => s.remove());

  document.querySelectorAll(".tab").forEach((t) => {
    if (t.dataset.tab === tab) t.setAttribute("aria-current", "page");
    else t.removeAttribute("aria-current");
  });

  try {
    await render(view, ...(match ? match.slice(1) : []));
  } catch (error) {
    console.error(error);
    view.innerHTML = `<section class="card empty"><p>Something didn't load. Try reopening the app.</p></section>`;
  }
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", route);
setupPWA();
// La primera vez carga tu plantilla; después solo abre la app.
init().then(route, (error) => {
  console.error(error);
  view.innerHTML = `<section class="card empty"><p>Your data couldn't load. Try reopening the app.</p></section>`;
});
