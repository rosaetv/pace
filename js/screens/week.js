// Tu semana: oficina, gym, planes y citas de cada día, y cómo queda el reparto de tareas.
// Se usa el domingo para planear la siguiente, o en cualquier momento para ajustar la actual.

import { esc, icon, openSheet, askSheet } from "../ui.js";
import { todayISO, weekStart, weekDates, addDays, formatDate, formatTime, weekday } from "../logic/dates.js";
import { isRequiredOfficeDay } from "../logic/calendar.js";
import { planDay } from "../logic/planner.js";
import { lowDaysCount } from "../logic/energy.js";
import * as store from "../store.js";
import { openMoveSheet, remainingDays } from "./move.js";
import { isFlexible } from "../logic/recurrence.js";

export const PLAN_KINDS = [
  { id: "lunch-out", label: "Lunch out", icon: "utensils" },
  { id: "dinner-out", label: "Dinner out", icon: "utensils-crossed" },
  { id: "outing", label: "Going out", icon: "moon-star" },
  { id: "other", label: "Other", icon: "circle-ellipsis" },
];

let ctx;
let draft; // { officeDays, gymDays }
let from; // primer día que se puede cambiar
let proposal;
let lastWeekOpen = []; // tareas que quedaron abiertas la semana pasada

// Comidas, cenas y salidas cuentan para el aviso.
const OUT_KINDS = ["lunch-out", "dinner-out", "outing"];
const outLimit = () => ctx.tasks.find((t) => t.id === "outings")?.limit?.weeklyMax ?? 3;
const outCount = () => ctx.plans.filter((p) => OUT_KINDS.includes(p.kind)).length;

function toggleDate(list, date) {
  return list.includes(date) ? list.filter((d) => d !== date) : [...list, date].sort();
}

function recompute() {
  const { start, ...days } = draft;
  proposal = store.proposeWeek(ctx, from, days, "full");
}

function dayRow(date) {
  const past = date < from;
  const office = draft.officeDays.includes(date);
  const gym = draft.gymDays.includes(date);
  const required = isRequiredOfficeDay(date, ctx.settings);
  const plans = ctx.plans.filter((p) => p.date === date);
  const day = planDay(date, { energy: "full", minutes: 0, showProtected: true }, { ...ctx, week: proposal.week, assignments: proposal.week.assignments, today: todayISO() });
  const flexible = day.items.filter((i) => i.status === "planned" || (i.status === "due" && i.task.frequency.type !== "daily"));
  const isWeekend = weekday(date) >= 6;

  return `
    <section class="card week-day ${past ? "is-past" : ""}">
      <div class="week-day-head">
        <h2 class="week-day-title">${formatDate(date, "day")}${date === todayISO() ? ` <span class="badge tint-lilac">Today</span>` : ""}${
          proposal.overloaded?.includes(date) && !past ? ` <span class="badge tint-butter">Full day</span>` : ""
        }</h2>
        <div class="chips">
          ${
            isWeekend
              ? ""
              : `<button type="button" class="chip" data-office="${date}" aria-pressed="${office}" ${past ? "disabled" : ""}>${icon("building-2")} Office${required ? " ·  required" : ""}</button>`
          }
          <button type="button" class="chip" data-gym="${date}" aria-pressed="${gym}" ${past ? "disabled" : ""}>${icon("dumbbell")} Gym</button>
        </div>
      </div>
      <ul class="week-lines">
        ${day.events
          .map(
            (e) => `<li><button type="button" class="line-btn" data-event="${e.id}" data-date="${date}">${icon("calendar-clock")} ${esc(e.title)} · ${formatTime(e.start)}${e.movedFrom ? " (moved)" : ""}</button></li>`,
          )
          .join("")}
        ${plans
          .map((p) => {
            const kind = PLAN_KINDS.find((k) => k.id === p.kind) || PLAN_KINDS.at(-1);
            return `<li><button type="button" class="line-btn" data-plan="${p.id}">${icon(kind.icon)} ${esc(p.title || kind.label)}</button></li>`;
          })
          .join("")}
        ${flexible
          .map((i) =>
            past
              ? `<li class="muted">${i.task.emoji} ${esc(i.version.label)}</li>`
              : `<li><button type="button" class="line-btn line-task" data-move-task="${i.task.id}" data-date="${date}">${i.task.emoji} ${esc(i.version.label)} ${icon("arrow-left-right")}</button></li>`,
          )
          .join("")}
      </ul>
      ${past ? "" : `<button type="button" class="btn btn-ghost add-plan" data-add="${date}">${icon("plus")} Add a plan</button>`}
    </section>`;
}

function draw(view, start) {
  const isNext = start > weekStart(todayISO());
  const end = addDays(start, 6);
  const changes = ctx.week.assignments ? proposal.changes : [];
  const low = lowDaysCount(start, Object.values(ctx.dayLogs), ctx.settings);

  view.innerHTML = `
    <header class="topbar">
      <a class="icon-btn" href="#/today" aria-label="Back">${icon("chevron-left")}</a>
      <span class="topbar-title">${formatDate(start)} – ${formatDate(end)}</span>
      <span class="row" style="gap: 4px">
        <a class="icon-btn" href="#/week/${addDays(start, -7)}" aria-label="Previous week">${icon("arrow-left")}</a>
        <a class="icon-btn" href="#/week/${addDays(start, 7)}" aria-label="Next week">${icon("arrow-right")}</a>
      </span>
    </header>
    <h1 class="display screen-title">${isNext ? "Next week" : start < weekStart(todayISO()) ? "That week" : "Your week"}</h1>
    <p class="muted" style="margin: -12px 0 16px">Confirm office and gym days and add any plans. Pace spreads your tasks so no day gets too full.</p>
    ${
      ctx.week.proposal === "accepted"
        ? `<div class="tint tint-peach" style="margin-bottom: 12px">${icon("battery-low")} This week is set to 50%. <button class="link-btn" data-action="undo-lighten">Back to normal</button></div>`
        : low > 0 && !isNext
          ? `<p class="small muted" style="margin: 0 0 12px">${low} low ${low === 1 ? "day" : "days"} so far this week.</p>`
          : ""
    }
    ${
      outCount() > outLimit()
        ? `<div class="tint tint-butter" style="margin-bottom: 12px">${icon("heart-handshake")} ${outCount()} plans out this week. Your health and your home come first. Still your call.</div>`
        : ""
    }
    ${
      lastWeekOpen.length
        ? `<div class="card" style="margin-bottom: 12px">
            <strong>Still open from last week</strong>
            ${lastWeekOpen
              .map(
                (o) => `
              <div class="still-open">
                ${o.task.emoji} ${esc(o.task.name)}
                <div class="chips">
                  <button type="button" class="chip" data-carry="add" data-task="${o.task.id}">Add to this week</button>
                  <button type="button" class="chip" data-carry="dismiss" data-task="${o.task.id}">Let it go</button>
                </div>
              </div>`,
              )
              .join("")}
          </div>`
        : ""
    }
    ${weekDates(start).map(dayRow).join("")}
    ${
      proposal.unplaced.length
        ? `<p class="small muted">${proposal.unplaced.map((u) => esc(ctx.tasks.find((t) => t.id === u.taskId)?.name || u.taskId)).join(", ")} would overload a day this week, so ${proposal.unplaced.length === 1 ? "it stays" : "they stay"} in "Could do" if you have energy. Mark a task as non-negotiable to always give it a day.</p>`
        : ""
    }
    ${
      changes.length
        ? `<div class="tint tint-butter" style="margin-top: 12px">
            <strong>What changes</strong>
            <ul class="plain-list" style="margin-top: 6px">${changes.map((c) => `<li><span>${esc(ctx.tasks.find((t) => t.id === c.taskId)?.name || c.taskId)}</span><span>${esc(c.text)}</span></li>`).join("")}</ul>
          </div>`
        : ""
    }
    <div class="save-bar">
      <button class="btn btn-primary btn-block" data-action="accept">${ctx.week.plannedAt ? "Save my week" : "Looks good"}</button>
    </div>
  `;
}

// ---------- Hojas ----------

function addPlanSheet(view, start, date) {
  let kind = "dinner-out";
  const { sheet, close } = openSheet(
    `
    <h2 class="display sheet-title">${formatDate(date, "day")}</h2>
    <p class="muted" style="margin: 4px 0 16px">What's the plan?</p>
    <div class="chips" style="margin-bottom: 16px">
      ${PLAN_KINDS.map((k) => `<button type="button" class="chip" data-kind="${k.id}" aria-pressed="${k.id === kind}">${icon(k.icon)} ${k.label}</button>`).join("")}
      <button type="button" class="chip" data-kind="appointment" aria-pressed="false">${icon("calendar-clock")} Appointment</button>
    </div>
    <div class="field">
      <label for="f-plan-title">Name</label>
      <input id="f-plan-title" class="input" placeholder="Optional" />
    </div>
    <div class="field" id="time-field" hidden>
      <label for="f-plan-time">Time</label>
      <input id="f-plan-time" class="input" type="time" value="18:00" />
    </div>
    <button class="btn btn-primary btn-block" data-action="save-plan">Add</button>`,
    { label: "Add a plan" },
  );
  sheet.addEventListener("click", async (event) => {
    const chip = event.target.closest("[data-kind]");
    if (chip) {
      kind = chip.dataset.kind;
      sheet.querySelectorAll("[data-kind]").forEach((b) => b.setAttribute("aria-pressed", b === chip));
      sheet.querySelector("#time-field").hidden = kind !== "appointment";
    }
    if (event.target.closest("[data-action=save-plan]")) {
      const title = sheet.querySelector("#f-plan-title").value.trim();
      if (kind === "appointment") {
        await store.saveEvent({ title: title || "Appointment", emoji: "📅", date, start: sheet.querySelector("#f-plan-time").value || "09:00", durationMin: 60 });
      } else {
        await store.savePlan({ date, kind, title });
      }
      close();
      await renderWeek(view, start, { keepDraft: true });
      if (OUT_KINDS.includes(kind) && outCount() > outLimit()) {
        await askSheet({
          title: "Heads-up",
          text: `That's ${outCount()} plans out this week. Your health and your home are your priorities. Still your call.`,
          actions: [{ id: "ok", label: "Got it", style: "primary" }],
        });
      }
    }
  });
}

function planSheet(view, start, planId) {
  const plan = ctx.plans.find((p) => p.id === planId);
  const kind = PLAN_KINDS.find((k) => k.id === plan.kind) || PLAN_KINDS.at(-1);
  const { sheet, close } = openSheet(
    `
    <h2 class="display sheet-title">${esc(plan.title || kind.label)}</h2>
    <p class="muted">${kind.label} · ${formatDate(plan.date, "day")}</p>
    <button class="btn btn-secondary btn-block" data-action="delete-plan" style="margin-top: 16px">Remove plan</button>`,
    { label: "Plan" },
  );
  sheet.addEventListener("click", async (event) => {
    if (!event.target.closest("[data-action=delete-plan]")) return;
    await store.deletePlan(planId);
    close();
    await renderWeek(view, start, { keepDraft: true });
  });
}

function eventSheet(view, start, eventId, date) {
  const ev = ctx.events.find((e) => e.id === eventId);
  const recurring = Boolean(ev.recurrence);
  const exception = Object.entries(ev.exceptions || {}).find(([orig, ex]) => orig === date || ex.date === date);
  const original = exception ? exception[0] : date;
  const { sheet, close } = openSheet(
    `
    <h2 class="display sheet-title">${esc(ev.title)}</h2>
    <p class="muted" style="margin: 4px 0 16px">${formatDate(date, "day")}${recurring ? ` · every ${formatDate(date, "day").split(",")[0]}` : ""}</p>
    <div class="field-row">
      <div class="field"><label for="f-ev-date">Date</label><input id="f-ev-date" class="input" type="date" value="${date}" /></div>
      <div class="field"><label for="f-ev-time">Time</label><input id="f-ev-time" class="input" type="time" value="${(exception?.[1].start) || ev.start}" /></div>
    </div>
    <div class="stack">
      <button class="btn btn-primary btn-block" data-ev="move">${recurring ? "Move just this one" : "Save"}</button>
      ${recurring ? `<button class="btn btn-secondary btn-block" data-ev="skip">Skip just this one</button>` : ""}
      ${exception ? `<button class="btn btn-ghost btn-block" data-ev="restore">Back to usual</button>` : ""}
      ${recurring ? "" : `<button class="btn btn-ghost btn-block" data-ev="delete">Remove appointment</button>`}
    </div>`,
    { label: ev.title },
  );
  sheet.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-ev]")?.dataset.ev;
    if (!action) return;
    const newDate = sheet.querySelector("#f-ev-date").value || date;
    const newTime = sheet.querySelector("#f-ev-time").value || ev.start;
    const exceptions = { ...(ev.exceptions || {}) };
    if (action === "move") {
      if (recurring) exceptions[original] = { date: newDate, start: newTime };
      else return finish({ ...ev, date: newDate, start: newTime });
    }
    if (action === "skip") exceptions[original] = { cancelled: true };
    if (action === "restore") delete exceptions[original];
    if (action === "delete") {
      await store.deleteEvent(ev.id);
      close();
      return renderWeek(view, start, { keepDraft: true });
    }
    await finish({ ...ev, exceptions });

    async function finish(updated) {
      await store.saveEvent(updated);
      close();
      await renderWeek(view, start, { keepDraft: true });
    }
  });
}

// Tareas de la semana anterior que quedaron planeadas y sin hacer (ni soltar).
async function openFromLastWeek(start) {
  const prevStart = addDays(start, -7);
  const prev = await store.loadContext(prevStart);
  const assigned = prev.week.assignments || {};
  const prevEnd = addDays(prevStart, 6);
  const list = [];
  for (const task of prev.tasks.filter((t) => t.status === "active" && t.kind === "habit" && isFlexible(t))) {
    const dates = (assigned[task.id] || []).filter((d) => d < todayISO() || start > weekStart(todayISO()));
    const done = prev.completions.filter((c) => c.taskId === task.id && c.date >= prevStart && c.date <= prevEnd).length;
    const letGo = prev.skips.filter((x) => x.kind === "dismiss" && x.taskId === task.id && x.from >= prevStart && x.from <= prevEnd).length;
    const open = dates.length - done - letGo;
    if (open > 0) list.push({ task, from: dates[dates.length - open] });
  }
  return list;
}

// ---------- Pantalla ----------

export async function renderWeek(view, startParam, { keepDraft = false } = {}) {
  const today = todayISO();
  const start = weekStart(startParam || today);
  ctx = await store.loadContext(start);
  if (!keepDraft || !draft || draft.start !== start) draft = { start, ...store.weekDays(ctx) };
  from = start > today ? start : today;
  lastWeekOpen = start >= weekStart(today) ? await openFromLastWeek(start) : [];
  recompute();
  draw(view, start);

  view.onclick = async (event) => {
    const office = event.target.closest("[data-office]");
    if (office) {
      draft.officeDays = toggleDate(draft.officeDays, office.dataset.office);
      recompute();
      return draw(view, start);
    }
    const gym = event.target.closest("[data-gym]");
    if (gym) {
      draft.gymDays = toggleDate(draft.gymDays, gym.dataset.gym);
      recompute();
      return draw(view, start);
    }
    const moveTask = event.target.closest("[data-move-task]");
    if (moveTask) {
      const task = ctx.tasks.find((t) => t.id === moveTask.dataset.moveTask);
      return openMoveSheet(task, moveTask.dataset.date, ctx, () => renderWeek(view, start, { keepDraft: true }), {
        days: remainingDays(start),
      });
    }
    const carry = event.target.closest("[data-carry]");
    if (carry) {
      const open = lastWeekOpen.find((o) => o.task.id === carry.dataset.task);
      await store.dismissTask(open.task.id, today, open.from);
      if (carry.dataset.carry === "add") {
        const week = await store.getWeek(start);
        await store.saveWeek({ ...week, extra: { ...week.extra, [open.task.id]: (week.extra?.[open.task.id] || 0) + 1 } });
      }
      return renderWeek(view, start, { keepDraft: true });
    }
    const add = event.target.closest("[data-add]");
    if (add) return addPlanSheet(view, start, add.dataset.add);
    const plan = event.target.closest("[data-plan]");
    if (plan) return planSheet(view, start, plan.dataset.plan);
    const ev = event.target.closest("[data-event]");
    if (ev) return eventSheet(view, start, ev.dataset.event, ev.dataset.date);

    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "accept") {
      const { start: _s, ...days } = draft;
      await store.acceptWeek({ ...proposal.week, ...days, weekStart: start });
      location.hash = "#/today";
    }
    if (action === "undo-lighten") {
      await store.saveWeek({ ...ctx.week, proposal: "declined", energyCap: null });
      await renderWeek(view, start, { keepDraft: true });
    }
  };
}
