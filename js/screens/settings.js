// Settings: perfil, trabajo y oficina, workout, tiempo libre, citas, salud,
// categorías, planificación y respaldo. Todo se guarda al momento.

import { esc, icon, openSheet, askSheet, toast, lastGrapheme } from "../ui.js";
import { WEEKDAYS, todayISO, weekStart, formatDate, formatTime, diffDays, addDays } from "../logic/dates.js";
import { exportBackup, readBackup, restoreBackup } from "../backup.js";
import { ENERGY } from "./today.js";
import * as store from "../store.js";
import { APP_NAME, APP_VERSION } from "../version.js";
import { checkForUpdates } from "../pwa.js";

const TINTS = ["lilac", "coral", "sky", "butter", "rose", "mint", "peach"];

// Secciones agrupadas (el perfil va arriba, en su propia tarjeta).
const GROUPS = [
  {
    title: "Your week",
    items: [
      { id: "work", title: "Work and office", icon: "briefcase", tint: "sky" },
      { id: "workout", title: "Workout days", icon: "dumbbell", tint: "mint" },
      { id: "free-time", title: "Free time", icon: "sofa", tint: "peach" },
      { id: "appointments", title: "Appointments", icon: "calendar-clock", tint: "rose" },
    ],
  },
  {
    title: "Care",
    items: [
      { id: "health", title: "Health", icon: "pill", tint: "coral" },
      { id: "planning", title: "Energy and planning", icon: "battery-medium", tint: "sky" },
    ],
  },
  {
    title: "Organize",
    items: [
      { id: "categories", title: "Categories", icon: "tags", tint: "butter" },
      { id: "backup", title: "Backup", icon: "hard-drive-download", tint: "mint" },
    ],
  },
  {
    title: "For the curious",
    items: [{ href: "#/styleguide", title: "Style guide", icon: "palette", tint: "lilac" }],
  },
];

let settings;

async function save(changes, { replan = false } = {}) {
  settings = { ...settings, ...changes };
  await store.saveSettings(settings);
  // Si cambia algo que afecta el reparto, la semana se recalcula desde hoy.
  if (replan) await store.resetAssignments(weekStart(todayISO()));
  toast("Saved");
}

const header = (title) => `
  <header class="topbar">
    <a class="icon-btn" href="#/settings" aria-label="Back">${icon("chevron-left")}</a>
    <span class="topbar-title">${esc(title)}</span>
    <span style="width: 44px"></span>
  </header>`;

const weekdayChips = (name, selected, days = [1, 2, 3, 4, 5, 6, 7]) => `
  <div class="weekdays">
    ${days.map((d) => `<button type="button" data-${name}="${d}" aria-pressed="${selected.includes(d)}" aria-label="${WEEKDAYS[d - 1]}">${WEEKDAYS[d - 1].slice(0, 2)}</button>`).join("")}
  </div>`;

const stepper = (key, label, value, { min = 0, max = 10, hint = "" } = {}) => `
  <div class="toggle-row">
    <div><div>${label}</div>${hint ? `<p class="hint">${hint}</p>` : ""}</div>
    <span class="stepper">
      <button type="button" data-step="${key}" data-delta="-1" data-min="${min}" data-max="${max}" aria-label="Less">−</button>
      <output>${value}</output>
      <button type="button" data-step="${key}" data-delta="1" data-min="${min}" data-max="${max}" aria-label="More">+</button>
    </span>
  </div>`;

// ---------- Lista principal ----------

function renderMain(view) {
  const p = settings.profile;
  view.innerHTML = `
    <p class="eyebrow">Make it yours</p>
    <h1 class="display screen-title">Settings</h1>
    <a class="profile-card" href="#/settings/profile">
      <span class="profile-avatar" aria-hidden="true">${esc(p.avatar || "🙂")}</span>
      <span>
        <span class="display profile-name">${esc(p.name || "Add your name")}</span>
        <span class="profile-edit">Edit profile ${icon("chevron-right")}</span>
      </span>
    </a>
    ${GROUPS.map(
      (g) => `
      <h2 class="settings-group-title">${g.title}</h2>
      <ul class="settings-group">
        ${g.items
          .map(
            (item) => `
          <li><a class="settings-item" href="${item.href || `#/settings/${item.id}`}">
            <span class="settings-icon tint-${item.tint}">${icon(item.icon)}</span>
            <span class="settings-item-title">${item.title}</span>
            ${icon("chevron-right", "icon settings-chevron")}
          </a></li>`,
          )
          .join("")}
      </ul>`,
    ).join("")}
    <p class="app-version">${APP_NAME} · v${APP_VERSION}</p>
    <button class="btn btn-ghost btn-block check-updates" data-action="check-updates">${icon("refresh-cw")} Check for updates</button>`;

  view.onclick = async (event) => {
    if (!event.target.closest("[data-action=check-updates]")) return;
    const result = await checkForUpdates();
    toast({ updating: "New version found. Tap Update below.", latest: "You have the latest version", offline: "Can't check right now" }[result]);
  };
}

// ---------- Profile ----------

function renderProfile(view) {
  const p = settings.profile;
  view.innerHTML = `
    ${header("Profile")}
    <div class="field-row">
      <div class="field" style="flex: 0 0 auto">
        <label for="f-avatar">Avatar</label>
        <input id="f-avatar" class="input input-emoji" data-profile="avatar" value="${esc(p.avatar || "")}" />
      </div>
      <div class="field">
        <label for="f-name">Name</label>
        <input id="f-name" class="input" data-profile="name" value="${esc(p.name || "")}" autocomplete="given-name" />
      </div>
    </div>
    <div class="field">
      <label for="f-birth">Birthday</label>
      <input id="f-birth" class="input" type="date" data-profile="birthDate" value="${p.birthDate || ""}" />
      <p class="hint">Just for a little hello on your day.</p>
    </div>`;

  view.onchange = async (event) => {
    const key = event.target.dataset.profile;
    if (!key) return;
    let value = event.target.value.trim();
    if (key === "avatar") value = lastGrapheme(value) || "🙂";
    await save({ profile: { ...settings.profile, [key]: value || null } });
  };
}

// ---------- Work and office ----------

function hoursRows(kind) {
  const hours = settings.work[kind];
  return [1, 2, 3, 4, 5]
    .map((d) => {
      const h = hours[d];
      return `
      <div class="hours-row ${h ? "" : "is-off"}">
        <span class="small" style="font-weight: 600">${WEEKDAYS[d - 1]}</span>
        <select class="select" data-hours="${kind}" data-day="${d}" data-end="0" aria-label="${WEEKDAYS[d - 1]} start">${timeOptions(h?.[0], { empty: "Off" })}</select>
        <select class="select" data-hours="${kind}" data-day="${d}" data-end="1" aria-label="${WEEKDAYS[d - 1]} end">${timeOptions(h?.[1], { empty: "Off" })}</select>
      </div>`;
    })
    .join("");
}

// "07-15" ↔ fecha de este año para el selector.
const mdToDate = (md) => (md ? `${todayISO().slice(0, 4)}-${md}` : "");

function renderWork(view) {
  const w = settings.work;
  const o = settings.office;
  view.innerHTML = `
    ${header("Work and office")}
    <section class="form-section">
      <h2 class="display">Usual hours</h2>
      <p class="hint" style="margin: -4px 0 12px">Choose "Off" for days you don't work.</p>
      ${hoursRows("normal")}
    </section>
    <section class="form-section">
      <h2 class="display">Summer hours</h2>
      <div class="field-row">
        <div class="field"><label for="f-int-from">From</label><input id="f-int-from" class="input" type="date" data-intensive="intensiveFrom" value="${mdToDate(w.intensiveFrom)}" /></div>
        <div class="field"><label for="f-int-to">Until</label><input id="f-int-to" class="input" type="date" data-intensive="intensiveTo" value="${mdToDate(w.intensiveTo)}" /></div>
      </div>
      <p class="hint" style="margin: -8px 0 12px">Switches on by itself every year between these dates. Leave them empty if you don't have one.</p>
      ${hoursRows("intensive")}
    </section>
    <section class="form-section">
      <h2 class="display">Office</h2>
      <div class="field">
        <span class="field-label">Required office day</span>
        ${weekdayChips("required", o.required ? [o.required.weekday] : [], [1, 2, 3, 4, 5])}
        <p class="hint">Tap it again to have none.</p>
      </div>
      ${o.required ? `
      <div class="field">
        <span class="field-label">How often</span>
        <div class="segmented" role="group">
          ${[[1, "Every week"], [2, "Every 2 weeks"], [3, "Every 3 weeks"]]
            .map(([n, l]) => `<button type="button" data-every="${n}" aria-pressed="${o.required.everyWeeks === n}">${l}</button>`)
            .join("")}
        </div>
      </div>` : ""}
      ${
        o.required?.everyWeeks > 1
          ? `<div class="field">
              <label for="f-anchor">One of those days</label>
              <input id="f-anchor" class="input" type="date" data-anchor value="${o.required.anchor}" />
              <p class="hint">Any date you have to go, so the app knows which weeks.</p>
            </div>`
          : ""
      }
      <div class="field">
        <span class="field-label">Optional office days</span>
        ${weekdayChips("optional", o.optional || [], [1, 2, 3, 4, 5])}
        <p class="hint">Only count if you mark them in your weekly plan or morning check-in.</p>
      </div>
    </section>`;

  view.onchange = async (event) => {
    const el = event.target;
    if (el.dataset.hours) {
      const kind = el.dataset.hours;
      const day = Number(el.dataset.day);
      const hours = { ...settings.work[kind] };
      if (!el.value) {
        delete hours[day]; // "Off" en cualquiera de las dos: ese día no se trabaja
      } else {
        // Si el día estaba libre, la otra hora se completa con una por defecto.
        const next = [...(hours[day] || ["09:00", "18:00"])];
        next[Number(el.dataset.end)] = el.value;
        hours[day] = next;
      }
      await save({ work: { ...settings.work, [kind]: hours } });
      renderWork(view);
    }
    if (el.dataset.intensive) {
      await save({ work: { ...settings.work, [el.dataset.intensive]: el.value ? el.value.slice(5) : null } });
    }
    if (el.dataset.anchor !== undefined && el.value) {
      await save({ office: { ...settings.office, required: { ...settings.office.required, anchor: el.value } } }, { replan: true });
    }
  };

  view.onclick = async (event) => {
    const req = event.target.closest("[data-required]");
    if (req) {
      const weekday = Number(req.dataset.required);
      const current = settings.office.required;
      // Tocar el día elegido lo quita; otro día lo cambia (la primera vez, cada semana desde hoy).
      const required =
        current?.weekday === weekday ? null : { everyWeeks: 1, anchor: todayISO(), ...current, weekday };
      await save({ office: { ...settings.office, required } }, { replan: true });
      return renderWork(view);
    }
    const every = event.target.closest("[data-every]");
    if (every) {
      await save({ office: { ...settings.office, required: { ...settings.office.required, everyWeeks: Number(every.dataset.every) } } }, { replan: true });
      return renderWork(view);
    }
    const opt = event.target.closest("[data-optional]");
    if (opt) {
      const d = Number(opt.dataset.optional);
      const set = new Set(settings.office.optional || []);
      set.has(d) ? set.delete(d) : set.add(d);
      await save({ office: { ...settings.office, optional: [...set].sort() } });
      return renderWork(view);
    }
  };
}

// ---------- Workout days ----------

function renderWorkout(view) {
  view.innerHTML = `
    ${header("Workout days")}
    <div class="field">
      <span class="field-label">Your usual days</span>
      ${weekdayChips("gym", settings.gym.days)}
      <p class="hint">You can change them any week in your weekly plan. Rest days between workouts are set in the <a href="#/task/gym">Workout task</a>.</p>
    </div>`;
  view.onclick = async (event) => {
    const day = event.target.closest("[data-gym]");
    if (!day) return;
    const d = Number(day.dataset.gym);
    const set = new Set(settings.gym.days);
    set.has(d) ? set.delete(d) : set.add(d);
    await save({ gym: { ...settings.gym, days: [...set].sort() } }, { replan: true });
    renderWorkout(view);
  };
}

// ---------- Free time ----------

// Horas cada 30 minutos para elegir en una lista (caben mejor que el reloj en el iPhone).
function timeOptions(selected, { endOfDay = false, empty = "" } = {}) {
  const options = empty ? [`<option value="" ${!selected ? "selected" : ""}>${empty}</option>`] : [];
  for (let m = 0; m < 24 * 60; m += 30) {
    const value = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    options.push(`<option value="${value}" ${value === selected ? "selected" : ""}>${formatTime(value)}</option>`);
  }
  if (endOfDay) options.push(`<option value="24:00" ${selected === "24:00" ? "selected" : ""}>Midnight</option>`);
  // Si la hora guardada no está en la lista (por ejemplo 19:15), se agrega.
  if (selected && !options.some((o) => o.includes(`value="${selected}"`))) {
    options.unshift(`<option value="${selected}" selected>${formatTime(selected)}</option>`);
  }
  return options.join("");
}

function renderFreeTime(view) {
  const blocks = settings.protectedBlocks;
  view.innerHTML = `
    ${header("Free time")}
    <p class="muted" style="margin: 0 0 16px">No tasks show during these blocks. You can still tap "Show anyway" if you feel like it.</p>
    <div class="block-row small muted" style="margin-bottom: 4px"><span>Day</span><span>From</span><span>Until</span><span></span></div>
    ${blocks
      .map(
        (b, i) => `
      <div class="block-row">
        <select class="select" data-block="${i}" data-field="weekday" aria-label="Day">
          ${WEEKDAYS.map((d, j) => `<option value="${j + 1}" ${b.weekday === j + 1 ? "selected" : ""}>${d}</option>`).join("")}
        </select>
        <select class="select" data-block="${i}" data-field="from" aria-label="From">${timeOptions(b.from)}</select>
        <select class="select" data-block="${i}" data-field="to" aria-label="Until">${timeOptions(b.to, { endOfDay: true })}</select>
        <button class="icon-btn" data-remove-block="${i}" aria-label="Remove block">${icon("x")}</button>
      </div>`,
      )
      .join("")}
    <div style="height: 12px"></div>
    <button class="btn btn-secondary btn-block" data-action="add-block">${icon("plus")} Add a block</button>`;

  view.onchange = async (event) => {
    const el = event.target;
    if (el.dataset.block === undefined) return;
    const list = settings.protectedBlocks.map((b) => ({ ...b }));
    const b = list[Number(el.dataset.block)];
    if (el.dataset.field === "weekday") b.weekday = Number(el.value);
    if (el.dataset.field === "from") b.from = el.value;
    if (el.dataset.field === "to") b.to = el.value;
    await save({ protectedBlocks: list }, { replan: true });
  };
  view.onclick = async (event) => {
    const remove = event.target.closest("[data-remove-block]");
    if (remove) {
      const list = settings.protectedBlocks.filter((_, i) => i !== Number(remove.dataset.removeBlock));
      await save({ protectedBlocks: list }, { replan: true });
      return renderFreeTime(view);
    }
    if (event.target.closest("[data-action=add-block]")) {
      await save({ protectedBlocks: [...settings.protectedBlocks, { weekday: 6, from: "12:00", to: "24:00" }] }, { replan: true });
      renderFreeTime(view);
    }
  };
}

// ---------- Appointments ----------

async function renderAppointments(view) {
  const events = (await store.loadContext(todayISO())).events;
  const today = todayISO();
  const recurring = events.filter((e) => e.recurrence && (!e.until || e.until >= today));
  const upcoming = events.filter((e) => !e.recurrence && e.date >= today).sort((a, b) => a.date.localeCompare(b.date));

  const row = (e) => `
    <li><button class="settings-row" style="width: 100%; border: 0; text-align: left" data-edit-event="${e.id}">
      <span class="task-emoji tint-rose">${e.emoji || "📅"}</span>
      <span class="task-text">
        <span class="task-name" style="display: block">${esc(e.title)}</span>
        <span class="task-detail" style="display: block">${
          e.recurrence ? `Every ${WEEKDAYS[e.recurrence.weekday - 1]} · ${formatTime(e.start)}` : `${formatDate(e.date, "day")} · ${formatTime(e.start)}`
        }</span>
      </span>
      ${icon("chevron-right")}
    </button></li>`;

  view.innerHTML = `
    ${header("Appointments")}
    <h2 class="group-title">Recurring</h2>
    ${recurring.length ? `<ul class="settings-list">${recurring.map(row).join("")}</ul>` : `<p class="muted">None yet.</p>`}
    ${upcoming.length ? `<h2 class="group-title">Coming up</h2><ul class="settings-list">${upcoming.map(row).join("")}</ul>` : ""}
    <p class="hint" style="margin: 12px 0">To move or skip just one, use your weekly plan.</p>
    <button class="btn btn-secondary btn-block" data-action="new-event">${icon("plus")} Add an appointment</button>`;

  view.onclick = (event) => {
    const edit = event.target.closest("[data-edit-event]");
    if (edit) return appointmentSheet(view, events.find((e) => e.id === edit.dataset.editEvent));
    if (event.target.closest("[data-action=new-event]")) {
      appointmentSheet(view, { title: "", emoji: "📅", recurrence: { type: "weekly", weekday: 1 }, start: "18:00", durationMin: 60, from: today, exceptions: {} });
    }
  };
}

function appointmentSheet(view, ev) {
  const draft = structuredClone(ev);
  const isNew = !ev.id;
  const body = () => `
    <h2 class="display sheet-title">${isNew ? "New appointment" : esc(ev.title)}</h2>
    <div class="field-row" style="margin-top: 16px">
      <div class="field" style="flex: 0 0 auto"><label for="f-ev-emoji">Emoji</label><input id="f-ev-emoji" class="input input-emoji" data-ev="emoji" value="${esc(draft.emoji || "📅")}" /></div>
      <div class="field"><label for="f-ev-title">Name</label><input id="f-ev-title" class="input" data-ev="title" value="${esc(draft.title)}" placeholder="Dentist" /></div>
    </div>
    <p class="small error" id="ev-error" hidden>Give it a name.</p>
    <div class="field">
      <div class="segmented" role="group">
        <button type="button" data-repeat="weekly" aria-pressed="${Boolean(draft.recurrence)}">Every week</button>
        <button type="button" data-repeat="once" aria-pressed="${!draft.recurrence}">Just once</button>
      </div>
    </div>
    ${
      draft.recurrence
        ? `<div class="field"><span class="field-label">Day</span>${weekdayChips("evday", [draft.recurrence.weekday])}</div>`
        : `<div class="field"><label for="f-ev-date">Date</label><input id="f-ev-date" class="input" type="date" data-ev="date" value="${draft.date || todayISO()}" /></div>`
    }
    <div class="field-row">
      <div class="field"><label for="f-ev-start">Time</label><select id="f-ev-start" class="select" data-ev="start">${timeOptions(draft.start)}</select></div>
      <div class="field"><label for="f-ev-dur">Minutes</label><input id="f-ev-dur" class="input" type="number" inputmode="numeric" data-ev="durationMin" value="${draft.durationMin || 60}" /></div>
    </div>
    ${
      draft.recurrence
        ? `<div class="field"><label for="f-ev-until">Until</label><input id="f-ev-until" class="input" type="date" data-ev="until" value="${draft.until || ""}" /><p class="hint">Optional. Leave empty if it keeps going.</p></div>`
        : ""
    }
    <div class="stack" style="margin-top: 8px">
      <button class="btn btn-primary btn-block" data-ev-action="save">${isNew ? "Add appointment" : "Save"}</button>
      ${isNew ? "" : `<button class="btn btn-ghost btn-block" data-ev-action="delete">Remove appointment</button>`}
    </div>`;

  const { sheet, close } = openSheet(`<div id="ev-body">${body()}</div>`, { label: "Appointment" });
  const container = sheet.querySelector("#ev-body");
  const readInputs = () => {
    sheet.querySelectorAll("[data-ev]").forEach((el) => {
      const key = el.dataset.ev;
      draft[key] = key === "durationMin" ? Number(el.value) || 60 : el.value || (key === "until" ? null : draft[key]);
    });
  };

  sheet.addEventListener("click", async (event) => {
    const repeat = event.target.closest("[data-repeat]");
    if (repeat) {
      readInputs();
      if (repeat.dataset.repeat === "weekly") draft.recurrence = { type: "weekly", weekday: draft.recurrence?.weekday || 1 };
      else {
        draft.recurrence = null;
        draft.date ||= todayISO();
      }
      container.innerHTML = body();
      return;
    }
    const day = event.target.closest("[data-evday]");
    if (day) {
      readInputs();
      draft.recurrence.weekday = Number(day.dataset.evday);
      container.innerHTML = body();
      return;
    }
    const action = event.target.closest("[data-ev-action]")?.dataset.evAction;
    if (action === "save") {
      readInputs();
      if (!draft.title.trim()) {
        sheet.querySelector("#ev-error").hidden = false;
        return;
      }
      draft.emoji = lastGrapheme(draft.emoji) || "📅";
      if (!draft.recurrence) delete draft.recurrence;
      await store.saveEvent(draft);
      await store.resetAssignments(weekStart(todayISO()));
      close();
      toast("Saved");
      renderAppointments(view);
    }
    if (action === "delete") {
      close();
      const answer = await askSheet({
        title: `Remove ${ev.title}?`,
        text: ev.recurrence ? "It stops showing from now on. Past ones stay in your history." : "It won't show anymore.",
        actions: [
          { id: "yes", label: "Remove", style: "primary" },
          { id: "no", label: "Keep it", style: "ghost" },
        ],
      });
      if (answer !== "yes") return;
      // Las recurrentes terminan ayer (el historial se conserva); las de una vez se borran.
      if (ev.recurrence) {
        await store.saveEvent({ ...ev, until: addDays(todayISO(), -1) });
      } else {
        await store.deleteEvent(ev.id);
      }
      toast("Removed");
      renderAppointments(view);
    }
  });
}

// ---------- Health ----------

async function renderHealth(view) {
  const tasks = (await store.getTasks()).filter((t) => t.categoryId === "health" && t.status === "active");
  view.innerHTML = `
    ${header("Health")}
    <p class="muted" style="margin: 0 0 16px">Medication and health requirements. They show even on rest days and during free time if you choose.</p>
    <ul class="settings-list">
      ${tasks
        .map(
          (t) => `
        <li><a class="settings-row" href="#/task/${encodeURIComponent(t.id)}">
          <span class="task-emoji tint-coral">${t.emoji}</span>
          <span class="task-text">
            <span class="task-name" style="display: block">${esc(t.name)}</span>
            <span class="task-detail" style="display: block">${esc([t.health?.dose, t.health?.instructions].filter(Boolean).join(" · ") || "Tap to add dose and instructions")}</span>
          </span>
          ${icon("chevron-right")}
        </a></li>`,
        )
        .join("")}
    </ul>
    <a class="btn btn-secondary btn-block" href="#/task/new?category=health" style="margin-top: 12px">${icon("plus")} Add medication or requirement</a>`;
}

// ---------- Categories ----------

async function renderCategories(view) {
  const [categories, tasks] = await Promise.all([store.getCategories(), store.getTasks()]);
  const count = (id) => tasks.filter((t) => t.categoryId === id && t.status === "active").length;
  view.innerHTML = `
    ${header("Categories")}
    <ul class="settings-list">
      ${categories
        .map(
          (c) => `
        <li><button class="settings-row" style="width: 100%; border: 0; text-align: left" data-cat="${c.id}">
          <span class="task-emoji tint-${c.tint}"><span class="dot" style="background: var(--${c.tint}-ink-2)"></span></span>
          <span class="task-text">
            <span class="task-name" style="display: block">${esc(c.name)}</span>
            <span class="task-detail" style="display: block">${count(c.id)} ${count(c.id) === 1 ? "task" : "tasks"}</span>
          </span>
          ${icon("chevron-right")}
        </button></li>`,
        )
        .join("")}
    </ul>
    <button class="btn btn-secondary btn-block" data-action="new-cat" style="margin-top: 12px">${icon("plus")} Add a category</button>`;

  view.onclick = (event) => {
    const cat = event.target.closest("[data-cat]");
    if (cat) return categorySheet(view, categories.find((c) => c.id === cat.dataset.cat), count(cat.dataset.cat));
    if (event.target.closest("[data-action=new-cat]")) categorySheet(view, { name: "", tint: "lilac" }, 0);
  };
}

function categorySheet(view, category, used) {
  let tint = category.tint;
  const isNew = !category.id;
  const { sheet, close } = openSheet(
    `
    <h2 class="display sheet-title">${isNew ? "New category" : esc(category.name)}</h2>
    <div class="field" style="margin-top: 16px">
      <label for="f-cat-name">Name</label>
      <input id="f-cat-name" class="input" value="${esc(category.name)}" placeholder="Learning" />
      <p class="small error" id="cat-error" hidden>Give it a name.</p>
    </div>
    <div class="field">
      <span class="field-label">Color</span>
      <div class="tint-swatches">${TINTS.map((t) => `<button type="button" class="tint-${t}" data-tint="${t}" aria-pressed="${t === tint}" aria-label="${t}"></button>`).join("")}</div>
    </div>
    <div class="stack">
      <button class="btn btn-primary btn-block" data-cat-action="save">${isNew ? "Add category" : "Save"}</button>
      ${
        isNew
          ? ""
          : used
            ? `<p class="hint" style="text-align: center">It has ${used} ${used === 1 ? "task" : "tasks"}. Move them to another category to remove it.</p>`
            : `<button class="btn btn-ghost btn-block" data-cat-action="delete">Remove category</button>`
      }
    </div>`,
    { label: "Category" },
  );
  sheet.addEventListener("click", async (event) => {
    const swatch = event.target.closest("[data-tint]");
    if (swatch) {
      tint = swatch.dataset.tint;
      sheet.querySelectorAll("[data-tint]").forEach((b) => b.setAttribute("aria-pressed", b === swatch));
    }
    const action = event.target.closest("[data-cat-action]")?.dataset.catAction;
    if (action === "save") {
      const name = sheet.querySelector("#f-cat-name").value.trim();
      if (!name) {
        sheet.querySelector("#cat-error").hidden = false;
        return;
      }
      const id = category.id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || `cat-${Date.now()}`;
      await store.saveCategory({ ...category, id, name, tint });
      close();
      toast("Saved");
      renderCategories(view);
    }
    if (action === "delete") {
      await store.deleteCategory(category.id);
      close();
      toast("Removed");
      renderCategories(view);
    }
  });
}

// ---------- Energy and planning ----------

function renderPlanning(view) {
  const e = settings.energy;
  const c = settings.dayCapacity;
  view.innerHTML = `
    ${header("Energy and planning")}
    <section class="form-section">
      <h2 class="display">Low days</h2>
      <div class="field">
        <span class="field-label">Count as a low day</span>
        <div class="chips">
          ${ENERGY.map((x) => `<button type="button" class="chip" data-low="${x.id}" aria-pressed="${e.lowLevels.includes(x.id)}">${x.label}</button>`).join("")}
        </div>
      </div>
      ${stepper("lowDaysThreshold", "Suggest a lighter week after", e.lowDaysThreshold, { min: 1, max: 6, hint: "Low days in the same week." })}
    </section>
    <section class="form-section">
      <h2 class="display">Check-ins</h2>
      <div class="field">
        <label for="f-evening">Evening check-in</label>
        <input id="f-evening" class="input" type="time" data-time="eveningCheckIn" value="${settings.eveningCheckIn}" />
      </div>
      <div class="field">
        <span class="field-label">Weekly plan shows up on</span>
        ${weekdayChips("plan-day", [settings.weeklyPlan.weekday])}
      </div>
      <div class="field">
        <label for="f-plan-from">From</label>
        <input id="f-plan-from" class="input" type="time" data-time="weeklyPlan.from" value="${settings.weeklyPlan.from}" />
      </div>
    </section>
    <section class="form-section">
      <h2 class="display">How full a day can get</h2>
      <p class="hint" style="margin: -4px 0 12px">Light tasks count 1, medium 2, heavy 3. The planner won't go over these.</p>
      ${stepper("home", "Home days", c.home, { max: 10 })}
      ${stepper("office", "Office days", c.office, { max: 10 })}
      ${stepper("saturday", "Saturdays", c.saturday, { max: 10 })}
      ${stepper("sunday", "Sundays", c.sunday, { max: 10 })}
    </section>
    <section class="form-section">
      <h2 class="display">Backup reminder</h2>
      ${stepper("backupReminderDays", "Remind me after", settings.backupReminderDays, { min: 7, max: 90, hint: "Days without a backup." })}
    </section>`;

  view.onclick = async (event) => {
    const low = event.target.closest("[data-low]");
    if (low) {
      const set = new Set(e.lowLevels);
      set.has(low.dataset.low) ? set.delete(low.dataset.low) : set.add(low.dataset.low);
      await save({ energy: { ...e, lowLevels: [...set] } });
      return renderPlanning(view);
    }
    const planDay = event.target.closest("[data-plan-day]");
    if (planDay) {
      await save({ weeklyPlan: { ...settings.weeklyPlan, weekday: Number(planDay.dataset.planDay) } });
      return renderPlanning(view);
    }
    const step = event.target.closest("[data-step]");
    if (step) {
      const key = step.dataset.step;
      const clamp = (v) => Math.min(Number(step.dataset.max), Math.max(Number(step.dataset.min), v));
      const delta = Number(step.dataset.delta) * (key === "backupReminderDays" ? 7 : 1);
      if (key === "lowDaysThreshold") await save({ energy: { ...e, lowDaysThreshold: clamp(e.lowDaysThreshold + delta) } });
      else if (key === "backupReminderDays") await save({ backupReminderDays: clamp(settings.backupReminderDays + delta) });
      else await save({ dayCapacity: { ...c, [key]: clamp(c[key] + delta) } }, { replan: true });
      renderPlanning(view);
    }
  };
  view.onchange = async (event) => {
    const key = event.target.dataset.time;
    if (!key || !event.target.value) return;
    if (key === "eveningCheckIn") await save({ eveningCheckIn: event.target.value });
    else await save({ weeklyPlan: { ...settings.weeklyPlan, from: event.target.value } });
  };
}

// ---------- Backup ----------

function renderBackup(view) {
  const last = settings.lastBackupAt;
  const days = last ? diffDays(last.slice(0, 10), todayISO()) : null;
  view.innerHTML = `
    ${header("Backup")}
    <p class="muted" style="margin: 0 0 16px">Your data lives only on this phone. A backup is one file with everything, so you can restore it if you change phones or something goes wrong.</p>
    <div class="tint ${days === null || days >= settings.backupReminderDays ? "tint-butter" : "tint-mint"}" style="margin-bottom: 16px">
      ${last ? `Last backup: ${formatDate(last.slice(0, 10), "day")}${days ? ` (${days} ${days === 1 ? "day" : "days"} ago)` : " (today)"}` : "No backup yet."}
    </div>
    <div class="stack">
      <button class="btn btn-primary btn-block" data-action="export">${icon("download")} Save a backup</button>
      <p class="hint" style="margin: -4px 0 8px">On iPhone, choose "Save to Files" and pick iCloud Drive.</p>
      <label class="btn btn-secondary btn-block" for="f-import">${icon("upload")} Restore from a backup</label>
      <input id="f-import" type="file" accept="application/json,.json" hidden />
      <p class="small error" id="import-error" hidden></p>
    </div>`;

  view.onclick = async (event) => {
    if (!event.target.closest("[data-action=export]")) return;
    try {
      const saved = await exportBackup();
      if (saved) {
        settings = await store.getSettings();
        toast("Backup saved");
        renderBackup(view);
      }
    } catch (error) {
      console.error(error);
      toast("Couldn't save the backup. Try again.");
    }
  };
  view.onchange = async (event) => {
    if (event.target.id !== "f-import") return;
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    const errorEl = view.querySelector("#import-error");
    try {
      const json = await readBackup(file);
      const when = json.exportedAt ? formatDate(json.exportedAt.slice(0, 10), "day") : "that file";
      const answer = await askSheet({
        title: "Restore this backup?",
        text: `Everything on this phone will be replaced with your backup from ${when}. This can't be undone.`,
        actions: [
          { id: "yes", label: "Replace my data", style: "primary" },
          { id: "no", label: "Cancel", style: "ghost" },
        ],
      });
      if (answer !== "yes") return;
      await restoreBackup(json);
      toast("Backup restored");
      location.hash = "#/today";
    } catch (error) {
      errorEl.textContent = error.message || "That file couldn't be read.";
      errorEl.hidden = false;
    }
  };
}

// ---------- Pantalla ----------

const SCREENS = {
  profile: renderProfile,
  work: renderWork,
  workout: renderWorkout,
  "free-time": renderFreeTime,
  appointments: renderAppointments,
  health: renderHealth,
  categories: renderCategories,
  planning: renderPlanning,
  backup: renderBackup,
};

export async function renderSettings(view, section) {
  settings = await store.getSettings();
  const render = SCREENS[section];
  if (render) await render(view);
  else renderMain(view);
}
