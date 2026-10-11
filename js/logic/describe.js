// Textos cortos para describir una tarea: "Every day", "2× a week", "Sun", "1st and 16th".

import { WEEKDAYS, formatDate, todayISO } from "./dates.js";

const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const list = (items) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

export function describeFrequency(task) {
  if (task.kind === "limit") {
    const l = task.limit;
    return `Max ${l.weeklyMax} ${l.unit} a week`;
  }
  if (task.kind === "bonus") return task.bonus?.scope === "week" ? "Weekly challenge" : "Daily challenge";

  const f = task.frequency;
  switch (f.type) {
    case "daily":
      return "Every day";
    case "weekly":
      return f.times === 1 ? "Once a week" : `${f.times}× a week`;
    case "everyNDays":
      return f.n === 7 ? "Every week" : f.n === 14 ? "Every 2 weeks" : `Every ${f.n} days`;
    case "weekdays":
      return f.days.length === 7 ? "Every day" : list([...f.days].sort().map((d) => WEEKDAYS[d - 1]));
    case "monthDays": {
      const today = todayISO();
      const phase = f.phases.find((p) => (!p.from || p.from <= today) && (!p.to || p.to >= today)) || f.phases[0];
      const days = list(phase.days.map(ordinal));
      return phase.to ? `${days} of the month, until ${formatDate(phase.to)}` : `${days} of the month`;
    }
    default:
      return "";
  }
}

export { ordinal };
