// Qué tipo de día es una fecha: oficina o casa, gym, fin de semana,
// jornada normal o intensiva, y sus bloques protegidos.

import { weekday, weekStart, weekDates, diffDays, toMinutes } from "./dates.js";

// ¿Toca oficina obligatoria según la regla (jueves alternos)?
export function isRequiredOfficeDay(date, settings) {
  const rule = settings.office.required;
  if (!rule || weekday(date) !== rule.weekday) return false;
  const weeks = diffDays(rule.anchor, date) / 7;
  return Number.isInteger(weeks) && ((weeks % rule.everyWeeks) + rule.everyWeeks) % rule.everyWeeks === 0;
}

// Días de oficina de una semana: los del plan semanal si existe, si no los obligatorios.
export function officeDates(start, settings, week) {
  if (week?.officeDays) return week.officeDays;
  return weekDates(start).filter((d) => isRequiredOfficeDay(d, settings));
}

export function gymDates(start, settings, week) {
  if (week?.gymDays) return week.gymDays;
  return weekDates(start).filter((d) => settings.gym.days.includes(weekday(d)));
}

export function isIntensive(date, settings) {
  if (!settings.work.intensiveFrom || !settings.work.intensiveTo) return false;
  const md = date.slice(5);
  return md >= settings.work.intensiveFrom && md <= settings.work.intensiveTo;
}

// dayLog: lo que marcaste ese día en el check-in ("Day off" = no hay oficina ni trabajo).
export function dayInfo(date, settings, week = null, dayLog = null) {
  const start = weekStart(date);
  const wd = weekday(date);
  const dayOff = dayLog?.kind === "off";
  const office = !dayOff && officeDates(start, settings, week).includes(date);
  const gym = gymDates(start, settings, week).includes(date);
  const intensive = isIntensive(date, settings);
  const hours = dayOff ? null : (intensive ? settings.work.intensive : settings.work.normal)[wd] || null;

  const tags = new Set();
  tags.add(wd >= 6 ? "weekend" : office ? "office" : "home");
  if (office) tags.add("office");
  if (gym) tags.add("gym");

  return {
    date,
    weekday: wd,
    tags,
    office,
    dayOff,
    gym,
    intensive,
    workHours: hours,
    protectedBlocks: settings.protectedBlocks
      .filter((b) => b.weekday === wd)
      .map((b) => ({ from: toMinutes(b.from), to: toMinutes(b.to) })),
  };
}

// Capacidad del día para tareas flexibles.
export function dayCapacity(info, settings) {
  const c = settings.dayCapacity;
  if (info.weekday === 6) return c.saturday;
  if (info.weekday === 7) return c.sunday;
  return info.office ? c.office : c.home;
}

// ¿Esa hora (en minutos) cae en un bloque protegido? Devuelve el bloque o null.
export function protectedBlockAt(info, minutes) {
  return info.protectedBlocks.find((b) => minutes >= b.from && minutes < b.to) || null;
}
