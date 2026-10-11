// Límites: contador semanal sin penalización.
// Estado: "ok" (neutral) → "at" (amarillo, llegaste) → "over" (rojo, te pasaste).

import { windowStart, addDays, weekday } from "./dates.js";

export function limitWindow(task, date) {
  const start = windowStart(date, task.limit.windowStartsOn ?? 1);
  return { start, end: addDays(start, 6) };
}

export function limitStatus(task, entries, date) {
  const { start, end } = limitWindow(task, date);
  const countOn = task.limit.countOn;
  const inWindow = entries.filter(
    (e) => e.taskId === task.id && e.date >= start && e.date <= end && (!countOn || countOn.includes(weekday(e.date))),
  );
  const used = inWindow.reduce((sum, e) => sum + (e.amount ?? 1), 0);
  const max = task.limit.weeklyMax;
  const state = used > max ? "over" : used === max ? "at" : "ok";

  // Salidas o copas que pasaron el máximo por ocasión (solo informativo).
  const perMax = task.limit.perOccasionMax;
  const overOccasion = perMax
    ? inWindow.filter((e) => (task.limit.perOccasionUnit === "hours" ? (e.hours ?? 0) : (e.amount ?? 1)) > perMax).length
    : 0;

  return { used, max, state, start, end, overOccasion, countsToday: !countOn || countOn.includes(weekday(date)) };
}
