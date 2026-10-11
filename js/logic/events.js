// Citas (por ejemplo, una clase todos los martes a las 18:00).
// Una cita recurrente puede cancelarse o moverse solo una vez con "exceptions":
//   "2026-10-20": { cancelled: true }
//   "2026-10-27": { date: "2026-10-28", start: "17:00" }

import { weekday, isBetween } from "./dates.js";

function occursOn(event, date) {
  const r = event.recurrence;
  if (!isBetween(date, event.from, event.until)) return false;
  if (!r) return event.date === date;
  if (r.type === "weekly") return weekday(date) === r.weekday;
  return false;
}

export function eventsOn(date, events = []) {
  const list = [];
  for (const event of events) {
    if (occursOn(event, date)) {
      const ex = event.exceptions?.[date];
      if (!ex) list.push({ ...event, date });
      else if (!ex.cancelled && (!ex.date || ex.date === date)) list.push({ ...event, date, start: ex.start || event.start });
    }
    // Ocurrencias movidas a este día desde otro.
    for (const [original, ex] of Object.entries(event.exceptions || {})) {
      if (ex.date === date && original !== date && !ex.cancelled) {
        list.push({ ...event, date, start: ex.start || event.start, movedFrom: original });
      }
    }
  }
  return list.sort((a, b) => a.start.localeCompare(b.start));
}
