// Pantalla Tasks: todas tus tareas por categoría, archivadas y orden.

import { esc, icon } from "../ui.js";
import { describeFrequency } from "../logic/describe.js";
import * as store from "../store.js";

const KIND_BADGE = {
  limit: `<span class="badge tint-butter">Limit</span>`,
  bonus: `<span class="badge tint-mint">Bonus</span>`,
};

let reordering = false;

function row(task, tint, { canMove = false, first = false, last = false } = {}) {
  const detail = describeFrequency(task);
  return `
    <li class="task" data-id="${task.id}">
      <a class="task-link" href="#/task/${encodeURIComponent(task.id)}">
        <span class="task-emoji tint-${tint}" aria-hidden="true">${task.emoji || "•"}</span>
        <span class="task-text">
          <span class="task-name" style="display: block">${esc(task.name)}${KIND_BADGE[task.kind] || ""}</span>
          <span class="task-detail" style="display: block">${esc(detail)}</span>
        </span>
      </a>
      ${
        canMove
          ? `<span class="reorder">
              <button data-move="up" data-task="${task.id}" aria-label="Move ${esc(task.name)} up" ${first ? "disabled style='opacity:.3'" : ""}>${icon("chevron-up")}</button>
              <button data-move="down" data-task="${task.id}" aria-label="Move ${esc(task.name)} down" ${last ? "disabled style='opacity:.3'" : ""}>${icon("chevron-down")}</button>
            </span>`
          : icon("chevron-right")
      }
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
      <p class="small muted" style="margin: 0 0 12px">This is the order they show up in Today.</p>
      <ul class="task-list">${active.map((t, i) => row(t, tintOf(t), { canMove: true, first: i === 0, last: i === active.length - 1 })).join("")}</ul>`;
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
      ${reordering ? "" : `<a class="btn btn-primary" href="#/task/new">${icon("plus")} New task</a>`}
      <button class="btn btn-secondary" data-action="reorder">${reordering ? "Done" : `${icon("arrow-up-down")} Reorder`}</button>
    </div>
    ${body}
  `;

  view.onclick = async (event) => {
    if (event.target.closest("[data-action=reorder]")) {
      reordering = !reordering;
      return renderTasks(view);
    }
    const move = event.target.closest("[data-move]");
    if (move) {
      const ids = active.map((t) => t.id);
      const i = ids.indexOf(move.dataset.task);
      const j = move.dataset.move === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      // Las archivadas van al final para no mezclar órdenes.
      await store.saveOrder([...ids, ...archived.map((t) => t.id)]);
      await renderTasks(view);
      view.querySelector(`[data-move="${move.dataset.move}"][data-task="${move.dataset.task}"]`)?.focus();
    }
  };
  view.cleanup = () => (reordering = false);
}
