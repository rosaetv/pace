// Mover una tarea a otro día a mano.
// Si el día rompe alguna regla de la tarea, se avisa con una línea suave, pero se puede igual.

import { esc, icon, openSheet } from "../ui.js";
import { addDays, weekStart, weekDates, diffDays, formatDate, todayISO } from "../logic/dates.js";
import { dayInfo } from "../logic/calendar.js";
import * as store from "../store.js";

function warningFor(task, date, ctx, otherDates) {
  const sameWeek = ctx.week && weekStart(date) === ctx.weekStart;
  const info = dayInfo(date, ctx.settings, sameWeek ? ctx.week : null, ctx.dayLogs?.[date]);
  const c = task.constraints || {};
  if (c.notTags?.includes("office") && info.office) return "Office day. It usually skips those.";
  if (c.forbiddenDays?.includes(info.weekday)) return "It usually skips this day.";
  const minRest = c.minRestDays || 0;
  if (minRest && otherDates.some((d) => d !== date && Math.abs(diffDays(d, date)) <= minRest)) {
    return `Less than ${minRest} rest days from another one.`;
  }
  if (info.office) return "Office day. Lighter days work better.";
  return "";
}

/**
 * days: fechas que se ofrecen (por defecto, los próximos 6 días).
 * fromDate: el día en que estaba (o desde el que seguía abierta).
 */
export function openMoveSheet(task, fromDate, ctx, onDone, { days } = {}) {
  const today = todayISO();
  const options = (days || Array.from({ length: 6 }, (_, i) => addDays(today, i + 1))).filter((d) => d !== fromDate && d >= today);
  const others = [
    ...(ctx.week?.assignments?.[task.id] || []),
    ...ctx.completions.filter((x) => x.taskId === task.id && x.date >= ctx.weekStart).map((x) => x.date),
  ].filter((d) => d !== fromDate);

  const { sheet, close } = openSheet(
    `
    <h2 class="display sheet-title">Move ${esc(task.name)}</h2>
    <p class="muted" style="margin: 4px 0 16px">From ${formatDate(fromDate, "day")}. It stays where you put it.</p>
    <ul class="task-list">
      ${options
        .map((d) => {
          const warning = warningFor(task, d, ctx, others);
          return `
          <li>
            <button class="move-option" data-to="${d}">
              <span class="task-text">
                <span class="task-name" style="display: block">${d === addDays(today, 1) ? "Tomorrow · " : ""}${formatDate(d, "day")}</span>
                ${warning ? `<span class="task-detail" style="display: block">${esc(warning)}</span>` : ""}
              </span>
              ${icon("chevron-right")}
            </button>
          </li>`;
        })
        .join("")}
    </ul>`,
    { label: `Move ${task.name}` },
  );
  sheet.addEventListener("click", async (event) => {
    const to = event.target.closest("[data-to]")?.dataset.to;
    if (!to) return;
    await store.moveTask(task, fromDate, to);
    close();
    onDone?.();
  });
}

// Días de una semana que todavía se pueden elegir.
export const remainingDays = (start) => weekDates(start).filter((d) => d >= todayISO());
