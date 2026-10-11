// Energía: qué versión de cada tarea toca y cuándo proponer bajar la semana.

import { weekDates } from "./dates.js";

export const ENERGY_LEVELS = ["full", "high", "half", "min"];

// Tarea con los cambios "Just this week" aplicados (si hay para esa semana).
export function effectiveTask(task, overrides = [], weekStartDate) {
  const override = overrides.find((o) => o.taskId === task.id && o.weekStart === weekStartDate);
  if (!override) return task;
  const { versions, constraints, frequency, ...rest } = override.changes;
  return {
    ...task,
    ...rest,
    frequency: frequency ? { ...task.frequency, ...frequency } : task.frequency,
    constraints: constraints ? { ...task.constraints, ...constraints } : task.constraints,
    versions: versions ? { ...task.versions, ...versions } : task.versions,
  };
}

// Versión de la tarea para ese nivel de energía. null = no aparece ese día.
export function versionFor(task, energy) {
  return task.versions?.[energy] ?? null;
}

// Cuántas veces por semana toca con ese nivel de energía.
export function weeklyTarget(task, energy) {
  const version = versionFor(task, energy);
  if (!version) return 0;
  return version.weeklyTarget ?? task.frequency.times ?? 1;
}

// Días bajos registrados en la semana.
export function lowDaysCount(start, days, settings) {
  const dates = new Set(weekDates(start));
  return days.filter((d) => dates.has(d.date) && !d.restDay && settings.energy.lowLevels.includes(d.energy)).length;
}

// ¿Proponer bajar el resto de la semana al 50%?
// Solo si hay suficientes días bajos, quedan días por delante y no respondiste ya.
export function shouldProposeLighten(today, start, days, week, settings) {
  if (week?.proposal) return false;
  const remaining = weekDates(start).filter((d) => d > today).length;
  return remaining > 0 && lowDaysCount(start, days, settings) >= settings.energy.lowDaysThreshold;
}

// Energía preseleccionada en el check-in: la del tope semanal si lo aceptaste.
export function suggestedEnergy(week) {
  return week?.proposal === "accepted" && week.energyCap ? week.energyCap : null;
}
