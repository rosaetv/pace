// ¿Toca una tarea de fecha fija en ese día?
// (Las tareas "X veces por semana" las reparte el planificador semanal.)

import { weekday, dayOfMonth, diffDays, isBetween, addDays } from "./dates.js";

export function isFlexible(task) {
  return task.frequency.type === "weekly";
}

export function isDueOn(task, date) {
  const f = task.frequency;
  switch (f.type) {
    case "daily":
      return true;
    case "weekdays":
      return f.days.includes(weekday(date));
    case "everyNDays": {
      const diff = diffDays(f.anchor, date);
      return diff >= 0 && diff % f.n === 0;
    }
    case "monthDays":
      return f.phases.some((p) => isBetween(date, p.from, p.to) && p.days.includes(dayOfMonth(date)));
    default:
      return false;
  }
}

// Última fecha en que tocó, mirando hacia atrás hasta "maxDays" días (sin contar hoy).
// "dueFn" permite usar otra regla (por ejemplo, si la moviste a mano esa semana).
export function lastDueBefore(task, date, maxDays, dueFn = (d) => isDueOn(task, d)) {
  for (let i = 1; i <= maxDays; i++) {
    const d = addDays(date, -i);
    if (dueFn(d)) return d;
  }
  return null;
}
