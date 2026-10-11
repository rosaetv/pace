// Historial: calendario del mes con energía y cumplimiento, detalle de cada día
// y metas semanales contadas por semanas (nunca por días seguidos).

import { esc, icon, openSheet } from "../ui.js";
import { todayISO, weekStart, addDays, fromISO, toISO, formatDate, formatTime, WEEKDAYS } from "../logic/dates.js";
import { planDay } from "../logic/planner.js";
import * as store from "../store.js";
import { ENERGY } from "./today.js";

let monthOffset = 0; // 0 = este mes, -1 = el anterior…

const ENERGY_BY_ID = Object.fromEntries(ENERGY.map((e) => [e.id, e]));

function monthDays(offset) {
  const now = fromISO(todayISO());
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1, 12);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12);
  return { first: toISO(first), last: toISO(last), label: first.toLocaleDateString("en-US", { month: "long", year: "numeric" }) };
}

// Datos de cada semana que toca el mes (para calcular lo que tocaba cada día).
async function loadWeeks(first, last) {
  const weeks = {};
  for (let start = weekStart(first); start <= last; start = addDays(start, 7)) {
    weeks[start] = await store.loadContext(start);
  }
  return weeks;
}

// Resumen de un día: energía, hechas y cuántas tocaban.
function daySummary(date, weeks) {
  const ctx = weeks[weekStart(date)];
  const log = ctx.dayLogs[date] || {};
  const done = ctx.completions.filter((c) => c.date === date);
  const tasksById = Object.fromEntries(ctx.tasks.map((t) => [t.id, t]));
  const habitsDone = done.filter((c) => tasksById[c.taskId]?.kind === "habit");
  const plan = planDay(
    date,
    { energy: log.energy || "full", minutes: 0, showProtected: true },
    { ...ctx, assignments: ctx.week.assignments || {}, today: date },
  );
  const open = plan.items.filter((i) => i.status !== "done" && !i.task.suggested);
  const total = habitsDone.length + open.length;
  return { date, log, ctx, done, habitsDone, open, total, ratio: total ? habitsDone.length / total : 0, events: plan.events };
}

function cell(summary, { today, startedAt, inMonth }) {
  const { date, log, ratio, total } = summary;
  const future = date > today;
  const before = date < startedAt;
  const energy = ENERGY_BY_ID[log.energy];
  const classes = ["cal-day", future || before ? "is-quiet" : "", date === today ? "is-today" : "", inMonth ? "" : "is-outside"].join(" ");
  const ring = !future && !before && total && !log.restDay ? `--ratio: ${Math.round(ratio * 100)}` : "--ratio: 0";
  return `
    <button class="${classes}" data-day="${date}" ${future || before ? "disabled" : ""} aria-label="${formatDate(date, "long")}${energy ? `, energy ${energy.label}` : ""}${total ? `, ${summary.habitsDone.length} of ${total} done` : ""}">
      <span class="cal-ring" style="${ring}">
        <span class="cal-num ${energy ? `tint-${energy.tint}` : ""}">${Number(date.slice(8))}</span>
      </span>
      ${log.restDay ? `<span class="cal-mark">${icon("leaf")}</span>` : ""}
    </button>`;
}

// Metas semanales: semanas cumplidas (de las últimas 6), nunca rachas de días.
function weeklyGoals(ctxNow, completionsByWeek, startedAt) {
  const tasks = ctxNow.tasks.filter((t) => t.status === "active" && t.streak?.type === "weekly");
  if (!tasks.length) return "";
  const thisWeek = weekStart(todayISO());
  const starts = Array.from({ length: 6 }, (_, i) => addDays(thisWeek, -7 * (5 - i))).filter((s) => addDays(s, 6) >= startedAt);

  const rows = tasks.map((task) => {
    const target = task.streak.target || 1;
    const counts = starts.map((s) => (completionsByWeek[s] || []).filter((c) => c.taskId === task.id).length);
    const past = counts.slice(0, -1);
    const met = past.filter((n) => n >= target).length;
    const now = counts.at(-1);
    const dots = counts
      .map((n, i) => {
        const current = i === counts.length - 1;
        const state = n >= target ? "met" : current ? "current" : "open";
        return `<span class="goal-dot is-${state}" title="${formatDate(starts[i])}: ${n} of ${target}"></span>`;
      })
      .join("");
    const summary = past.length ? `${met} of the last ${past.length} ${past.length === 1 ? "week" : "weeks"}` : "Your first week";
    return `
      <li class="goal">
        <span class="task-emoji tint-mint" aria-hidden="true">${task.emoji}</span>
        <span class="task-text">
          <span class="task-name" style="display: block">${esc(task.name)}</span>
          <span class="task-detail" style="display: block">${now} of ${target} this week · ${summary}</span>
        </span>
        <span class="goal-dots" aria-hidden="true">${dots}</span>
      </li>`;
  });

  return `
    <h2 class="display section-title">Weekly goals</h2>
    <p class="small muted" style="margin: -4px 0 12px">Counted by weeks, so one off day never breaks anything.</p>
    <ul class="task-list">${rows.join("")}</ul>`;
}

function dayDetail(summary) {
  const { date, log, ctx, done, open, events } = summary;
  const tasksById = Object.fromEntries(ctx.tasks.map((t) => [t.id, t]));
  const energy = ENERGY_BY_ID[log.energy];
  const limits = ctx.limitEntries.filter((e) => e.date === date);
  const skipped = ctx.skips.filter((s) => s.date === date);

  const list = (title, rows) => (rows.length ? `<p class="small muted" style="margin: 16px 0 6px">${title}</p><ul class="plain-list">${rows.join("")}</ul>` : "");

  openSheet(
    `
    <h2 class="display sheet-title">${formatDate(date, "long")}</h2>
    <div class="chips" style="margin: 8px 0 4px">
      ${energy ? `<span class="pill tint-${energy.tint}">${icon(energy.icon)} ${energy.label}</span>` : `<span class="pill tint-lilac">No check-in</span>`}
      ${log.restDay ? `<span class="pill tint-mint">${icon("leaf")} Rest day</span>` : ""}
      ${log.kind === "off" ? `<span class="pill tint-lilac">Day off</span>` : ""}
    </div>
    ${list(
      "Done",
      done.map((c) => {
        const t = tasksById[c.taskId];
        return `<li><span>${t?.emoji || "•"} ${esc(c.versionLabel || t?.name || "")}</span><span>${t?.kind === "bonus" ? "Bonus win" : ""}</span></li>`;
      }),
    )}
    ${list(
      "Logged",
      limits.map((e) => {
        const t = tasksById[e.taskId];
        const value = t?.limit?.perOccasionUnit === "hours" ? `${e.hours} h` : `${e.amount} ${t?.limit?.unit || ""}`;
        return `<li><span>${esc(t?.name || "")}</span><span>${esc(value)}</span></li>`;
      }),
    )}
    ${list("Appointments", events.map((e) => `<li><span>${esc(e.title)}</span><span>${formatTime(e.start)}</span></li>`))}
    ${list(
      "Let go or not today",
      skipped.map((s) => `<li><span>${esc(tasksById[s.taskId]?.name || "")}</span><span>${s.kind === "dismiss" ? "Let go" : "Not today"}</span></li>`),
    )}
    ${
      !log.restDay && open.length && date < todayISO()
        ? list("Not this time", open.map((i) => `<li><span>${i.task.emoji} ${esc(i.version?.label || i.task.name)}</span><span></span></li>`))
        : ""
    }
    ${!done.length && !limits.length && !events.length ? `<p class="muted" style="margin-top: 16px">Nothing logged. That's fine too.</p>` : ""}
  `,
    { label: formatDate(date, "long") },
  );
}

export async function renderHistory(view) {
  const today = todayISO();
  const settings = await store.getSettings();
  const startedAt = settings.startedAt || today;
  const { first, last, label } = monthDays(monthOffset);

  // Cuadrícula de lunes a domingo, con los días de los meses vecinos para completar las semanas.
  const gridStart = weekStart(first);
  const gridEnd = addDays(weekStart(last), 6);
  const weeks = await loadWeeks(gridStart, gridEnd);
  const summaries = {};
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) summaries[d] = daySummary(d, weeks);

  // Para las metas semanales: hechas por semana (últimas 6).
  const thisWeek = weekStart(today);
  const completionsByWeek = {};
  for (let i = 0; i < 6; i++) {
    const s = addDays(thisWeek, -7 * i);
    const ctx = weeks[s] || (await store.loadContext(s));
    completionsByWeek[s] = ctx.completions.filter((c) => c.date >= s && c.date <= addDays(s, 6));
  }
  const ctxNow = weeks[thisWeek] || (await store.loadContext(thisWeek));

  const canGoBack = first > startedAt;
  view.innerHTML = `
    <p class="eyebrow">How your days went</p>
    <h1 class="display screen-title">History</h1>

    <section class="card">
      <div class="cal-head">
        <button class="icon-btn" data-month="-1" aria-label="Previous month" ${canGoBack ? "" : "disabled style='opacity:.3'"}>${icon("chevron-left")}</button>
        <h2 class="display cal-title">${label}</h2>
        <button class="icon-btn" data-month="1" aria-label="Next month" ${monthOffset >= 0 ? "disabled style='opacity:.3'" : ""}>${icon("chevron-right")}</button>
      </div>
      <div class="cal-grid">
        ${WEEKDAYS.map((d) => `<span class="cal-weekday">${d.slice(0, 2)}</span>`).join("")}
        ${Object.values(summaries)
          .map((s) => cell(s, { today, startedAt, inMonth: s.date >= first && s.date <= last }))
          .join("")}
      </div>
      <div class="cal-legend">
        ${ENERGY.map((e) => `<span><span class="dot tint-${e.tint}"></span>${e.label}</span>`).join("")}
        <span><span class="legend-ring"></span>Done</span>
      </div>
    </section>

    ${weeklyGoals(ctxNow, completionsByWeek, startedAt)}
  `;

  view.onclick = async (event) => {
    const month = event.target.closest("[data-month]");
    if (month && !month.disabled) {
      monthOffset += Number(month.dataset.month);
      return renderHistory(view);
    }
    const day = event.target.closest("[data-day]");
    if (day && !day.disabled) dayDetail(summaries[day.dataset.day]);
  };
  view.cleanup = () => (monthOffset = 0);
}
