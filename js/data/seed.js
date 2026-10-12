// Plantilla inicial neutra: lo que ves la primera vez que abres Pace.
// Se carga una sola vez; después todo se edita desde la app.
// (Una rutina personal se carga con Settings → Backup → Restore from a backup.)

export const SCHEMA_VERSION = 4;

export const DEFAULT_SETTINGS = {
  schemaVersion: SCHEMA_VERSION,
  profile: { name: "", avatar: "🙂", birthDate: null },

  // Jornada. La de verano se activa sola entre esas fechas (MM-DD) cada año; null = no hay.
  work: {
    normal: {
      1: ["09:00", "17:00"], 2: ["09:00", "17:00"], 3: ["09:00", "17:00"], 4: ["09:00", "17:00"], 5: ["09:00", "17:00"],
    },
    intensive: {
      1: ["08:00", "15:00"], 2: ["08:00", "15:00"], 3: ["08:00", "15:00"], 4: ["08:00", "15:00"], 5: ["08:00", "15:00"],
    },
    intensiveFrom: null,
    intensiveTo: null,
  },

  // Oficina: ninguna obligatoria por defecto. Las opcionales solo cuentan si las marcas esa semana.
  office: { required: null, optional: [] },

  gym: { days: [2, 5], minRestDays: 2 },

  // Tiempo protegido: sin tareas, salvo las que se lo saltan o si tocas "Show anyway".
  protectedBlocks: [
    { weekday: 6, from: "14:00", to: "24:00" },
    { weekday: 7, from: "10:00", to: "17:00" },
  ],

  energy: { lowLevels: ["half", "min"], lowDaysThreshold: 3 },

  // Capacidad de cada tipo de día para tareas flexibles (suma de esfuerzos 1–3).
  dayCapacity: { home: 4, office: 1, saturday: 3, sunday: 3 }, // oficina: solo cosas ligeras

  eveningCheckIn: "21:30",
  weeklyPlan: { weekday: 7, from: "18:00" },
  backupReminderDays: 30,
  startedAt: null, // primer día de uso (lo pendiente nunca se arrastra desde antes)
  lastBackupAt: null,
};

export const CATEGORIES = [
  { id: "self-care", name: "Self-care", tint: "lilac" },
  { id: "health", name: "Health", tint: "coral" },
  { id: "home", name: "Home", tint: "sky" },
  { id: "food", name: "Food", tint: "butter" },
  { id: "social", name: "Social", tint: "rose" },
  { id: "movement", name: "Movement", tint: "mint" },
];

// Atajo para versiones iguales en los cuatro niveles.
const same = (label, extra = {}) => {
  const v = { label, ...extra };
  return { full: v, high: v, half: v, min: v };
};

const task = (fields) => ({
  kind: "habit",
  frequency: { type: "daily" },
  constraints: {},
  effort: 1,
  streak: { type: "none" },
  points: 0,
  status: "active",
  ...fields,
});

// En este orden aparecen en Today (de la mañana a la noche). Se puede cambiar desde la app.
export const TASKS = [
  task({ id: "water", timeOfDay: "morning", name: "Glass of water", emoji: "💧", categoryId: "health", versions: same("Glass of water", { note: "First thing in the morning" }) }),
  task({ id: "shower", name: "Shower", emoji: "🚿", categoryId: "self-care", versions: same("Shower"), streak: { type: "weekly", target: 6 } }),
  task({
    id: "gym", name: "Workout", emoji: "🏋️", categoryId: "movement",
    frequency: { type: "weekly", times: 2 },
    constraints: { gymDay: true, minRestDays: 2 },
    effort: 3,
    versions: {
      full: { label: "Workout" },
      high: { label: "Light workout" },
      half: { label: "Workout", weeklyTarget: 1, note: "Plus one walk this week" },
      min: { label: "Walk 15 min" },
    },
    streak: { type: "weekly", target: 2 },
  }),
  task({
    id: "walk", name: "Walk", emoji: "🚶", categoryId: "movement",
    constraints: { notTags: ["gym"] },
    suggested: true,
    versions: { full: { label: "Walk" }, high: { label: "Walk" }, half: { label: "Walk" }, min: null },
  }),
  task({
    id: "laundry", name: "Laundry", emoji: "🧺", categoryId: "home",
    frequency: { type: "weekly", times: 2 },
    constraints: { notTags: ["office"], minRestDays: 1 },
    effort: 2,
    versions: { full: { label: "Laundry" }, high: { label: "Laundry" }, half: { label: "Laundry", weeklyTarget: 1 }, min: null },
  }),
  task({
    id: "bathroom", name: "Clean bathroom", emoji: "🛁", categoryId: "home",
    frequency: { type: "weekly", times: 1 },
    constraints: { choiceGroup: "cleaning" },
    effort: 2,
    versions: { full: { label: "Clean bathroom" }, high: { label: "Clean bathroom" }, half: { label: "Clean bathroom", note: "Or the room, just one" }, min: null },
  }),
  task({
    id: "room", name: "Clean room", emoji: "🧹", categoryId: "home",
    frequency: { type: "weekly", times: 1 },
    constraints: { choiceGroup: "cleaning" },
    effort: 2,
    versions: { full: { label: "Clean room" }, high: { label: "Clean room" }, half: { label: "Clean room", note: "Or the bathroom, just one" }, min: null },
  }),
  task({
    id: "meal-prep", name: "Meal prep", emoji: "🥗", categoryId: "food",
    frequency: { type: "weekdays", days: [7] },
    constraints: { earlyFrom: 5 }, // se puede adelantar desde el viernes
    effort: 3,
    versions: {
      full: { label: "Meal prep" },
      high: { label: "Meal prep", durationMin: 90 },
      half: { label: "Simple batch", durationMin: 45 },
      min: { label: "Easy backup meal" },
    },
  }),
  task({
    id: "outfit", timeOfDay: "night", name: "Prep outfit", emoji: "👕", categoryId: "self-care",
    versions: { full: { label: "Prep outfit" }, high: { label: "Prep outfit" }, half: null, min: null },
  }),
  task({
    id: "night-routine", timeOfDay: "night", name: "Night routine", emoji: "🌙", categoryId: "self-care",
    versions: { full: { label: "Night routine" }, high: { label: "Night routine" }, half: { label: "Set alarms" }, min: null },
  }),
  task({ id: "skincare", timeOfDay: "night", name: "Skincare", emoji: "🧴", categoryId: "self-care", versions: same("Skincare"), streak: { type: "weekly", target: 6 } }),

  // ---------- Límites ----------
  task({
    id: "takeout", name: "Takeout", emoji: "🍕", categoryId: "food", kind: "limit",
    versions: same("Takeout"),
    limit: {
      icon: "pizza", unit: "orders", weeklyMax: 2, perOccasionMax: 0, perOccasionUnit: "count",
      windowStartsOn: 1, countOn: [1, 2, 3, 4, 5, 6, 7],
      guidance: ["Meal prep makes this easier"],
    },
  }),

  // ---------- Bonus ----------
  task({ id: "phone-away", name: "Phone away by 10 pm", emoji: "📵", categoryId: "self-care", kind: "bonus", bonus: { scope: "day" }, versions: same("Phone away by 10 pm") }),
  task({ id: "call-friend", name: "Call a friend", emoji: "📞", categoryId: "social", kind: "bonus", bonus: { scope: "week" }, versions: same("Call a friend") }),
];

export const EVENTS = [];
