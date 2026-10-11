// Check-in de la noche y detalle de cada límite.
// Sin penalización: los colores solo informan (neutral → amarillo → rojo).

import { esc, icon, openSheet, toast } from "../ui.js";
import { weekday, formatDate, addDays } from "../logic/dates.js";
import { limitStatus } from "../logic/limits.js";
import * as store from "../store.js";

const DEFAULT_LIMIT_ICONS = { wine: "wine", outings: "moon-star" };
export const limitIcon = (task) => task.limit?.icon || DEFAULT_LIMIT_ICONS[task.id] || "gauge";
export const LIMIT_TINT = { ok: "lilac", at: "butter", over: "coral" };

const isHours = (task) => task.limit.perOccasionUnit === "hours";
const hoursText = (h) => `${Number.isInteger(h) ? h : h.toFixed(1)} h`;

// Lo registrado hoy para un límite: { amount, hours }.
// Si aún no hay nada y tenías una cena o salida planeada, "Did you go out?" viene en Yes.
function todayValue(task, date, entries, plans = []) {
  const e = entries.find((x) => x.taskId === task.id && x.date === date);
  if (e) return { amount: e.amount || 0, hours: e.hours ?? null };
  const planned = isHours(task) && plans.some((p) => p.date === date && (p.kind === "dinner-out" || p.kind === "outing"));
  return planned ? { amount: 1, hours: 2 } : { amount: 0, hours: null };
}

// Mensajes amables según el estado.
function statusNote(task, status, value) {
  const l = task.limit;
  const notes = [];
  if (status.state === "at") notes.push(`That's this week's ${l.weeklyMax}.`);
  if (status.state === "over") notes.push(`Over this week's ${l.weeklyMax}. No penalty, just noticing.`);
  if (l.perOccasionMax) {
    const each = isHours(task) ? value.hours || 0 : value.amount;
    if (value.amount && each > l.perOccasionMax) {
      notes.push(isHours(task) ? `Longer than ${l.perOccasionMax} h tonight. Just noticing.` : `More than ${l.perOccasionMax} in one go. Just noticing.`);
    }
  }
  return notes.join(" ");
}

function meter(status) {
  const n = Math.max(status.max, status.used);
  return `<div class="meter">${Array.from({ length: n }, (_, i) => `<span class="${i < status.used ? "on" : ""}"></span>`).join("")}</div>`;
}

// Bloque para registrar un límite (se usa en el check-in de noche y en el detalle).
function limitBlock(task, value, entries, date) {
  const others = entries.filter((e) => !(e.taskId === task.id && e.date === date));
  const draftEntries = value.amount ? [...others, { taskId: task.id, date, ...value }] : others;
  const status = limitStatus(task, draftEntries, date);
  const tint = LIMIT_TINT[status.state];
  const note = statusNote(task, status, value);

  let control;
  if (isHours(task)) {
    const out = value.amount > 0;
    control = `
      <div class="chips" style="margin: 8px 0">
        <button type="button" class="chip" data-out="${task.id}" data-value="0" aria-pressed="${!out}">No</button>
        <button type="button" class="chip" data-out="${task.id}" data-value="1" aria-pressed="${out}">Yes</button>
      </div>
      ${
        out
          ? `<div class="toggle-row">
              <span>How long</span>
              <span class="stepper">
                <button type="button" data-hours="${task.id}" data-delta="-0.5" aria-label="Less time">−</button>
                <output>${hoursText(value.hours || 0)}</output>
                <button type="button" data-hours="${task.id}" data-delta="0.5" aria-label="More time">+</button>
              </span>
            </div>`
          : ""
      }`;
  } else {
    control = `
      <div class="toggle-row">
        <span>${esc(capitalize(task.limit.unit))}</span>
        <span class="stepper">
          <button type="button" data-amount="${task.id}" data-delta="-1" aria-label="Less">−</button>
          <output>${value.amount}</output>
          <button type="button" data-amount="${task.id}" data-delta="1" aria-label="More">+</button>
        </span>
      </div>`;
  }

  const question = isHours(task) ? "Did you go out tonight?" : `${task.name} today`;
  return `
    <div class="limit-block tint-${tint}">
      <div class="row" style="justify-content: space-between">
        <strong class="row" style="gap: 6px">${icon(limitIcon(task))} ${esc(question)}</strong>
        <span class="small" style="color: var(--ink-2)">${status.used} of ${status.max} this week</span>
      </div>
      ${meter(status)}
      ${control}
      ${task.limit.guidance?.length ? `<p class="small" style="margin: 4px 0 0; color: var(--ink-2)">${task.limit.guidance.map(esc).join(" · ")}</p>` : ""}
      ${note ? `<p class="small" style="margin: 6px 0 0; font-weight: 600">${esc(note)}</p>` : ""}
    </div>`;
}

const capitalize = (s = "") => s.charAt(0).toUpperCase() + s.slice(1);

// Cambios en los controles de un límite. Devuelve true si algo cambió.
function handleLimitClick(event, values) {
  const out = event.target.closest("[data-out]");
  if (out) {
    const v = values[out.dataset.out];
    v.amount = Number(out.dataset.value);
    v.hours = v.amount ? v.hours || 2 : null;
    return true;
  }
  const hours = event.target.closest("[data-hours]");
  if (hours) {
    const v = values[hours.dataset.hours];
    v.hours = Math.min(12, Math.max(0.5, (v.hours || 0) + Number(hours.dataset.delta)));
    return true;
  }
  const amount = event.target.closest("[data-amount]");
  if (amount) {
    const v = values[amount.dataset.amount];
    v.amount = Math.min(20, Math.max(0, v.amount + Number(amount.dataset.delta)));
    return true;
  }
  return false;
}

// ---------- Check-in de la noche ----------

// Lo que quedó sin marcar hoy, para decidir qué hacer con cada cosa.
function stillOpenSection(open) {
  if (!open.length) return "";
  return `
    <p class="small muted" style="margin: 0 0 4px">Still open today</p>
    <p class="small" style="margin: 0 0 8px">A few things are still open. What do you want to do with them?</p>
    <div class="card" style="padding: 4px 16px; margin-bottom: 16px">
      ${open
        .map((item) => {
          const daily = item.task.frequency.type === "daily";
          return `
          <div class="still-open">
            <strong>${item.task.emoji} ${esc(item.version?.label || item.task.name)}</strong>
            <div class="chips">
              <button type="button" class="chip" data-open-action="done" data-task="${item.task.id}">${icon("check")} Done</button>
              ${
                daily
                  ? `<button type="button" class="chip" data-open-action="skip" data-task="${item.task.id}">Not today</button>`
                  : `<button type="button" class="chip" data-open-action="tomorrow" data-task="${item.task.id}">Move to tomorrow</button>
                     <button type="button" class="chip" data-open-action="dismiss" data-task="${item.task.id}">Let it go</button>`
              }
            </div>
          </div>`;
        })
        .join("")}
    </div>`;
}

export function openEveningCheckIn({ date, ctx, dayLog, plan }, onSaved) {
  let open = plan ? [...plan.items, ...plan.resting].filter((i) => i.status !== "done") : [];
  let acted = false;
  const limits = ctx.tasks.filter(
    (t) => t.kind === "limit" && t.status === "active" && limitStatus(t, [], date).countsToday,
  );
  const sunday = weekday(date) === 7;
  const bonus = ctx.tasks.filter(
    (t) => t.kind === "bonus" && t.status === "active" && ((t.bonus?.scope || "day") === "day" || sunday),
  );

  const values = Object.fromEntries(limits.map((t) => [t.id, todayValue(t, date, ctx.limitEntries, ctx.plans)]));
  const bonusDone = new Set(
    bonus
      .filter((t) =>
        ctx.completions.some((c) => c.taskId === t.id && (t.bonus?.scope === "week" ? c.date >= ctx.weekStart : c.date === date)),
      )
      .map((t) => t.id),
  );
  const bonusBefore = new Set(bonusDone);

  const body = () => `
    <h2 class="display sheet-title">Good evening</h2>
    <p class="muted" style="margin: 4px 0 16px">A quick look at today. Nothing here counts against you.</p>
    ${stillOpenSection(open)}
    <div class="stack">${limits.map((t) => limitBlock(t, values[t.id], ctx.limitEntries, date)).join("")}</div>
    ${
      bonus.length
        ? `<p class="small muted" style="margin: 20px 0 8px">Bonus wins</p>
           <div class="chips">
             ${bonus
               .map((t) => `<button type="button" class="chip" data-bonus="${t.id}" aria-pressed="${bonusDone.has(t.id)}">${t.emoji} ${esc(t.name)}</button>`)
               .join("")}
           </div>`
        : ""
    }
    <button class="btn btn-primary btn-block" data-action="save-evening" style="margin-top: 24px">Done for today</button>`;

  const { sheet, close } = openSheet(`<div id="evening-body">${body()}</div>`, {
    label: "Evening check-in",
    onClose: () => {
      markEveningDismissed(date);
      if (acted) onSaved?.();
    },
  });
  const container = sheet.querySelector("#evening-body");

  sheet.addEventListener("click", async (event) => {
    if (handleLimitClick(event, values)) {
      container.innerHTML = body();
      return;
    }
    const openAction = event.target.closest("[data-open-action]");
    if (openAction) {
      const item = open.find((i) => i.task.id === openAction.dataset.task);
      const from = item.from || date;
      const action = openAction.dataset.openAction;
      if (action === "done") await store.toggleCompletion(item.task, date, item.version, dayLog.energy);
      if (action === "skip") await store.skipToday(item.task.id, date);
      if (action === "tomorrow") await store.moveTask(item.task, from, addDays(date, 1));
      if (action === "dismiss") await store.dismissTask(item.task.id, date, from);
      open = open.filter((i) => i !== item);
      acted = true;
      container.innerHTML = body();
      return;
    }
    const b = event.target.closest("[data-bonus]");
    if (b) {
      bonusDone.has(b.dataset.bonus) ? bonusDone.delete(b.dataset.bonus) : bonusDone.add(b.dataset.bonus);
      container.innerHTML = body();
      return;
    }
    if (event.target.closest("[data-action=save-evening]")) {
      for (const t of limits) await store.setLimitEntry(t.id, date, values[t.id]);
      // Bonus: solo cambia lo que marcaste o desmarcaste aquí.
      for (const t of bonus) {
        if (bonusDone.has(t.id) === bonusBefore.has(t.id)) continue;
        const existing = ctx.completions.find(
          (c) => c.taskId === t.id && (t.bonus?.scope === "week" ? c.date >= ctx.weekStart : c.date === date),
        );
        await store.toggleCompletion(t, existing?.date || date, { label: t.name }, dayLog.energy);
      }
      await store.saveDay({ ...dayLog, eveningAt: new Date().toISOString() });
      markEveningDismissed(date);
      close();
      onSaved?.();
    }
  });
}

export function eveningDismissed(date) {
  try {
    return sessionStorage.getItem(`pace-evening-${date}`) === "1";
  } catch {
    return false;
  }
}

function markEveningDismissed(date) {
  try {
    sessionStorage.setItem(`pace-evening-${date}`, "1");
  } catch {}
}

// ---------- Detalle de un límite (al tocar su contador) ----------

export function openLimitSheet(task, { date, ctx }, onSaved) {
  const status0 = limitStatus(task, ctx.limitEntries, date);
  const values = { [task.id]: todayValue(task, date, ctx.limitEntries) };
  const entries = ctx.limitEntries
    .filter((e) => e.taskId === task.id && e.date >= status0.start && e.date <= status0.end && e.date !== date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const body = () => `
    <div class="row" style="gap: 10px; margin-bottom: 4px">
      ${icon(limitIcon(task))}
      <h2 class="display sheet-title">${esc(task.name)}</h2>
    </div>
    <p class="muted" style="margin: 0 0 16px">
      Max ${task.limit.weeklyMax} ${esc(task.limit.unit)} a week${task.limit.perOccasionMax ? `, ${task.limit.perOccasionMax}${isHours(task) ? " h" : ""} each time` : ""}.
      Week counts ${formatDate(status0.start, "day")} to ${formatDate(status0.end, "day")}.
    </p>
    ${
      status0.countsToday
        ? limitBlock(task, values[task.id], ctx.limitEntries, date)
        : `<div class="limit-block tint-lilac"><p style="margin: 0">Today doesn't count for this one.</p></div>`
    }
    ${
      entries.length
        ? `<p class="small muted" style="margin: 20px 0 8px">Earlier this week</p>
           <ul class="plain-list">
             ${entries.map((e) => `<li><span>${formatDate(e.date, "day")}</span><span>${isHours(task) ? hoursText(e.hours || 0) : `${e.amount} ${esc(task.limit.unit)}`}</span></li>`).join("")}
           </ul>`
        : ""
    }
    ${status0.countsToday ? `<button class="btn btn-primary btn-block" data-action="save-limit" style="margin-top: 24px">Save</button>` : ""}`;

  const { sheet, close } = openSheet(`<div id="limit-body">${body()}</div>`, { label: task.name });
  const container = sheet.querySelector("#limit-body");
  sheet.addEventListener("click", async (event) => {
    if (handleLimitClick(event, values)) {
      container.innerHTML = body();
      return;
    }
    if (event.target.closest("[data-action=save-limit]")) {
      await store.setLimitEntry(task.id, date, values[task.id]);
      close();
      onSaved?.();
    }
  });
}

// ---------- Límites en Today: máximo 2 a la vista, el resto en "More" ----------

export const MAX_ON_TODAY = 2;

// Los que eliges ver en Today (en tu orden), y el resto.
export function todayLimits(tasks) {
  const all = tasks.filter((t) => t.kind === "limit" && t.status === "active");
  const shown = all.filter((t) => t.limit.onToday !== false).slice(0, MAX_ON_TODAY);
  return { all, shown, rest: all.filter((t) => !shown.includes(t)) };
}

export function openLimitsSheet({ date, ctx }, onChanged) {
  let { all, shown } = todayLimits(ctx.tasks);
  let pinned = new Set(shown.map((t) => t.id));
  let changed = false;

  const body = () => `
    <h2 class="display sheet-title">Your limits</h2>
    <p class="muted" style="margin: 4px 0 16px">Pin up to ${MAX_ON_TODAY} to see them at the top of Today.</p>
    <ul class="settings-group">
      ${all
        .map((task) => {
          const s = limitStatus(task, ctx.limitEntries, date);
          const on = pinned.has(task.id);
          return `
          <li class="limit-row">
            <button class="settings-item" data-open-limit="${task.id}">
              <span class="settings-icon tint-${LIMIT_TINT[s.state]}">${icon(limitIcon(task))}</span>
              <span class="settings-item-title">${esc(task.name)}</span>
              <span class="small muted">${s.used} of ${s.max}</span>
            </button>
            <button class="pin-btn" data-pin="${task.id}" aria-pressed="${on}" aria-label="${on ? "Unpin from" : "Pin to"} Today">${icon(on ? "pin" : "pin-off")}</button>
          </li>`;
        })
        .join("")}
    </ul>`;

  const { sheet, close } = openSheet(`<div id="limits-body">${body()}</div>`, {
    label: "Your limits",
    onClose: () => changed && onChanged?.(),
  });
  const container = sheet.querySelector("#limits-body");

  sheet.addEventListener("click", async (event) => {
    const pin = event.target.closest("[data-pin]");
    if (pin) {
      const id = pin.dataset.pin;
      if (pinned.has(id)) pinned.delete(id);
      else if (pinned.size >= MAX_ON_TODAY) {
        toast(`Up to ${MAX_ON_TODAY} on Today. Unpin one first.`);
        return;
      } else pinned.add(id);
      // Se guarda para todos, así queda claro cuáles van arriba.
      for (const task of all) {
        const onToday = pinned.has(task.id);
        if (task.limit.onToday !== onToday) {
          task.limit = { ...task.limit, onToday };
          await store.saveTask(task);
        }
      }
      changed = true;
      container.innerHTML = body();
      return;
    }
    const open = event.target.closest("[data-open-limit]");
    if (open) {
      close();
      if (changed) await onChanged?.();
      openLimitSheet(all.find((t) => t.id === open.dataset.openLimit), { date, ctx }, onChanged);
    }
  });
}
