// Fechas como texto "YYYY-MM-DD" en hora local.
// Así un día nunca "cambia" por la zona horaria. La semana empieza en lunes.
// Días de la semana: 1 = lunes … 7 = domingo.

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const pad = (n) => String(n).padStart(2, "0");

export function toISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12); // mediodía: evita saltos por cambio de horario
}

export function todayISO(now = new Date()) {
  return toISO(now);
}

export function addDays(iso, days) {
  const date = fromISO(iso);
  date.setDate(date.getDate() + days);
  return toISO(date);
}

// Diferencia en días entre dos fechas (b - a).
export function diffDays(a, b) {
  return Math.round((fromISO(b) - fromISO(a)) / 86400000);
}

export function weekday(iso) {
  return ((fromISO(iso).getDay() + 6) % 7) + 1;
}

export function dayOfMonth(iso) {
  return Number(iso.slice(8, 10));
}

// Lunes de la semana de esa fecha.
export function weekStart(iso) {
  return addDays(iso, 1 - weekday(iso));
}

// Primer día de una ventana semanal que empieza en otro día (por ejemplo domingo = 7).
export function windowStart(iso, startsOn = 1) {
  return addDays(iso, -((weekday(iso) - startsOn + 7) % 7));
}

export function weekDates(start) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function isBetween(iso, from, to) {
  return (!from || iso >= from) && (!to || iso <= to);
}

// "HH:mm" → minutos desde medianoche.
export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function nowMinutes(now = new Date()) {
  return now.getHours() * 60 + now.getMinutes();
}

// ---------- Para mostrar en pantalla ----------
// Por dentro se guarda "2026-10-14"; en pantalla se ve "Oct 14".

export function formatDate(iso, style = "short") {
  const options = {
    short: { month: "short", day: "numeric" }, // Oct 14
    day: { weekday: "short", month: "short", day: "numeric" }, // Wed, Oct 14
    long: { weekday: "long", month: "long", day: "numeric" }, // Wednesday, October 14
  }[style];
  return fromISO(iso).toLocaleDateString("en-US", options);
}

// 1080 → "6 pm", 1110 → "6:30 pm"
export function formatTime(minutesOrHHmm) {
  const total = typeof minutesOrHHmm === "string" ? toMinutes(minutesOrHHmm) : minutesOrHHmm;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`;
}
