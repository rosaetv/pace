// Pantalla Today: el check-in de la mañana y la lista del día.

import { esc, icon, openSheet, askSheet } from "../ui.js";
import { todayISO, nowMinutes, formatDate, formatTime, toMinutes, weekday, addDays } from "../logic/dates.js";
import { planDay } from "../logic/planner.js";
import { suggestedEnergy, versionFor, shouldProposeLighten } from "../logic/energy.js";
import { limitStatus } from "../logic/limits.js";
import * as store from "../store.js";
import { openEveningCheckIn, openLimitSheet, openLimitsSheet, todayLimits, eveningDismissed, limitIcon, LIMIT_TINT } from "./evening.js";
import { openMoveSheet } from "./move.js";

export const ENERGY = [
  { id: "full", label: "100%", hint: "Full tank", icon: "battery-full", tint: "mint" },
  { id: "high", label: "80%", hint: "Pretty good", icon: "battery-medium", tint: "sky" },
  { id: "half", label: "50%", hint: "Half day", icon: "battery-low", tint: "peach" },
  { id: "min", label: "Minimum", hint: "Just the basics", icon: "battery", tint: "rose" },
];

const DAY_KINDS = [
  { id: "usual", label: "Home day" },
  { id: "office", label: "Office day" },
  { id: "off", label: "Day off" },
  { id: "rest", label: "Rest day" },
];


// Estado de la pantalla mientras está abierta.
let state = null;

// "Show anyway" se recuerda solo durante ese bloque protegido de ese día.
const revealKey = (date, block) => `pace-reveal-${date}-${block?.from}`;
function isRevealed(date, block) {
  try {
    return block && sessionStorage.getItem(revealKey(date, block)) === "1";
  } catch {
    return false;
  }
}
function setRevealed(date, block, value) {
  try {
    if (value) sessionStorage.setItem(revealKey(date, block), "1");
    else sessionStorage.removeItem(revealKey(date, block));
  } catch {}
}

async function load() {
  const date = todayISO();
  const ctx = await store.loadContext(date);
  const dayLog = ctx.dayLogs[date] || { date };
  const energy = dayLog.energy || suggestedEnergy(ctx.week) || "full";
  const assignments = await store.ensureAssignments(date, energy, ctx);
  const minutes = nowMinutes();
  const options = { energy, minutes };
  let plan = planDay(date, options, { ...ctx, assignments });
  const showProtected = isRevealed(date, plan.protectedBlock);
  if (showProtected) plan = planDay(date, { ...options, showProtected }, { ...ctx, assignments });
  const nextWeek = await store.getWeek(addDays(ctx.weekStart, 7));
  return { date, ctx, dayLog, energy, assignments, plan, showProtected, minutes, nextWeek };
}

// ---------- Textos de cada tarea ----------

function durationText(min) {
  if (!min) return "";
  return min >= 60 ? `${+(min / 60).toFixed(1)} h` : `${min} min`;
}

function detailText(item) {
  const parts = [];
  const v = item.version || {};
  if (item.status === "carried") parts.push(`Still open from ${formatDate(item.from, "day")}`);
  if (item.dueOn) parts.push(`Planned for ${formatDate(item.dueOn, "day")}`);
  if (v.note) parts.push(v.note);
  if (item.task.id === "meal-prep" || item.task.constraints?.showsMealsOut) {
    const out = state.ctx.plans.filter((p) => p.kind === "lunch-out" || p.kind === "dinner-out").length;
    if (out) parts.push(`${out} ${out === 1 ? "meal" : "meals"} out this week`);
  }
  if (v.durationMin) parts.push(durationText(v.durationMin));
  if (item.progress && item.status !== "done") parts.push(`${item.progress.done} of ${item.progress.target} this week`);
  if (item.task.suggested && item.status !== "done") parts.push("Suggested");
  return parts.join(" · ");
}

function categoryTint(task) {
  return state.ctx.categoriesById?.[task.categoryId]?.tint || "lilac";
}

function taskRow(item) {
  const done = item.status === "done";
  const label = item.version?.label || item.task.name;
  const detail = done ? "" : detailText(item);
  return `
    <li class="task ${done ? "is-done" : ""}" data-id="${item.task.id}">
      <button class="task-body" data-open="${item.task.id}" aria-label="Details: ${esc(label)}">
        <span class="task-emoji tint-${categoryTint(item.task)}" aria-hidden="true">${item.task.emoji || "•"}</span>
        <span class="task-text">
          <span class="task-name">${esc(label)}</span>
          ${detail ? `<span class="task-detail">${esc(detail)}</span>` : ""}
        </span>
      </button>
      <button class="check" data-check="${item.task.id}" aria-pressed="${done}" aria-label="${done ? "Mark as not done" : "Mark as done"}: ${esc(label)}">
        ${icon("check")}
      </button>
    </li>`;
}

// ---------- Bloques de la pantalla ----------

function statsSection() {
  const energy = ENERGY.find((e) => e.id === state.energy);
  const checkedIn = Boolean(state.dayLog.energy);
  const { shown: limits, rest } = todayLimits(state.ctx.tasks);
  const cards = limits.map((task) => {
    const s = limitStatus(task, state.ctx.limitEntries, state.date);
    return `
      <button class="stat tint-${LIMIT_TINT[s.state]}" data-limit="${task.id}" aria-label="${esc(task.name)}: ${s.used} of ${s.max} this week">
        <span class="stat-label">${icon(limitIcon(task))} ${esc(shortLimitName(task))}</span>
        <span class="stat-value">${s.used} of ${s.max}</span>
      </button>`;
  });
  return `
    <section class="stats" style="grid-template-columns: repeat(${limits.length + 1}, minmax(0, 1fr))${rest.length ? " auto" : ""}" aria-label="Today at a glance">
      <button class="stat tint-${checkedIn ? energy.tint : "lilac"}" data-action="checkin">
        <span class="stat-label">${icon("zap")} Energy</span>
        <span class="stat-value ${checkedIn ? "" : "is-cta"}">${checkedIn ? energy.label : "Check in"}</span>
      </button>
      ${cards.join("")}
      ${
        rest.length
          ? `<button class="stat stat-more tint-lilac" data-action="more-limits" aria-label="${rest.length} more ${rest.length === 1 ? "limit" : "limits"}">
              <span class="stat-label">${icon("ellipsis")}</span>
              <span class="stat-value">+${rest.length}</span>
            </button>`
          : ""
      }
    </section>`;
}

// Nombre corto para la tarjeta: "Late night snacks" → "Snacks".
const shortLimitName = (task) => (task.name.length > 10 ? task.name.split(" ").at(-1).replace(/^./, (c) => c.toUpperCase()) : task.name);

function eventsSection() {
  return state.plan.events
    .map(
      (e) => `
      <div class="event tint-lilac">
        <span aria-hidden="true">${e.emoji || "📅"}</span>
        <span><strong>${esc(e.title)}</strong> · ${formatTime(e.start)}</span>
      </div>`,
    )
    .join("");
}

function freeTimeNow() {
  const block = state.plan.protectedBlock;
  if (!block) return "";
  const resting = state.plan.resting.length;
  const until = block.to >= 24 * 60 ? "for the rest of the day" : `until ${formatTime(block.to)}`;
  const action = state.showProtected
    ? `<button class="link-btn" data-action="hide-protected">Hide them again</button>`
    : resting
      ? `${resting} ${resting === 1 ? "task" : "tasks"} resting · <button class="link-btn" data-action="show-protected">Show anyway</button>`
      : "Nothing waiting for you";
  return `
    <section class="free-time tint-lilac">
      ${icon("sofa")}
      <div>
        <p class="display free-time-title">Free time ${until}</p>
        <p class="small" style="color: var(--ink-2)">${action}</p>
      </div>
    </section>`;
}

// Domingo desde las 18:00: planear la siguiente. Lunes: planear esta si no se hizo.
function planCard() {
  const rule = state.ctx.settings.weeklyPlan;
  const wd = weekday(state.date);
  let target = null;
  if (wd === rule.weekday && state.minutes >= toMinutes(rule.from) && !state.nextWeek.plannedAt) {
    target = { start: addDays(state.ctx.weekStart, 7), title: "Plan next week", text: "Office, gym, and any plans. About a minute." };
  } else if (wd === 1 && !state.ctx.week.plannedAt) {
    target = { start: state.ctx.weekStart, title: "Plan this week", text: "Confirm office and gym days." };
  }
  if (!target) return "";
  return `
    <a class="plan-card tint-peach" href="#/week/${target.start}">
      ${icon("calendar-range")}
      <span class="task-text">
        <span class="display free-time-title" style="display: block">${target.title}</span>
        <span class="small" style="display: block; color: var(--ink-2)">${target.text}</span>
      </span>
      ${icon("chevron-right")}
    </a>`;
}

const isEvening = () => state.minutes >= toMinutes(state.ctx.settings.eveningCheckIn);

function eveningCard() {
  if (!isEvening()) return "";
  const done = Boolean(state.dayLog.eveningAt);
  return `
    <button class="evening-card tint-sky" data-action="evening">
      ${icon(done ? "moon-star" : "moon")}
      <span class="task-text">
        <span class="display free-time-title" style="display: block">${done ? "Evening check-in done" : "Evening check-in"}</span>
        <span class="small" style="display: block; color: var(--ink-2)">${done ? "Tap to change anything" : "Outings, drinks, and bonus wins"}</span>
      </span>
      ${icon("chevron-right")}
    </button>`;
}

function freeTimeLater() {
  const later = state.plan.info.protectedBlocks.find((b) => b.from > state.minutes);
  if (!later || state.plan.protectedBlock) return "";
  return `
    <section class="free-time tint-lilac" style="margin-top: var(--space-6)">
      ${icon("sofa")}
      <div>
        <p class="display free-time-title">Free time from ${formatTime(later.from)}</p>
        <p class="small" style="color: var(--ink-2)">No tasks then. Enjoy it.</p>
      </div>
    </section>`;
}

// Bonus del día: aparecen al final del día (desde la hora del check-in de noche).
// Bonus de la semana: solo el domingo, para cerrar la semana.
function bonusSection() {
  const evening = isEvening();
  const sunday = weekday(state.date) === 7;
  const bonus = state.ctx.tasks.filter((t) => {
    if (t.kind !== "bonus" || t.status !== "active") return false;
    return (t.bonus?.scope || "day") === "week" ? sunday : evening;
  });
  if (!bonus.length) return "";
  const rows = bonus.map((task) => {
    const scope = task.bonus?.scope || "day";
    const done = state.ctx.completions.some(
      (c) => c.taskId === task.id && (scope === "day" ? c.date === state.date : c.date >= state.ctx.weekStart),
    );
    return taskRow({ task, version: { label: task.name }, status: done ? "done" : "bonus" });
  });
  return `
    <h2 class="display section-title">Bonus</h2>
    <p class="small muted" style="margin: -4px 0 12px">Did you make it? Extra wins never count against you.</p>
    <ul class="task-list">${rows.join("")}</ul>`;
}

function couldDoSection() {
  const list = state.plan.couldDo;
  if (!list.length || state.dayLog.restDay) return "";
  return `
    <details class="fold">
      <summary>${icon("battery-charging")} Could do today <span class="fold-count">${list.length}</span></summary>
      <p class="small muted" style="margin: 0 0 12px">Only if you have energy to spare.</p>
      <ul class="task-list">${list.map(taskRow).join("")}</ul>
    </details>`;
}

function skippedSection() {
  const list = state.plan.skipped;
  if (!list.length) return "";
  return `
    <details class="fold">
      <summary>${icon("moon")} Not today <span class="fold-count">${list.length}</span></summary>
      <ul class="task-list">
        ${list
          .map(
            (item) => `
          <li class="task">
            <span class="task-emoji tint-${categoryTint(item.task)}" aria-hidden="true">${item.task.emoji}</span>
            <span class="task-text"><span class="task-name">${esc(item.version.label)}</span></span>
            <button class="btn btn-ghost" data-unskip="${item.task.id}">Bring back</button>
          </li>`,
          )
          .join("")}
      </ul>
    </details>`;
}

function mainList() {
  let items = state.plan.items;
  if (state.dayLog.restDay) {
    // Rest day: solo medicamentos y lo que ya marcaste.
    items = items.filter((i) => i.status === "done" || i.task.categoryId === "health");
  }
  const pending = items.filter((i) => i.status !== "done").length;
  const doneCount = items.length - pending;

  const restCard = state.dayLog.restDay
    ? `
      <section class="free-time tint-mint">
        ${icon("leaf")}
        <div>
          <p class="display free-time-title">Rest day</p>
          <p class="small" style="color: var(--ink-2)">Off the record. Only your meds are here. · <button class="link-btn" data-action="undo-rest">Undo</button></p>
        </div>
      </section>`
    : "";

  const empty =
    !items.length && !state.dayLog.restDay && !state.plan.protectedBlock
      ? `<p class="muted">Nothing on your list. That's allowed.</p>`
      : "";

  return `
    ${restCard}
    <div class="list-head">
      <h2 class="display section-title">Your day</h2>
      ${items.length ? `<span class="small muted">${doneCount} of ${items.length} done</span>` : ""}
    </div>
    ${eventsSection()}
    ${freeTimeNow()}
    ${empty}
    <ul class="task-list" id="task-list">${items.map(taskRow).join("")}</ul>
    ${couldDoSection()}
    ${skippedSection()}
    ${state.dayLog.restDay ? "" : bonusSection()}
    ${freeTimeLater()}`;
}

// Aviso suave si hace tiempo que no guardas un respaldo.
function backupCard() {
  const s = state.ctx.settings;
  const since = (s.lastBackupAt || "").slice(0, 10) || s.startedAt || state.date;
  const days = Math.round((new Date(state.date) - new Date(since)) / 86400000);
  if (days < s.backupReminderDays) return "";
  return `
    <a class="plan-card tint-butter" href="#/settings/backup">
      ${icon("hard-drive-download")}
      <span class="task-text">
        <span class="display free-time-title" style="display: block">Time for a backup</span>
        <span class="small" style="display: block; color: var(--ink-2)">${s.lastBackupAt ? `Last one was ${days} days ago.` : "Your data only lives on this phone."} It takes a few seconds.</span>
      </span>
      ${icon("chevron-right")}
    </a>`;
}

const isBirthday = () => state.ctx.settings.profile.birthDate?.slice(5) === state.date.slice(5);

function draw(view) {
  const profile = state.ctx.settings.profile;
  view.innerHTML = `
    <header class="today-head">
      <div>
        <p class="eyebrow">${formatDate(state.date, "long")}</p>
        <h1 class="display screen-title">${isBirthday() ? `Happy birthday${profile.name ? `, ${esc(profile.name)}` : ""} 🎂` : `Hi ${esc(profile.name || "there")}`}</h1>
      </div>
      <span class="today-actions">
        <a class="avatar" href="#/week" aria-label="Your week">${icon("calendar-range")}</a>
        <a class="avatar" href="#/settings" aria-label="Profile">${profile.avatar || "🙂"}</a>
      </span>
    </header>
    ${statsSection()}
    ${planCard()}
    ${backupCard()}
    ${eveningCard()}
    ${mainList()}
  `;
}

// Vuelve a dibujar y anima las tareas que cambiaron de lugar (técnica FLIP).
async function refresh(view) {
  const before = new Map([...view.querySelectorAll("[data-id]")].map((el) => [el.dataset.id, el.getBoundingClientRect().top]));
  const openFolds = [...view.querySelectorAll("details[open] summary")].map((s) => s.textContent.trim().split(" ")[0]);
  const categoriesById = state.ctx.categoriesById;
  state = await load();
  state.ctx.categoriesById = categoriesById;
  draw(view);
  view.querySelectorAll("details summary").forEach((s) => {
    if (openFolds.includes(s.textContent.trim().split(" ")[0])) s.parentElement.open = true;
  });

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const el of view.querySelectorAll("[data-id]")) {
    const old = before.get(el.dataset.id);
    if (old === undefined) continue;
    const delta = old - el.getBoundingClientRect().top;
    if (!delta) continue;
    el.animate([{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }], {
      duration: 420,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    });
  }
}

// ---------- Acciones ----------

function findItem(id) {
  const p = state.plan;
  const item = [...p.items, ...p.couldDo, ...p.resting, ...p.skipped].find((i) => i.task.id === id);
  if (item) return item;
  const task = state.ctx.tasks.find((t) => t.id === id);
  return task ? { task, version: versionFor(task, state.energy) || { label: task.name }, status: "bonus" } : null;
}

async function toggle(view, id) {
  const item = findItem(id);
  if (!item) return;
  if (item.task.kind === "bonus" && item.task.bonus?.scope === "week") {
    // Bonus semanal: se marca una vez en la semana; desmarcar borra esa marca.
    const existing = state.ctx.completions.find((c) => c.taskId === id && c.date >= state.ctx.weekStart);
    await store.toggleCompletion(item.task, existing?.date || state.date, item.version, state.energy);
  } else {
    await store.toggleCompletion(item.task, state.date, item.version, state.energy);
  }
  await refresh(view);
}

function openTaskSheet(view, id) {
  const item = findItem(id);
  if (!item) return;
  const done = item.status === "done";
  const detail = detailText(item);
  const label = item.version?.label || item.task.name;
  const { sheet, close } = openSheet(
    `
    <div class="row" style="gap: 12px; margin-bottom: 8px">
      <span class="task-emoji tint-${categoryTint(item.task)}" aria-hidden="true">${item.task.emoji}</span>
      <h2 class="display sheet-title">${esc(label)}</h2>
    </div>
    ${label !== item.task.name ? `<p class="small muted" style="margin: 0">${esc(item.task.name)}</p>` : ""}
    ${detail ? `<p class="muted" style="margin: 8px 0 0">${esc(detail)}</p>` : ""}
    ${item.task.description ? `<p class="task-description">${esc(item.task.description)}</p>` : ""}
    <div class="stack" style="margin-top: 24px">
      <button class="btn btn-primary btn-block" data-sheet="toggle">${done ? "Mark as not done" : "Mark as done"}</button>
      ${!done && item.task.kind === "habit" ? `<button class="btn btn-secondary btn-block" data-sheet="skip">Not today</button>` : ""}
      ${!done && item.task.kind === "habit" && item.task.frequency.type !== "daily" ? `<button class="btn btn-secondary btn-block" data-sheet="move">${icon("calendar-arrow-up")} Move to another day</button>` : ""}
      ${item.status === "carried" ? `<button class="btn btn-ghost btn-block" data-sheet="dismiss">Let it go</button>` : ""}
      <a class="btn btn-ghost btn-block" href="#/task/${encodeURIComponent(item.task.id)}">${icon("pencil")} Edit task</a>
    </div>`,
    { label },
  );
  sheet.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-sheet]")?.dataset.sheet;
    if (!action) return;
    close();
    if (action === "toggle") await toggle(view, id);
    if (action === "skip") {
      await store.skipToday(id, state.date);
      await refresh(view);
    }
    if (action === "move") openMoveSheet(item.task, item.from || state.date, state.ctx, () => refresh(view));
    if (action === "dismiss") {
      await store.dismissTask(id, state.date, item.from);
      await refresh(view);
    }
  });
}

export function openCheckIn(view) {
  const suggested = suggestedEnergy(state.ctx.week);
  let selected = state.dayLog.energy || suggested || null;
  const officeToday = store.weekDays(state.ctx).officeDays.includes(state.date);
  let kind = state.dayLog.restDay ? "rest" : state.dayLog.kind === "off" ? "off" : officeToday ? "office" : "usual";
  const markDismissed = () => {
    try {
      sessionStorage.setItem(`pace-checkin-${state.date}`, "1");
    } catch {}
  };

  const { sheet, close } = openSheet(
    `
    <h2 class="display sheet-title">${state.dayLog.energy ? "How are you now?" : "Good morning"}</h2>
    <p class="muted" style="margin: 4px 0 0">How much do you have today?</p>
    ${suggested ? `<p class="small" style="margin: 8px 0 0; color: var(--color-primary-deep)">Your week is set to 50%. Pick more if you feel it.</p>` : ""}
    <div class="energy-grid">
      ${ENERGY.map(
        (e) => `
        <button class="energy-option tint-${e.tint}" data-energy="${e.id}" aria-pressed="${e.id === selected}">
          ${icon(e.icon)}
          <strong>${e.label}</strong>
          <span>${e.hint}</span>
        </button>`,
      ).join("")}
    </div>
    <div class="row" style="gap: 4px; margin: 0 0 8px">
      <span class="small muted">Today is</span>
      <button type="button" class="info-btn" data-action="kinds-info" aria-expanded="false" aria-label="What do these mean?">${icon("info")}</button>
    </div>
    <dl class="kinds-info" hidden>
      <dt>Home day</dt><dd>You work from home, or just a regular day. Your usual list.</dd>
      <dt>Office day</dt><dd>You go to the office. Heavier tasks move to lighter days, with your OK.</dd>
      <dt>Day off</dt><dd>No work today, like a holiday. More room for tasks if you want them.</dd>
      <dt>Rest day</dt><dd>Off the record. Only your meds show, and it doesn't count in your history or goals.</dd>
    </dl>
    <div class="chips">
      ${DAY_KINDS.filter((k) => k.id !== "office" || weekday(state.date) <= 5).map((k) => `<button class="chip" data-kind="${k.id}" aria-pressed="${k.id === kind}">${k.label}</button>`).join("")}
    </div>
    <p class="small error" id="checkin-error" hidden>Pick how much energy you have.</p>
    <button class="btn btn-primary btn-block" data-action="save" style="margin-top: 24px">Show my day</button>
  `,
    { label: "Morning check-in", onClose: markDismissed },
  );

  sheet.addEventListener("click", async (event) => {
    const option = event.target.closest("[data-energy]");
    if (option) {
      selected = option.dataset.energy;
      sheet.querySelectorAll("[data-energy]").forEach((b) => b.setAttribute("aria-pressed", b === option));
      sheet.querySelector("#checkin-error").hidden = true;
    }
    const info = event.target.closest("[data-action=kinds-info]");
    if (info) {
      const list = sheet.querySelector(".kinds-info");
      list.hidden = !list.hidden;
      info.setAttribute("aria-expanded", String(!list.hidden));
      return;
    }
    const chip = event.target.closest("[data-kind]");
    if (chip) {
      kind = chip.dataset.kind;
      sheet.querySelectorAll("[data-kind]").forEach((b) => b.setAttribute("aria-pressed", b === chip));
    }
    if (event.target.closest("[data-action=save]")) {
      if (!selected) {
        sheet.querySelector("#checkin-error").hidden = false;
        return;
      }
      await store.saveDay({
        ...state.dayLog,
        energy: selected,
        kind: kind === "off" ? "off" : "usual",
        restDay: kind === "rest",
        checkedInAt: state.dayLog.checkedInAt || new Date().toISOString(),
      });
      markDismissed();
      close();
      await afterCheckIn(view, { officeNow: kind === "office", officeBefore: officeToday, dayOffChanged: (kind === "off") !== (state.dayLog.kind === "off") });
    }
  });
}

// Después del check-in: si cambió la oficina, reacomoda la semana (con tu luz verde);
// si van 3 días bajos, propone bajar el resto de la semana al 50%.
async function afterCheckIn(view, { officeNow, officeBefore, dayOffChanged }) {
  await refresh(view);

  if (officeNow !== officeBefore || dayOffChanged) {
    const days = store.weekDays(state.ctx);
    days.officeDays = officeNow ? [...new Set([...days.officeDays, state.date])].sort() : days.officeDays.filter((d) => d !== state.date);
    const { week, changes } = store.proposeWeek(state.ctx, state.date, days, state.energy);
    if (changes.length) {
      const answer = await askSheet({
        title: "Your week, rearranged",
        text: officeNow ? "Office today, so a few things move to lighter days." : "Things can shift around today.",
        body: `<ul class="plain-list" style="margin-top: 16px">${changes
          .map((c) => `<li><span>${esc(state.ctx.tasks.find((t) => t.id === c.taskId)?.name || c.taskId)}</span><span>${esc(c.text)}</span></li>`)
          .join("")}</ul>`,
        actions: [
          { id: "yes", label: "Sounds good", style: "primary" },
          { id: "no", label: "Keep it as it was", style: "ghost" },
        ],
      });
      // Los días de oficina se guardan siempre; el reparto, solo si dices que sí.
      await store.saveWeek(answer === "yes" ? week : { ...state.ctx.week, ...days });
    } else {
      await store.saveWeek({ ...state.ctx.week, ...days });
    }
    await refresh(view);
  }

  const days = Object.values(state.ctx.dayLogs);
  if (shouldProposeLighten(state.date, state.ctx.weekStart, days, state.ctx.week, state.ctx.settings)) {
    const answer = await askSheet({
      title: "Rough week",
      text: "You've had a few low days. Want to lighten the rest of the week to 50%? You can still pick more any morning.",
      actions: [
        { id: "yes", label: "Lighten my week", style: "primary" },
        { id: "no", label: "Keep it as is", style: "ghost" },
      ],
    });
    if (answer) {
      const accepted = answer === "yes";
      let week = { ...state.ctx.week, proposal: accepted ? "accepted" : "declined", energyCap: accepted ? "half" : null };
      if (accepted) {
        const tomorrow = addDays(state.date, 1);
        week = store.proposeWeek({ ...state.ctx, week }, tomorrow, {}, "half").week;
      }
      await store.saveWeek(week);
      await refresh(view);
    }
  }
}

// ---------- Pantalla ----------

export async function renderToday(view) {
  const categories = await store.getCategories();
  state = await load();
  state.ctx.categoriesById = Object.fromEntries(categories.map((c) => [c.id, c]));
  draw(view);

  view.onclick = async (event) => {
    const check = event.target.closest("[data-check]");
    if (check) return toggle(view, check.dataset.check);
    const open = event.target.closest("[data-open]");
    if (open) return openTaskSheet(view, open.dataset.open);
    const unskip = event.target.closest("[data-unskip]");
    if (unskip) {
      await store.unskip(unskip.dataset.unskip, state.date);
      return refresh(view);
    }
    const limit = event.target.closest("[data-limit]");
    if (limit) {
      const task = state.ctx.tasks.find((t) => t.id === limit.dataset.limit);
      return openLimitSheet(task, state, () => refresh(view));
    }
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "checkin") openCheckIn(view);
    if (action === "evening") openEveningCheckIn(state, () => refresh(view));
    if (action === "more-limits") openLimitsSheet(state, () => refresh(view));
    if (action === "show-protected" || action === "hide-protected") {
      setRevealed(state.date, state.plan.protectedBlock, action === "show-protected");
      await refresh(view);
    }
    if (action === "undo-rest") {
      await store.saveDay({ ...state.dayLog, restDay: false });
      await refresh(view);
    }
  };

  // Cada minuto: cambia de día o entra/sale de un bloque protegido.
  const timer = setInterval(async () => {
    const date = todayISO();
    const block = planDay(date, { energy: state.energy, minutes: nowMinutes() }, { ...state.ctx, assignments: state.assignments }).protectedBlock;
    const evening = nowMinutes() >= toMinutes(state.ctx.settings.eveningCheckIn);
    if (date !== state.date || block?.from !== state.plan.protectedBlock?.from || evening !== isEvening()) {
      await refresh(view);
      if (evening && state.dayLog.checkedInAt && !state.dayLog.eveningAt && !eveningDismissed(state.date)) {
        openEveningCheckIn(state, () => refresh(view));
      }
    }
  }, 60000);
  view.cleanup = () => clearInterval(timer);

  // Check-in de la mañana: se abre solo la primera vez del día.
  let dismissed = false;
  try {
    dismissed = sessionStorage.getItem(`pace-checkin-${state.date}`) === "1";
  } catch {}
  // De noche se abre el de la noche (una vez); si no, el de la mañana.
  if (isEvening()) {
    // Solo si ese día hiciste el check-in de la mañana; si no, queda la tarjeta para abrirlo.
    if (state.dayLog.checkedInAt && !state.dayLog.eveningAt && !eveningDismissed(state.date)) openEveningCheckIn(state, () => refresh(view));
  } else if (!state.dayLog.checkedInAt && !dismissed) {
    openCheckIn(view);
  }
}
