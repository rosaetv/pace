// Datos de la app: carga inicial, lectura y guardado.
// Las pantallas hablan con este archivo, nunca directamente con la base de datos.

import { db, newId } from "./db.js";
import { DEFAULT_SETTINGS, CATEGORIES, TASKS, EVENTS, SCHEMA_VERSION } from "./data/seed.js";
import { weekStart, addDays, weekDates, todayISO } from "./logic/dates.js";
import { isDueOn, isFlexible } from "./logic/recurrence.js";
import { sortTasksByTime, orderWithTask } from "./logic/time-of-day.js";
import { planWeek, diffAssignments } from "./logic/planner.js";
import { officeDates, gymDates } from "./logic/calendar.js";

// ---------- Primera vez ----------

export async function init() {
  const settings = await db.get("kv", "settings");
  if (settings) return migrate(settings);
  for (const c of CATEGORIES) await db.put("categories", c);
  for (const [i, t] of TASKS.entries()) await db.put("tasks", { ...t, order: i, createdAt: new Date().toISOString() });
  for (const e of EVENTS) await db.put("events", e);
  await db.put("kv", { ...DEFAULT_SETTINGS, startedAt: todayISO() }, "settings");
}

// Cambios de versión: ajustan tus datos guardados sin perder nada.
async function migrate(settings) {
  const version = settings.schemaVersion || 1;
  if (version >= SCHEMA_VERSION) return;
  if (version < 2) {
    // Gym → Workout, íconos de los límites y oficina solo con tareas ligeras.
    const gym = await db.get("tasks", "gym");
    if (gym && gym.name === "Gym") {
      const rename = (v, from, to) => (v && v.label === from ? { ...v, label: to } : v);
      gym.name = "Workout";
      gym.versions = {
        full: rename(gym.versions.full, "Gym session", "Workout"),
        high: rename(gym.versions.high, "Light session", "Light workout"),
        half: rename(gym.versions.half, "Gym session", "Workout"),
        min: gym.versions.min,
      };
      await db.put("tasks", gym);
    }
    for (const [id, iconName] of [["wine", "wine"], ["outings", "moon-star"]]) {
      const t = await db.get("tasks", id);
      if (t?.limit && !t.limit.icon) await db.put("tasks", { ...t, limit: { ...t.limit, icon: iconName } });
    }
    settings.dayCapacity = { ...settings.dayCapacity, office: Math.min(settings.dayCapacity?.office ?? 1, 1) };
  }
  if (version < 3) {
    // Desde cuándo usas la app: lo pendiente nunca se arrastra desde antes.
    const days = await db.getAll("days");
    settings.startedAt ||= days.map((d) => d.date).sort()[0] || todayISO();
  }
  if (version < 4) {
    // Momento del día para las tareas de la plantilla que lo tienen claro (las demás quedan en "Any time").
    // Salud (suplementos, medicamentos) por la mañana; rutina de noche, por la noche.
    const night = ["outfit", "night-routine", "skincare"];
    for (const t of await db.getAll("tasks")) {
      if (t.timeOfDay !== undefined || t.kind !== "habit") continue;
      const timeOfDay = night.includes(t.id) ? "night" : t.categoryId === "health" || t.id === "water" ? "morning" : null;
      if (timeOfDay) await db.put("tasks", { ...t, timeOfDay });
    }
  }
  await db.put("kv", { ...settings, schemaVersion: SCHEMA_VERSION }, "settings");
}

// ---------- Ajustes ----------

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await db.get("kv", "settings")) };
}

export async function saveSettings(settings) {
  await db.put("kv", { ...settings, schemaVersion: SCHEMA_VERSION }, "settings");
}

// ---------- Tareas y categorías ----------

export async function getTasks() {
  return (await db.getAll("tasks")).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export const getTask = (id) => db.get("tasks", id);

export async function saveTask(task) {
  await db.put("tasks", { ...task, id: task.id || newId(), updatedAt: new Date().toISOString() });
}

export async function setTaskStatus(id, status) {
  const task = await getTask(id);
  await saveTask({ ...task, status, archivedAt: status === "archived" ? new Date().toISOString() : null });
}

// Cambia el orden de todas las tareas de una vez (lista de ids en el orden nuevo).
export async function saveOrder(ids) {
  const tasks = await getTasks();
  for (const task of tasks) {
    const order = ids.indexOf(task.id);
    if (order >= 0 && order !== task.order) await db.put("tasks", { ...task, order });
  }
}

// Orden por defecto: por momento del día (respetando el orden dentro de cada momento).
export async function sortByTimeOfDay() {
  const tasks = await getTasks();
  const active = sortTasksByTime(tasks.filter((t) => t.status === "active"));
  await saveOrder([...active, ...tasks.filter((t) => t.status !== "active")].map((t) => t.id));
}

// Al crear una tarea o cambiarle el momento del día, va al final de su bloque.
export async function placeByTimeOfDay(task) {
  await saveOrder(orderWithTask(await getTasks(), task));
}

// Cambio solo para una semana ("Just this week").
export async function saveOverride(taskId, weekStartDate, changes) {
  await db.put("taskOverrides", { id: `${taskId}:${weekStartDate}`, taskId, weekStart: weekStartDate, changes });
}

export const removeOverride = (taskId, weekStartDate) => db.delete("taskOverrides", `${taskId}:${weekStartDate}`);

export async function getOverride(taskId, weekStartDate) {
  return db.get("taskOverrides", `${taskId}:${weekStartDate}`);
}

// Al cambiar una tarea, el reparto de la semana se vuelve a calcular desde hoy.
export async function resetAssignments(weekStartDate) {
  const week = await getWeek(weekStartDate);
  if (!week.assignments) return;
  const { assignments, plannedAt, ...rest } = week;
  await saveWeek(rest);
}

export const getCategories = () => db.getAll("categories");
export const saveCategory = (category) => db.put("categories", { ...category, id: category.id || newId() });
export const deleteCategory = (id) => db.delete("categories", id);

// ---------- Días ----------

export const getDay = async (date) => (await db.get("days", date)) || { date };
export const saveDay = (day) => db.put("days", day);
export const getDays = (from, to) => db.getAll("days").then((all) => all.filter((d) => d.date >= from && d.date <= to));

// ---------- Hechas, "Not today", límites, bonus ----------

export async function toggleCompletion(task, date, version, energy) {
  const existing = (await db.range("completions", "date", date, date)).find((c) => c.taskId === task.id);
  if (existing) return db.delete("completions", existing.id);
  return db.put("completions", {
    id: newId(), taskId: task.id, date, energy, versionLabel: version?.label || task.name,
    doneAt: new Date().toISOString(), points: 0,
  });
}

export async function skipToday(taskId, date, reason = "") {
  await db.put("skips", { id: newId(), taskId, date, reason });
}

export async function unskip(taskId, date) {
  const skip = (await db.range("skips", "date", date, date)).find((s) => s.taskId === taskId && s.kind !== "dismiss");
  if (skip) await db.delete("skips", skip.id);
}

// Un registro por límite y por día: volver a abrir el check-in lo edita en vez de sumar otro.
export async function setLimitEntry(taskId, date, { amount = 0, hours = null } = {}) {
  const id = `${taskId}:${date}`;
  if (!amount) return db.delete("limitEntries", id);
  await db.put("limitEntries", { id, taskId, date, amount, hours, savedAt: new Date().toISOString() });
}
export const getLimitEntries = (from, to) => db.range("limitEntries", "date", from, to);

// ---------- Semana ----------

export const getWeek = async (start) => (await db.get("weeks", start)) || { weekStart: start };
export const saveWeek = (week) => db.put("weeks", week);

// Todo lo que necesita el planificador para una fecha.
export async function loadContext(date) {
  const start = weekStart(date);
  const end = addDays(start, 6);
  // Hechas desde 3 semanas atrás: sirven para medicamentos pendientes y separaciones.
  const [settings, tasks, overrides, completions, skips, events, plans, week, days, limitEntries] = await Promise.all([
    getSettings(),
    getTasks(),
    db.getAll("taskOverrides"),
    // 60 días atrás: lo pendiente de fecha fija se arrastra hasta que lo hagas o lo sueltes.
    db.range("completions", "date", addDays(start, -60), end),
    db.range("skips", "date", addDays(start, -60), end),
    db.getAll("events"),
    db.range("plans", "date", start, end),
    getWeek(start),
    getDays(addDays(start, -7), end),
    // Los límites pueden empezar en domingo: se cargan desde el domingo anterior.
    db.range("limitEntries", "date", addDays(start, -1), end),
  ]);
  const dayLogs = Object.fromEntries(days.map((d) => [d.date, d]));
  return { settings, tasks, overrides, completions, skips, events, plans, week, weekStart: start, dayLogs, limitEntries };
}

// Reparto de la semana: si todavía no hay, se calcula y se guarda.
export async function ensureAssignments(date, energy, ctx) {
  if (ctx.week.assignments) return ctx.week.assignments;
  const from = date > ctx.weekStart ? date : ctx.weekStart;
  const { assignments } = planWeek(ctx.weekStart, from, ctx.week.energyCap || energy || "full", ctx);
  ctx.week = { ...ctx.week, assignments, plannedAt: new Date().toISOString() };
  await saveWeek(ctx.week);
  return assignments;
}

// Días de oficina y gym de una semana, listos para editar (los del plan o los de siempre).
export function weekDays(ctx) {
  return {
    officeDays: officeDates(ctx.weekStart, ctx.settings, ctx.week),
    gymDays: gymDates(ctx.weekStart, ctx.settings, ctx.week),
  };
}

// Calcula un reparto nuevo desde "from" con la semana propuesta, y qué cambia respecto al actual.
export function proposeWeek(ctx, from, weekDraft, energy) {
  const week = { ...ctx.week, ...weekDraft };
  const cap = week.proposal === "accepted" ? week.energyCap : null;
  const { assignments, unplaced, overloaded } = planWeek(ctx.weekStart, from, cap || energy || "full", { ...ctx, week });
  // Lo que ya pasó se queda como estaba.
  const kept = {};
  for (const [id, dates] of Object.entries(ctx.week.assignments || {})) {
    const past = dates.filter((d) => d < from);
    if (past.length) kept[id] = past;
  }
  for (const [id, dates] of Object.entries(assignments)) kept[id] = [...(kept[id] || []), ...dates].sort();
  return { week: { ...week, assignments: kept }, changes: diffAssignments(ctx.week.assignments || {}, kept, from), unplaced, overloaded };
}

export async function acceptWeek(week) {
  await saveWeek({ ...week, plannedAt: week.plannedAt || new Date().toISOString() });
}

// "Let it go": la sueltas a propósito. "from" es el día en que tocaba.
export async function dismissTask(taskId, date, from) {
  await db.put("skips", { id: newId(), taskId, date, from, kind: "dismiss" });
}

/**
 * Mover una tarea a otro día a mano. Queda fija: el planificador ya no la mueve.
 * fromDate: el día en que estaba (o desde el que seguía abierta).
 */
export async function moveTask(task, fromDate, toDate) {
  const fromWeek = weekStart(fromDate);
  const toWeek = weekStart(toDate);
  const target = await getWeek(toWeek);
  const natural = (start) => weekDates(start).filter((d) => isDueOn(task, d));
  const current = (week) =>
    week.pinned?.[task.id] || (isFlexible(task) ? week.assignments?.[task.id] || [] : natural(week.weekStart));

  if (fromWeek === toWeek) {
    const dates = [...new Set([...current(target).filter((d) => d !== fromDate), toDate])].sort();
    await saveWeek(withDates(target, task, dates));
    return;
  }
  // A otra semana: en la de origen queda como "movida" y en la de destino se agrega ese día.
  await dismissTask(task.id, toDate, fromDate);
  const dates = [...new Set([...current(target), toDate])].sort();
  const extra = isFlexible(task) ? { ...target.extra, [task.id]: (target.extra?.[task.id] || 0) + 1 } : target.extra;
  await saveWeek({ ...withDates(target, task, dates), extra });
}

function withDates(week, task, dates) {
  const pinned = { ...week.pinned, [task.id]: dates };
  const assignments = isFlexible(task) && week.assignments ? { ...week.assignments, [task.id]: dates } : week.assignments;
  return { ...week, pinned, ...(assignments ? { assignments } : {}) };
}

// ---------- Planes (comidas y cenas fuera, salidas) ----------

export const savePlan = (plan) => db.put("plans", { ...plan, id: plan.id || newId() });
export const deletePlan = (id) => db.delete("plans", id);

// ---------- Citas ----------

export const saveEvent = (event) => db.put("events", { ...event, id: event.id || newId() });
export const deleteEvent = (id) => db.delete("events", id);

// ---------- Respaldo ----------

export async function exportAll() {
  const { STORES } = await import("./db.js");
  const data = {};
  for (const store of STORES) {
    data[store] = store === "kv" ? { settings: await db.get("kv", "settings") } : await db.getAll(store);
  }
  return { app: "pace", schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data };
}
