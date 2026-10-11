// El "cerebro" de Pace:
//  - planWeek: reparte las tareas flexibles (X veces por semana) en los días que quedan,
//    respetando restricciones y sin cargar demasiado ningún día.
//  - diffAssignments: compara dos repartos para pedirte luz verde ("Laundry: Tue → Wed").
//  - planDay: arma la lista de Today.
//
// Todo es lógica pura: recibe datos y devuelve resultados, sin tocar la base de datos.

import { weekStart, weekDates, addDays, diffDays, weekday, formatDate } from "./dates.js";
import { dayInfo, dayCapacity, protectedBlockAt } from "./calendar.js";
import { isDueOn, isFlexible, lastDueBefore } from "./recurrence.js";
import { effectiveTask, versionFor, weeklyTarget } from "./energy.js";
import { eventsOn } from "./events.js";

const isActiveHabit = (t) => t.status === "active" && t.kind === "habit";

function completionDates(taskId, completions, from, to) {
  return completions.filter((c) => c.taskId === taskId && c.date >= from && c.date <= to).map((c) => c.date);
}

// ¿Se puede hacer esa tarea ese día? (sin mirar cuántas veces van)
function allowedOn(task, info) {
  const c = task.constraints || {};
  if (c.notTags?.some((tag) => info.tags.has(tag))) return false;
  if (c.forbiddenDays?.includes(info.weekday)) return false;
  return true;
}

// Fechas fijadas a mano en el plan de la semana (las mueves tú; el planificador no las toca).
function pinsFor(task, ctx, date) {
  const week = ctx.week;
  if (!week?.pinned?.[task.id]) return null;
  if (week.weekStart && weekStart(date) !== week.weekStart) return null;
  return week.pinned[task.id];
}

// ¿Toca una tarea de fecha fija ese día? (respetando si la moviste esa semana)
function dueOnDate(task, date, ctx) {
  const pins = pinsFor(task, ctx, date);
  return pins ? pins.includes(date) : isDueOn(task, date);
}

// "Let it go": la soltaste a propósito (no cuenta como fallo).
const dismissals = (taskId, ctx, from, to) =>
  (ctx.skips || []).filter((s) => s.kind === "dismiss" && s.taskId === taskId && s.from >= from && s.from <= to);

const isNotToday = (s, taskId, date) => s.kind !== "dismiss" && s.taskId === taskId && s.date === date;

// Ninguna fecha nueva queda demasiado cerca de otra (las de "base" ya están decididas).
function respectsRestWith(base, combo, minRest) {
  if (!minRest) return true;
  return combo.every((d, i) => [...base, ...combo.filter((_, j) => j !== i)].every((x) => Math.abs(diffDays(d, x)) > minRest));
}

function respectsRest(dates, minRest) {
  if (!minRest) return true;
  const sorted = [...dates].sort();
  for (let i = 1; i < sorted.length; i++) {
    if (diffDays(sorted[i - 1], sorted[i]) <= minRest) return false;
  }
  return true;
}

function combinations(items, size) {
  if (size === 0) return [[]];
  const out = [];
  items.forEach((item, i) => {
    for (const rest of combinations(items.slice(i + 1), size - 1)) out.push([item, ...rest]);
  });
  return out;
}

// Grupos de "elige una" (baño o cuarto): con energía baja basta con una de las dos.
function groupSatisfied(task, ctx, start, end, energy) {
  const group = task.constraints?.choiceGroup;
  if (!group || !ctx.settings.energy.lowLevels.includes(energy)) return false;
  return ctx.tasks.some(
    (other) =>
      other.constraints?.choiceGroup === group && completionDates(other.id, ctx.completions, start, end).length > 0,
  );
}

function isGroupFollower(task, ctx, energy) {
  const group = task.constraints?.choiceGroup;
  if (!group || !ctx.settings.energy.lowLevels.includes(energy)) return false;
  const first = ctx.tasks.find((t) => isActiveHabit(t) && t.constraints?.choiceGroup === group);
  return first && first.id !== task.id;
}

/**
 * Reparte las tareas flexibles de la semana.
 * ctx: { settings, week, tasks, overrides, completions, events, plans }
 * from: primer día que se puede planear (hoy, o el lunes si planeas la semana siguiente).
 * energy: nivel con el que se calcula cuántas veces toca.
 * Devuelve { assignments: { taskId: [fechas] }, unplaced: [{ taskId, missing }] }
 */
export function planWeek(start, from, energy, ctx) {
  const end = addDays(start, 6);
  const days = weekDates(start).filter((d) => d >= from);
  const infos = Object.fromEntries(days.map((d) => [d, dayInfo(d, ctx.settings, ctx.week, ctx.dayLogs?.[d])]));

  // Carga de partida: tareas de fecha fija con esfuerzo, citas y planes.
  const load = Object.fromEntries(days.map((d) => [d, 0]));
  for (const d of days) {
    for (const t of ctx.tasks.filter(isActiveHabit)) {
      const task = effectiveTask(t, ctx.overrides, start);
      if (!isFlexible(task) && task.frequency.type !== "daily" && dueOnDate(task, d, ctx) && versionFor(task, energy)) {
        load[d] += task.effort || 1;
      }
    }
    load[d] += eventsOn(d, ctx.events).length;
    load[d] += (ctx.plans || []).filter((p) => p.date === d).length;
  }

  const flexible = ctx.tasks
    .filter(isActiveHabit)
    .map((t) => effectiveTask(t, ctx.overrides, start))
    .filter(isFlexible)
    .map((task) => {
      const done = completionDates(task.id, ctx.completions, start, end);
      const pinned = (pinsFor(task, ctx, start) || []).filter((d) => d >= from && !done.includes(d));
      pinned.forEach((d) => load[d] !== undefined && (load[d] += task.effort || 1));
      const target = weeklyTarget(task, energy) + (ctx.week?.extra?.[task.id] || 0);
      let need = Math.max(0, target - done.length - dismissals(task.id, ctx, start, end).length - pinned.length);
      if (isGroupFollower(task, ctx, energy) || groupSatisfied(task, ctx, start, end, energy)) need = 0;
      const candidates = days.filter((d) => allowedOn(task, infos[d]) && !done.includes(d) && !pinned.includes(d));
      // Para lo no negociable, último recurso: cualquier día libre de la semana (aunque rompa una regla).
      const anyDay = days.filter((d) => !done.includes(d) && !pinned.includes(d));
      return { task, done, pinned, need, candidates, anyDay };
    })
    .filter((x) => x.need > 0 || x.pinned.length)
    // Primero lo no negociable; luego lo más pesado (gym); entre iguales, lo más difícil de acomodar.
    .sort(
      (a, b) =>
        Number(Boolean(b.task.mustDo)) - Number(Boolean(a.task.mustDo)) ||
        (b.task.effort || 1) - (a.task.effort || 1) ||
        a.candidates.length - a.need - (b.candidates.length - b.need),
    );

  const assignments = {};
  const unplaced = [];
  const forced = []; // no negociables que tuvieron que pasarse de la capacidad o de una regla

  // Mejor combinación de exactamente "size" días. Opciones: respetar capacidad y descanso.
  function search(task, cands, size, base, { capacity = true, rest = true } = {}) {
    const effort = task.effort || 1;
    const minRest = rest ? task.constraints?.minRestDays || 0 : 0;
    const preferred = task.constraints?.preferredDays || [];
    let best = null;
    for (const combo of combinations(cands, size)) {
      if (!respectsRestWith(base, combo, minRest)) continue;
      // Tope: ningún día recibe más de lo que aguanta (salvo lo no negociable, como último recurso).
      if (capacity && combo.some((d) => load[d] + effort > dayCapacity(infos[d], ctx.settings))) continue;
      let score = 0;
      for (const d of combo) {
        const info = infos[d];
        score += (load[d] + effort) / dayCapacity(info, ctx.settings);
        if (task.constraints?.gymDay && !info.gym) score += 1.5; // mejor en sus días de gym
        if (preferred.length && !preferred.includes(info.weekday)) score += 2; // mejor en sus días preferidos
        if (info.office) score += 1.5; // los días de oficina, lo menos posible
      }
      // Con empate, lo más pronto posible.
      score += combo.reduce((sum, d) => sum + diffDays(from, d), 0) * 0.001;
      if (!best || score < best.score) best = { combo, score };
    }
    return best?.combo || null;
  }

  for (const { task, done, pinned, need, candidates, anyDay } of flexible) {
    const effort = task.effort || 1;
    const base = [...done, ...pinned];
    let combo = null;

    // Normal: lo más que quepa sin pasarse de nada.
    for (let size = Math.min(need, candidates.length); size > 0 && !combo; size--) {
      combo = search(task, candidates, size, base);
      if (combo && combo.length < need && task.mustDo) combo = null; // lo no negociable necesita todas sus veces
    }

    // No negociable: se relaja paso a paso hasta que quepa entero.
    if (task.mustDo && !combo && need > 0) {
      const steps = [
        [candidates, { capacity: false }],
        [candidates, { capacity: false, rest: false }],
        [anyDay, { capacity: false, rest: false }],
      ];
      for (const [cands, opts] of steps) {
        combo = search(task, cands, Math.min(need, cands.length), base, opts);
        if (combo) break;
      }
      if (combo) forced.push(task.id);
    }

    if (combo) combo.forEach((d) => (load[d] += effort));
    const dates = [...pinned, ...(combo || [])].sort();
    if (dates.length) assignments[task.id] = dates;
    const placed = combo ? combo.length : 0;
    if (placed < need) unplaced.push({ taskId: task.id, missing: need - placed });
  }

  // Días que quedaron por encima de su capacidad (por algo no negociable o movido a mano).
  const overloaded = days.filter((d) => load[d] > dayCapacity(infos[d], ctx.settings));

  return { assignments, unplaced, load, overloaded, forced };
}

// Diferencias entre el reparto aceptado y uno nuevo, para pedir luz verde.
export function diffAssignments(oldA = {}, newA = {}, from) {
  const ids = new Set([...Object.keys(oldA), ...Object.keys(newA)]);
  const changes = [];
  for (const id of ids) {
    const before = (oldA[id] || []).filter((d) => d >= from).sort();
    const after = (newA[id] || []).filter((d) => d >= from).sort();
    if (before.join() !== after.join()) {
      changes.push({ taskId: id, from: before, to: after, text: `${before.map(dayName).join(", ") || "—"} → ${after.map(dayName).join(", ") || "—"}` });
    }
  }
  return changes;
}

const dayName = (d) => formatDate(d, "day");

// Cuántos días hacia atrás se busca algo pendiente de fecha fija.
const CARRY_LOOKBACK = 60;

// Tarea flexible: la primera fecha planeada de esta semana (antes de hoy) que sigue sin hacerse.
// Solo cuentan los días que ya pasaron de verdad (ctx.today); en la vista previa de la semana, el futuro no está "abierto".
function openFrom(task, date, assignments, ctx, start) {
  const limit = ctx.today && ctx.today < date ? ctx.today : date;
  const past = (assignments[task.id] || []).filter((d) => d < limit).sort();
  if (!past.length) return null;
  const covered =
    ctx.completions.filter((c) => c.taskId === task.id && c.date >= start && c.date < date).length +
    dismissals(task.id, ctx, start, addDays(start, 6)).length;
  return past.length > covered ? past[covered] : null;
}

/**
 * Lista de Today.
 * ctx: { settings, week, tasks, overrides, completions, skips, events, assignments, dayLogs }
 * options: { energy, minutes (hora actual), showProtected }
 */
export function planDay(date, { energy, minutes = 0, showProtected = false }, ctx) {
  const start = weekStart(date);
  const end = addDays(start, 6);
  const info = dayInfo(date, ctx.settings, ctx.week, ctx.dayLogs?.[date]);
  const block = protectedBlockAt(info, minutes);
  const assignments = ctx.assignments || {};

  // "Día de gym" = el día en que el gym quedó planeado o ya se hizo (aunque se haya movido).
  const gymTasks = ctx.tasks.filter((t) => t.constraints?.gymDay);
  if (gymTasks.length && ctx.assignments) {
    const gymToday = gymTasks.some(
      (t) => (assignments[t.id] || []).includes(date) || ctx.completions.some((c) => c.taskId === t.id && c.date === date),
    );
    if (gymToday) info.tags.add("gym");
    else info.tags.delete("gym");
  }

  const items = [];
  const couldDo = [];
  const resting = [];
  const skipped = [];

  for (const t of ctx.tasks.filter(isActiveHabit)) {
    const task = effectiveTask(t, ctx.overrides, start);
    const doneToday = ctx.completions.find((c) => c.taskId === task.id && c.date === date);
    const version = versionFor(task, energy);

    if (doneToday) {
      items.push({ task, version: { label: doneToday.versionLabel }, status: "done", doneAt: doneToday.doneAt });
      continue;
    }
    if (!version || !allowedOn(task, info)) continue;

    let entry = null;

    if (isFlexible(task)) {
      const doneWeek = completionDates(task.id, ctx.completions, start, end);
      const target = weeklyTarget(task, energy);
      const progress = { done: doneWeek.length, target };
      if (isGroupFollower(task, ctx, energy) && !(assignments[task.id] || []).includes(date)) {
        // Con energía baja, la segunda tarea del grupo solo aparece como opcional.
        if (!groupSatisfied(task, ctx, start, end, energy)) entry = { status: "couldDo", progress };
      } else if (groupSatisfied(task, ctx, start, end, energy)) {
        entry = null;
      } else if (openFrom(task, date, assignments, ctx, start)) {
        // Tocaba un día anterior de esta semana y no se hizo: sigue abierta hasta que la hagas o la sueltes.
        entry = { status: "carried", from: openFrom(task, date, assignments, ctx, start), progress };
      } else if ((assignments[task.id] || []).includes(date)) {
        entry = { status: "planned", progress };
      } else if (doneWeek.length < target) {
        // Adelantar: reemplaza la próxima vez planeada, sin romper el descanso entre sesiones.
        const minRest = task.constraints?.minRestDays || 0;
        const planned = (assignments[task.id] || []).filter((d) => d > date);
        if (respectsRest([...doneWeek, ...planned.slice(1), date], minRest)) entry = { status: "couldDo", progress };
      }
    } else if (dueOnDate(task, date, ctx)) {
      // Meal prep: si ya lo adelantaste esta semana, el domingo no vuelve a salir.
      const early = task.constraints?.earlyFrom;
      const doneEarly = early && completionDates(task.id, ctx.completions, addDays(date, -(weekday(date) - early)), date).length > 0;
      if (!doneEarly) entry = { status: "due" };
    } else if (task.constraints?.earlyFrom && weekday(date) >= task.constraints.earlyFrom) {
      // Se puede adelantar: aparece como opcional los días previos de la misma semana.
      const nextDue = weekDates(start).find((d) => d > date && dueOnDate(task, d, ctx));
      const doneThisWeek = completionDates(task.id, ctx.completions, start, end).length > 0;
      if (nextDue && !doneThisWeek) entry = { status: "couldDo", dueOn: nextDue };
    }
    if (!entry && !isFlexible(task) && task.frequency.type !== "daily") {
      // Fecha fija que no se hizo: sigue abierta (aunque cambie la semana) hasta que la hagas o la sueltes.
      const last = lastDueBefore(task, date, CARRY_LOOKBACK, (d) => dueOnDate(task, d, ctx));
      // Si se puede adelantar (meal prep desde el viernes), hacerlo antes también cuenta.
      const early = task.constraints?.earlyFrom;
      const coveredFrom = last && early ? addDays(last, -((weekday(last) - early + 7) % 7)) : last;
      if (
        last &&
        last >= (ctx.settings.startedAt || "") &&
        !ctx.completions.some((c) => c.taskId === task.id && c.date >= coveredFrom) &&
        !dismissals(task.id, ctx, last, date).length
      ) {
        entry = { status: "carried", from: last };
      }
    }

    if (!entry) continue;
    const item = { task, version, ...entry };

    if ((ctx.skips || []).some((s) => isNotToday(s, task.id, date))) {
      skipped.push(item);
    } else if (block && !showProtected && !task.constraints?.skipsProtected) {
      // En tiempo libre descansan; las opcionales ni se cuentan.
      if (entry.status !== "couldDo") resting.push(item);
    } else if (entry.status === "couldDo") {
      couldDo.push(item);
    } else {
      items.push(item);
    }
  }

  // Pendientes primero (en tu orden), hechas al final en el orden en que las marcaste.
  const order = (a, b) => (a.task.order ?? 0) - (b.task.order ?? 0);
  const pending = items.filter((i) => i.status !== "done").sort(order);
  const done = items.filter((i) => i.status === "done").sort((a, b) => (a.doneAt || "").localeCompare(b.doneAt || ""));

  return {
    date,
    info,
    energy,
    protectedBlock: block,
    items: [...pending, ...done],
    couldDo: couldDo.sort(order),
    resting: resting.sort(order),
    skipped,
    events: eventsOn(date, ctx.events),
  };
}
