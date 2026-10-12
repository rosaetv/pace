// Momento del día de cada tarea. Sirve para el orden por defecto de Today:
// primero lo de la mañana, luego mediodía, tarde, "Any time" y al final la noche.

export const TIMES_OF_DAY = [
  { id: "morning", label: "Morning", rank: 0 },
  { id: "noon", label: "Noon", rank: 1 },
  { id: "afternoon", label: "Afternoon", rank: 2 },
  { id: null, label: "Any time", rank: 2.5 },
  { id: "night", label: "Night", rank: 3 },
];

export const timeRank = (task) => TIMES_OF_DAY.find((t) => t.id === (task.timeOfDay || null))?.rank ?? 2.5;

// Ordena por momento del día sin cambiar el orden que ya tenían dentro de cada momento.
export function sortTasksByTime(tasks) {
  return [...tasks].sort((a, b) => timeRank(a) - timeRank(b) || (a.order ?? 0) - (b.order ?? 0));
}

// Dónde va una tarea a la que le cambiaste el momento: al final de su bloque.
export function orderWithTask(tasks, task) {
  const others = tasks.filter((t) => t.id !== task.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const rank = timeRank(task);
  const index = others.findIndex((t) => timeRank(t) > rank);
  const ids = others.map((t) => t.id);
  ids.splice(index === -1 ? ids.length : index, 0, task.id);
  return ids;
}
