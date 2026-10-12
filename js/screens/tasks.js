// Pantalla Tasks: todas tus tareas por categoría, archivadas y orden.
// En "Reorder" se arrastran con el dedo desde la agarradera (⋮⋮).

import { esc, icon, toast } from "../ui.js";
import { describeFrequency } from "../logic/describe.js";
import { TIMES_OF_DAY } from "../logic/time-of-day.js";
import * as store from "../store.js";

const KIND_BADGE = {
  limit: `<span class="badge tint-butter">Limit</span>`,
  bonus: `<span class="badge tint-mint">Bonus</span>`,
};

let reordering = false;

function detailFor(task) {
  const time = TIMES_OF_DAY.find((t) => t.id === task.timeOfDay);
  return [describeFrequency(task), time && task.kind === "habit" ? time.label : ""].filter(Boolean).join(" · ");
}

function row(task, tint) {
  const body = `
    <span class="task-emoji tint-${tint}" aria-hidden="true">${task.emoji || "•"}</span>
    <span class="task-text">
      <span class="task-name" style="display: block">${esc(task.name)}${KIND_BADGE[task.kind] || ""}</span>
      <span class="task-detail" style="display: block">${esc(detailFor(task))}</span>
    </span>`;
  if (reordering) {
    return `
      <li class="task is-sortable" data-id="${task.id}">
        <span class="task-link">${body}</span>
        <button class="drag-handle" data-handle aria-label="Drag ${esc(task.name)} to reorder">${icon("grip-vertical")}</button>
      </li>`;
  }
  return `
    <li class="task" data-id="${task.id}">
      <a class="task-link" href="#/task/${encodeURIComponent(task.id)}">${body}</a>
      ${icon("chevron-right")}
    </li>`;
}

export async function renderTasks(view) {
  const [tasks, categories] = await Promise.all([store.getTasks(), store.getCategories()]);
  const tintOf = (task) => categories.find((c) => c.id === task.categoryId)?.tint || "lilac";
  const active = tasks.filter((t) => t.status === "active");
  const archived = tasks.filter((t) => t.status === "archived");

  let body;
  if (reordering) {
    // Modo ordenar: una sola lista, en el orden en que aparecen en Today.
    body = `
      <p class="small muted" style="margin: 0 0 12px">Hold ${icon("grip-vertical", "icon inline-icon")} and drag. This is the order they show up in Today.</p>
      <ul class="task-list" id="sortable">${active.map((t) => row(t, tintOf(t))).join("")}</ul>`;
  } else {
    const groups = categories
      .map((c) => ({ category: c, tasks: active.filter((t) => t.categoryId === c.id) }))
      .filter((g) => g.tasks.length);
    const orphans = active.filter((t) => !categories.some((c) => c.id === t.categoryId));
    if (orphans.length) groups.push({ category: { name: "Other", tint: "lilac" }, tasks: orphans });

    body =
      groups
        .map(
          (g) => `
        <h2 class="group-title"><span class="dot" style="background: var(--${g.category.tint}-ink-2)"></span>${esc(g.category.name)}</h2>
        <ul class="task-list">${g.tasks.map((t) => row(t, g.category.tint)).join("")}</ul>`,
        )
        .join("") +
      (archived.length
        ? `<details class="fold">
            <summary>${icon("archive")} Archived <span class="fold-count">${archived.length}</span></summary>
            <p class="small muted" style="margin: 0 0 12px">Their history is kept. Open one to restore it.</p>
            <ul class="task-list">${archived.map((t) => row(t, tintOf(t))).join("")}</ul>
          </details>`
        : "");
  }

  view.innerHTML = `
    <p class="eyebrow">Everything you track</p>
    <h1 class="display screen-title">Tasks</h1>
    <div class="fab-row">
      ${
        reordering
          ? `<button class="btn btn-secondary" data-action="sort-time">${icon("sun-moon")} Sort by time</button>`
          : `<a class="btn btn-primary" href="#/task/new">${icon("plus")} New task</a>`
      }
      <button class="btn ${reordering ? "btn-primary" : "btn-secondary"}" data-action="reorder">${reordering ? "Done" : `${icon("arrow-up-down")} Reorder`}</button>
    </div>
    ${body}
  `;

  view.onclick = async (event) => {
    if (event.target.closest("[data-action=reorder]")) {
      reordering = !reordering;
      return renderTasks(view);
    }
    if (event.target.closest("[data-action=sort-time]")) {
      await store.sortByTimeOfDay();
      toast("Sorted by time of day");
      return renderTasks(view);
    }
  };

  if (reordering) {
    enableDrag(view.querySelector("#sortable"), async (ids) => {
      // Las archivadas van al final para no mezclar órdenes.
      await store.saveOrder([...ids, ...archived.map((t) => t.id)]);
    });
  }
  view.cleanup = () => (reordering = false);
}

/**
 * Arrastrar y soltar con el dedo (o el mouse) desde la agarradera.
 * La fila sigue al dedo; las demás se apartan; al soltar se guarda el orden.
 * Cerca del borde de la pantalla, la página se desplaza sola.
 */
function enableDrag(list, onDrop) {
  let dragging = null;
  let pointerY = 0;
  let offset = 0; // distancia entre el dedo y el borde superior de la fila
  let shift = 0;
  let scrollTimer = null;

  const rows = () => [...list.children];

  function place() {
    if (!dragging) return;
    // La fila arrastrada se dibuja donde está el dedo (shift = cuánto se aparta de su lugar en la lista).
    const naturalTop = dragging.getBoundingClientRect().top - shift;
    shift = pointerY - offset - naturalTop;
    dragging.style.transform = `translateY(${shift}px)`;

    // Si su centro pasó el centro de la vecina, intercambian lugar en la lista.
    const center = pointerY - offset + dragging.offsetHeight / 2;
    const prev = dragging.previousElementSibling;
    const next = dragging.nextElementSibling;
    if (prev && center < prev.getBoundingClientRect().top + prev.offsetHeight / 2) {
      animateSwap(prev, () => list.insertBefore(dragging, prev));
      place();
    } else if (next && center > next.getBoundingClientRect().top + next.offsetHeight / 2) {
      animateSwap(next, () => list.insertBefore(next, dragging));
      place();
    }
  }

  // La vecina se desliza suave a su nuevo lugar (técnica FLIP).
  function animateSwap(neighbor, swap) {
    const before = neighbor.getBoundingClientRect().top;
    swap();
    const delta = before - neighbor.getBoundingClientRect().top;
    if (delta && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      neighbor.animate([{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }], { duration: 180, easing: "ease-out" });
    }
  }

  function autoScroll() {
    const edge = 90;
    const bottomEdge = window.innerHeight - 140; // deja libre la barra de pestañas
    let speed = 0;
    if (pointerY < edge) speed = -Math.ceil((edge - pointerY) / 8);
    else if (pointerY > bottomEdge) speed = Math.ceil((pointerY - bottomEdge) / 8);
    if (speed) {
      window.scrollBy(0, speed);
      place();
    }
    scrollTimer = requestAnimationFrame(autoScroll);
  }

  list.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest("[data-handle]");
    if (!handle) return;
    event.preventDefault();
    dragging = handle.closest("li");
    const rect = dragging.getBoundingClientRect();
    pointerY = event.clientY;
    offset = event.clientY - rect.top;
    shift = 0;
    dragging.classList.add("is-dragging");
    handle.setPointerCapture(event.pointerId);
    scrollTimer = requestAnimationFrame(autoScroll);
  });

  list.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    pointerY = event.clientY;
    place();
  });

  const finish = async () => {
    if (!dragging) return;
    cancelAnimationFrame(scrollTimer);
    const row = dragging;
    dragging = null;
    row.style.transform = "";
    shift = 0;
    row.classList.remove("is-dragging");
    await onDrop(rows().map((li) => li.dataset.id));
  };
  list.addEventListener("pointerup", finish);
  list.addEventListener("pointercancel", finish);
}
