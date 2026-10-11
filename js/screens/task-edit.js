// Crear y editar una tarea.
// Al guardar cambios en una tarea existente pregunta: "Just this week" o "From now on".

import { esc, icon, openSheet } from "../ui.js";
import { todayISO, weekStart, weekday, addDays, formatDate, WEEKDAYS } from "../logic/dates.js";
import { effectiveTask } from "../logic/energy.js";
import * as store from "../store.js";
import { limitIcon } from "./evening.js";

const LEVELS = [
  { id: "full", label: "100%", tint: "mint" },
  { id: "high", label: "80%", tint: "sky" },
  { id: "half", label: "50%", tint: "peach" },
  { id: "min", label: "Minimum", tint: "rose" },
];

const LIMIT_ICONS = ["wine", "beer", "moon-star", "martini", "coffee", "cookie", "candy", "pizza", "cigarette", "smartphone", "shopping-bag", "gauge"];

const TINTS = ["lilac", "coral", "sky", "butter", "rose", "mint", "peach"];

const FREQUENCY_DEFAULTS = {
  daily: () => ({ type: "daily" }),
  weekly: () => ({ type: "weekly", times: 2 }),
  everyNDays: () => ({ type: "everyNDays", n: 14, anchor: todayISO() }),
  weekdays: () => ({ type: "weekdays", days: [weekday(todayISO())] }),
  monthDays: () => ({ type: "monthDays", phases: [{ from: null, to: null, days: [1] }] }),
};

const BLANK = () => ({
  id: null,
  name: "",
  emoji: "✨",
  categoryId: "self-care",
  kind: "habit",
  frequency: { type: "daily" },
  constraints: {},
  effort: 1,
  streak: { type: "none" },
  points: 0,
  status: "active",
  versions: { full: { label: "" }, high: { label: "" }, half: { label: "" }, min: null },
  limit: null,
  bonus: null,
});

// Estado del editor.
let draft;
let original;
let categories;
let hiddenVersions = {}; // versiones apagadas, para recuperarlas si las vuelves a encender
let hasOverride = false;
let errors = {};

// ---------- Lectura y escritura por "ruta" (por ejemplo "versions.half.label") ----------

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => o?.[k], obj);
}

function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  keys.slice(0, -1).forEach((k) => {
    if (o[k] == null || typeof o[k] !== "object") o[k] = {};
    o = o[k];
  });
  if (value === undefined || value === "" || value === false) delete o[keys.at(-1)];
  else o[keys.at(-1)] = value;
}

// ---------- Piezas del formulario ----------

const segmented = (path, options, current) => `
  <div class="segmented" role="group">
    ${options.map(([value, label]) => `<button type="button" data-set="${path}" data-value="${value}" aria-pressed="${String(current) === String(value)}">${label}</button>`).join("")}
  </div>`;

const toggle = (path, label, hint = "") => `
  <div class="toggle-row">
    <div><div>${label}</div>${hint ? `<p class="hint">${hint}</p>` : ""}</div>
    <button type="button" class="switch" role="switch" data-toggle="${path}" aria-checked="${Boolean(getPath(draft, path))}" aria-label="${esc(label)}"></button>
  </div>`;

const stepper = (path, label, { min = 0, max = 20, hint = "", fallback = 0 } = {}) => `
  <div class="toggle-row">
    <div><div>${label}</div>${hint ? `<p class="hint">${hint}</p>` : ""}</div>
    <span class="stepper">
      <button type="button" data-step="${path}" data-delta="-1" data-min="${min}" data-max="${max}" aria-label="Less">−</button>
      <output>${getPath(draft, path) ?? fallback}</output>
      <button type="button" data-step="${path}" data-delta="1" data-min="${min}" data-max="${max}" aria-label="More">+</button>
    </span>
  </div>`;

const weekdayPicker = (path) => {
  const selected = getPath(draft, path) || [];
  return `
    <div class="weekdays">
      ${WEEKDAYS.map((d, i) => `<button type="button" data-weekday="${path}" data-day="${i + 1}" aria-pressed="${selected.includes(i + 1)}" aria-label="${d}">${d.slice(0, 2)}</button>`).join("")}
    </div>`;
};

const input = (path, label, { type = "text", placeholder = "", hint = "", className = "" } = {}) => `
  <div class="field">
    <label for="f-${path}">${label}</label>
    <input id="f-${path}" class="input ${className}" type="${type}" data-bind="${path}" ${type === "number" ? `inputmode="numeric" data-number` : ""} value="${esc(getPath(draft, path) ?? "")}" placeholder="${esc(placeholder)}" />
    ${hint ? `<p class="hint">${hint}</p>` : ""}
    ${errors[path] ? `<p class="small error">${errors[path]}</p>` : ""}
  </div>`;

// ---------- Secciones ----------

function basicsSection() {
  return `
    <section class="form-section">
      <div class="field-row">
        <div class="field" style="flex: 0 0 auto">
          <label for="f-emoji">Emoji</label>
          <input id="f-emoji" class="input input-emoji" data-bind="emoji" data-emoji value="${esc(draft.emoji)}" />
        </div>
        ${input("name", "Name", { placeholder: "Water the plants" })}
      </div>
      <div class="field">
        <label for="f-description">Description</label>
        <textarea id="f-description" class="textarea" data-bind="description" placeholder="Optional. Anything useful to remember: how, where, why.">${esc(draft.description || "")}</textarea>
      </div>
      <div class="field">
        <span class="field-label">Category</span>
        <div class="chips">
          ${categories.map((c) => `<button type="button" class="chip" data-set="categoryId" data-value="${c.id}" aria-pressed="${draft.categoryId === c.id}">${esc(c.name)}</button>`).join("")}
          <button type="button" class="chip" data-action="new-category">${icon("plus", "icon")} New</button>
        </div>
      </div>
      <div class="field">
        <span class="field-label">Type</span>
        ${segmented("kind", [["habit", "Habit"], ["limit", "Limit"], ["bonus", "Bonus"]], draft.kind)}
        <p class="hint">${
          { habit: "Something to do.", limit: "Something not to overdo. Counted weekly, never penalized.", bonus: "An extra win. Never counts against you." }[draft.kind]
        }</p>
      </div>
    </section>`;
}

function frequencySection() {
  const f = draft.frequency;
  let detail = "";
  if (f.type === "weekly") detail = stepper("frequency.times", "Times a week", { min: 1, max: 7 });
  if (f.type === "everyNDays") {
    detail = `
      ${stepper("frequency.n", "Every how many days", { min: 2, max: 60 })}
      ${input("frequency.anchor", "Next time", { type: "date", hint: "The app counts from this date." })}`;
  }
  if (f.type === "weekdays") detail = `<div class="field"><span class="field-label">On</span>${weekdayPicker("frequency.days")}${errors["frequency.days"] ? `<p class="small error">${errors["frequency.days"]}</p>` : ""}</div>`;
  if (f.type === "monthDays") {
    detail = f.phases
      .map(
        (p, i) => `
        <div class="card" style="margin-bottom: 8px">
          <div class="field">
            <label for="f-phase-${i}">Days of the month</label>
            <input id="f-phase-${i}" class="input" data-phase-days="${i}" value="${p.days.join(", ")}" placeholder="1, 16" inputmode="numeric" />
            ${errors[`phase${i}`] ? `<p class="small error">${errors[`phase${i}`]}</p>` : ""}
          </div>
          <div class="field-row">
            ${input(`frequency.phases.${i}.from`, "From", { type: "date" })}
            ${input(`frequency.phases.${i}.to`, "Until", { type: "date" })}
          </div>
          ${f.phases.length > 1 ? `<button type="button" class="btn btn-ghost" data-remove-phase="${i}">Remove this period</button>` : ""}
        </div>`,
      )
      .join("") +
      `<button type="button" class="btn btn-secondary btn-block" data-action="add-phase">${icon("plus")} Add a period</button>
       <p class="hint" style="margin-top: 8px">Use periods when it changes over time, like a new dose from January.</p>`;
  }
  return `
    <section class="form-section">
      <h2 class="display">How often</h2>
      <div class="field">
        <select class="select" data-frequency-type aria-label="How often">
          ${[
            ["daily", "Every day"],
            ["weekly", "A number of times a week"],
            ["weekdays", "On specific days"],
            ["everyNDays", "Every few days"],
            ["monthDays", "On days of the month"],
          ]
            .map(([v, l]) => `<option value="${v}" ${f.type === v ? "selected" : ""}>${l}</option>`)
            .join("")}
        </select>
      </div>
      ${detail}
    </section>`;
}

function versionsSection() {
  const isWeekly = draft.frequency.type === "weekly";
  return `
    <section class="form-section">
      <h2 class="display">By energy</h2>
      <p class="hint" style="margin: -4px 0 12px">What this looks like on each kind of day. Turn a level off to hide it that day.</p>
      ${errors.versions ? `<p class="small error" style="margin: 0 0 12px">${errors.versions}</p>` : ""}
      ${LEVELS.map((level) => {
        const v = draft.versions[level.id];
        return `
        <div class="version tint-${level.tint} ${v ? "" : "is-off"}">
          <div class="version-head">
            <span>${level.label}</span>
            <button type="button" class="switch" role="switch" data-version-toggle="${level.id}" aria-checked="${Boolean(v)}" aria-label="Show at ${level.label}"></button>
          </div>
          ${
            v
              ? `<div class="version-body">
                  ${input(`versions.${level.id}.label`, "What to do", { placeholder: draft.name || "Same as the name" })}
                  ${input(`versions.${level.id}.note`, "Note", { placeholder: "Optional" })}
                  <div class="field-row">
                    ${input(`versions.${level.id}.durationMin`, "Minutes", { type: "number", placeholder: "—" })}
                    ${isWeekly ? input(`versions.${level.id}.weeklyTarget`, "Times a week", { type: "number", placeholder: String(draft.frequency.times) }) : ""}
                  </div>
                </div>`
              : ""
          }
        </div>`;
      }).join("")}
    </section>`;
}

function rulesSection() {
  const f = draft.frequency.type;
  const notTags = draft.constraints.notTags || [];
  return `
    <section class="form-section">
      <h2 class="display">Rules</h2>
      <div class="field">
        <span class="field-label">Never on</span>
        <div class="chips" style="margin-bottom: 8px">
          ${[["office", "Office days"], ["gym", "Gym days"]]
            .map(([tag, label]) => `<button type="button" class="chip" data-tag="${tag}" aria-pressed="${notTags.includes(tag)}">${label}</button>`)
            .join("")}
        </div>
        ${weekdayPicker("constraints.forbiddenDays")}
      </div>
      ${f === "weekly" ? toggle("mustDo", "Non-negotiable", "Always gets a day, even if the week is full.") : ""}
      ${
        f === "weekly"
          ? `<div class="field">
              <span class="field-label">Preferred days</span>
              ${weekdayPicker("constraints.preferredDays")}
              <p class="hint">Pace tries these first. If they don't work that week, it picks another.</p>
            </div>`
          : ""
      }
      ${f === "weekly" ? toggle("constraints.gymDay", "Plan it on gym days", "Uses the gym days from Settings or your weekly plan.") : ""}
      ${f === "weekly" ? stepper("constraints.minRestDays", "Rest days in between", { min: 0, max: 5, hint: "At least this many days between two times." }) : ""}
      ${
        f === "weekdays"
          ? `<div class="field"><label for="f-early">Can be done early from</label>
              <select id="f-early" class="select" data-early>
                <option value="">Only on its day</option>
                ${WEEKDAYS.slice(0, 6).map((d, i) => `<option value="${i + 1}" ${draft.constraints.earlyFrom === i + 1 ? "selected" : ""}>${d}</option>`).join("")}
              </select></div>`
          : ""
      }
      ${toggle("constraints.skipsProtected", "Shows during free time", "For meds and errands that can't wait.")}
      ${toggle("suggested", "Just a suggestion", "Shows softly, never feels like a must.")}
      <div class="field" style="margin-top: 8px">
        <span class="field-label">Effort</span>
        ${segmented("effort", [[1, "Light"], [2, "Medium"], [3, "Heavy"]], draft.effort || 1)}
        <p class="hint">Helps the week planner avoid heavy days.</p>
      </div>
      ${input("constraints.choiceGroup", "Pick-one group", { placeholder: "Optional", hint: "With low energy, doing one task of the same group is enough." })}
    </section>`;
}

function streakSection() {
  const s = draft.streak || { type: "none" };
  return `
    <section class="form-section">
      <h2 class="display">Weekly goal</h2>
      ${segmented("streak.type", [["none", "No goal"], ["weekly", "Weekly goal"]], s.type)}
      ${s.type === "weekly" ? stepper("streak.target", draft.frequency.type === "daily" ? "Days a week" : "Times a week", { min: 1, max: 7, fallback: 6 }) : ""}
      <p class="hint" style="margin-top: 8px">Counted by weeks, so one missed day never breaks anything.</p>
    </section>`;
}

function healthSection() {
  if (draft.categoryId !== "health") return "";
  return `
    <section class="form-section">
      <h2 class="display">Health</h2>
      ${input("health.dose", "Dose", { placeholder: "1 tablet" })}
      ${input("health.instructions", "How to take it", { placeholder: "With breakfast" })}
    </section>`;
}

function limitSection() {
  const l = draft.limit;
  return `
    <section class="form-section">
      <h2 class="display">Limit</h2>
      <div class="field">
        <span class="field-label">Icon</span>
        <div class="icon-picker">
          ${LIMIT_ICONS.map((name) => `<button type="button" data-set="limit.icon" data-value="${name}" aria-pressed="${limitIcon(draft) === name}" aria-label="${name}">${icon(name)}</button>`).join("")}
        </div>
        <p class="hint">Shown in the counters at the top of Today.</p>
      </div>
      ${input("limit.unit", "Counted in", { placeholder: "glasses" })}
      ${stepper("limit.weeklyMax", "Max a week", { min: 1, max: 30 })}
      ${stepper("limit.perOccasionMax", "Max each time", { min: 0, max: 12, hint: "0 = no limit each time." })}
      ${l.perOccasionMax ? `<div class="field">${segmented("limit.perOccasionUnit", [["count", l.unit || "Count"], ["hours", "Hours"]], l.perOccasionUnit || "count")}</div>` : ""}
      <div class="field">
        <span class="field-label">Week counts from</span>
        ${segmented("limit.windowStartsOn", [[1, "Monday"], [7, "Sunday"]], l.windowStartsOn || 1)}
      </div>
      <div class="field">
        <span class="field-label">Counts on</span>
        ${weekdayPicker("limit.countOn")}
      </div>
      <div class="field">
        <label for="f-guidance">Reminders</label>
        <textarea id="f-guidance" class="textarea" data-guidance placeholder="One per line">${esc((l.guidance || []).join("\n"))}</textarea>
      </div>
    </section>`;
}

function bonusSection() {
  return `
    <section class="form-section">
      <h2 class="display">Challenge</h2>
      ${segmented("bonus.scope", [["day", "For a day"], ["week", "For a week"]], draft.bonus?.scope || "day")}
    </section>`;
}

function draw(view) {
  const isNew = !draft.id;
  const archived = draft.status === "archived";
  view.innerHTML = `
    <header class="topbar">
      <a class="icon-btn" href="#/tasks" aria-label="Back">${icon("chevron-left")}</a>
      <span class="topbar-title">${isNew ? "New task" : "Edit task"}</span>
      <span style="width: 44px"></span>
    </header>
    ${
      hasOverride
        ? `<div class="tint tint-butter" style="margin-bottom: 8px">This week has its own version. <button class="link-btn" data-action="reset-week">Back to usual</button></div>`
        : ""
    }
    ${archived ? `<div class="tint tint-lilac" style="margin-bottom: 8px">Archived. Its history is kept.</div>` : ""}
    ${basicsSection()}
    ${draft.kind === "habit" ? frequencySection() + versionsSection() + rulesSection() + streakSection() + healthSection() : ""}
    ${draft.kind === "limit" ? limitSection() : ""}
    ${draft.kind === "bonus" ? bonusSection() : ""}
    ${
      isNew
        ? ""
        : `<section class="form-section">
            <button class="btn ${archived ? "btn-secondary" : "btn-ghost"} btn-block" data-action="${archived ? "restore" : "archive"}">
              ${archived ? "Restore task" : "Archive task"}
            </button>
          </section>`
    }
    <div class="save-bar"><button class="btn btn-primary btn-block" data-action="save">${isNew ? "Create task" : "Save changes"}</button></div>
  `;
}

// ---------- Cambios ----------

function switchKind(kind) {
  draft.kind = kind;
  if (kind === "limit" && !draft.limit) {
    draft.limit = { icon: "gauge", unit: "times", weeklyMax: 3, perOccasionMax: 0, perOccasionUnit: "count", windowStartsOn: 1, countOn: [1, 2, 3, 4, 5, 6, 7], guidance: [] };
  }
  if (kind === "bonus" && !draft.bonus) draft.bonus = { scope: "day" };
}

function validate() {
  errors = {};
  if (!draft.name.trim()) errors.name = "Give it a name.";
  if (draft.kind === "habit") {
    const f = draft.frequency;
    if (f.type === "weekdays" && !f.days?.length) errors["frequency.days"] = "Pick at least one day.";
    if (f.type === "everyNDays" && !f.anchor) errors["frequency.anchor"] = "Pick a date.";
    if (f.type === "monthDays") {
      f.phases.forEach((p, i) => {
        if (!p.days.length) errors[`phase${i}`] = "Add at least one day, like 1 or 16.";
      });
    }
    if (!Object.values(draft.versions).some(Boolean)) errors.versions = "Keep at least one energy level on.";
  }
  return Object.keys(errors).length === 0;
}

// Tarea lista para guardar: limpia lo que no aplica a su tipo.
function finalTask() {
  const t = structuredClone(draft);
  t.name = t.name.trim();
  if (t.kind !== "habit") {
    const v = { label: t.name };
    t.versions = { full: v, high: v, half: v, min: v };
    t.frequency = { type: "daily" };
  } else {
    for (const level of LEVELS) {
      const v = t.versions[level.id];
      if (v && !v.label?.trim()) v.label = t.name;
    }
  }
  if (t.kind !== "limit") delete t.limit;
  if (t.kind !== "bonus") delete t.bonus;
  return t;
}

async function save(view) {
  if (!validate()) {
    draw(view);
    view.querySelector(".error")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const task = finalTask();
  const thisWeek = weekStart(todayISO());

  if (!task.id) {
    const all = await store.getTasks();
    task.id = task.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now().toString(36);
    task.order = Math.max(-1, ...all.map((t) => t.order ?? 0)) + 1;
    task.createdAt = new Date().toISOString();
    await store.saveTask(task);
    await store.resetAssignments(thisWeek);
    location.hash = "#/tasks";
    return;
  }

  if (JSON.stringify(task) === JSON.stringify(original)) {
    location.hash = "#/tasks";
    return;
  }

  // ¿Solo esta semana o de aquí en adelante?
  const { sheet, close } = openSheet(
    `
    <h2 class="display sheet-title">Apply changes</h2>
    <p class="muted">Is this a one-off or the new normal?</p>
    <div class="stack" style="margin-top: 24px">
      <button class="btn btn-secondary btn-block" data-scope="week">Just this week <span class="small" style="font-weight: 400">· until ${formatDate(addDays(thisWeek, 6), "day")}</span></button>
      <button class="btn btn-primary btn-block" data-scope="always">From now on</button>
    </div>`,
    { label: "Apply changes" },
  );
  sheet.addEventListener("click", async (event) => {
    const scope = event.target.closest("[data-scope]")?.dataset.scope;
    if (!scope) return;
    close();
    if (scope === "week") {
      const { id, order, createdAt, updatedAt, status, archivedAt, ...changes } = task;
      await store.saveOverride(task.id, thisWeek, changes);
    } else {
      const base = await store.getTask(task.id);
      await store.saveTask({ ...base, ...task, order: base.order, status: base.status });
      await store.removeOverride(task.id, thisWeek);
    }
    await store.resetAssignments(thisWeek);
    location.hash = "#/tasks";
  });
}

function newCategorySheet(view) {
  let tint = "lilac";
  const { sheet, close } = openSheet(
    `
    <h2 class="display sheet-title">New category</h2>
    <div class="field" style="margin-top: 16px">
      <label for="f-cat">Name</label>
      <input id="f-cat" class="input" placeholder="Learning" />
      <p class="small error" id="cat-error" hidden>Give it a name.</p>
    </div>
    <div class="field">
      <span class="field-label">Color</span>
      <div class="tint-swatches">
        ${TINTS.map((t) => `<button type="button" class="tint-${t}" data-tint="${t}" aria-pressed="${t === tint}" aria-label="${t}"></button>`).join("")}
      </div>
    </div>
    <button class="btn btn-primary btn-block" data-action="save-cat">Add category</button>`,
    { label: "New category" },
  );
  const nameInput = sheet.querySelector("#f-cat");
  nameInput.addEventListener("input", () => (sheet.querySelector("#cat-error").hidden = true));
  sheet.addEventListener("click", async (event) => {
    const swatch = event.target.closest("[data-tint]");
    if (swatch) {
      tint = swatch.dataset.tint;
      sheet.querySelectorAll("[data-tint]").forEach((b) => b.setAttribute("aria-pressed", b === swatch));
    }
    if (event.target.closest("[data-action=save-cat]")) {
      const name = nameInput.value.trim();
      if (!name) {
        sheet.querySelector("#cat-error").hidden = false;
        return;
      }
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || `cat-${Date.now()}`;
      await store.saveCategory({ id, name, tint });
      categories = await store.getCategories();
      draft.categoryId = id;
      close();
      draw(view);
    }
  });
}

// ---------- Pantalla ----------

export async function renderTaskEdit(view, id) {
  categories = await store.getCategories();
  hiddenVersions = {};
  errors = {};
  const thisWeek = weekStart(todayISO());

  if (id.startsWith("new")) {
    draft = BLANK();
    // #/task/new?category=health → empieza en esa categoría.
    const category = new URLSearchParams(id.split("?")[1] || "").get("category");
    if (category && categories.some((c) => c.id === category)) draft.categoryId = category;
    original = null;
    hasOverride = false;
  } else {
    const task = await store.getTask(decodeURIComponent(id));
    if (!task) {
      location.hash = "#/tasks";
      return;
    }
    const override = await store.getOverride(task.id, thisWeek);
    hasOverride = Boolean(override);
    draft = structuredClone(effectiveTask(task, override ? [override] : [], thisWeek));
    draft.constraints ||= {};
    draft.streak ||= { type: "none" };
    original = structuredClone(finalTask());
  }
  draw(view);

  view.oninput = (event) => {
    const el = event.target;
    if (el.dataset.bind) {
      let value = el.value;
      if (el.dataset.emoji) {
        // Solo el primer emoji o carácter.
        const first = [...new Intl.Segmenter().segment(value)][0]?.segment || "";
        value = first;
      }
      if (el.dataset.number !== undefined) value = value === "" ? undefined : Math.max(0, parseInt(value, 10) || 0);
      if (el.type === "date" && !value) value = el.dataset.bind.includes("phases") ? null : undefined;
      setPath(draft, el.dataset.bind, value);
      if (errors[el.dataset.bind]) {
        delete errors[el.dataset.bind];
        el.parentElement.querySelector(".error")?.remove();
      }
    }
    if (el.dataset.phaseDays !== undefined) {
      const days = el.value.split(/[^0-9]+/).map(Number).filter((n) => n >= 1 && n <= 31);
      draft.frequency.phases[Number(el.dataset.phaseDays)].days = [...new Set(days)].sort((a, b) => a - b);
    }
    if (el.dataset.guidance !== undefined) {
      draft.limit.guidance = el.value.split("\n").map((s) => s.trim()).filter(Boolean);
    }
  };

  view.onchange = (event) => {
    const el = event.target;
    if (el.dataset.frequencyType !== undefined) {
      draft.frequency = FREQUENCY_DEFAULTS[el.value]();
      draw(view);
    }
    if (el.dataset.early !== undefined) {
      setPath(draft, "constraints.earlyFrom", el.value ? Number(el.value) : undefined);
    }
  };

  view.onclick = async (event) => {
    const t = event.target;
    const set = t.closest("[data-set]");
    if (set) {
      const raw = set.dataset.value;
      const value = /^\d+$/.test(raw) ? Number(raw) : raw;
      if (set.dataset.set === "kind") switchKind(value);
      else setPath(draft, set.dataset.set, value);
      if (set.dataset.set === "streak.type" && value === "weekly" && !draft.streak.target) draft.streak.target = draft.frequency.times || 6;
      return draw(view);
    }
    const sw = t.closest("[data-toggle]");
    if (sw) {
      setPath(draft, sw.dataset.toggle, !getPath(draft, sw.dataset.toggle));
      return draw(view);
    }
    const step = t.closest("[data-step]");
    if (step) {
      const path = step.dataset.step;
      const current = getPath(draft, path) ?? 0;
      const next = Math.min(Number(step.dataset.max), Math.max(Number(step.dataset.min), current + Number(step.dataset.delta)));
      setPath(draft, path, next === 0 && !path.startsWith("limit") ? undefined : next);
      if (path.startsWith("limit") && next === 0) getPath(draft, "limit").perOccasionMax = 0;
      return draw(view);
    }
    const day = t.closest("[data-weekday]");
    if (day) {
      const path = day.dataset.weekday;
      const n = Number(day.dataset.day);
      const days = new Set(getPath(draft, path) || []);
      days.has(n) ? days.delete(n) : days.add(n);
      setPath(draft, path, days.size ? [...days].sort() : path === "frequency.days" ? [] : undefined);
      delete errors[path];
      return draw(view);
    }
    const tag = t.closest("[data-tag]");
    if (tag) {
      const tags = new Set(draft.constraints.notTags || []);
      tags.has(tag.dataset.tag) ? tags.delete(tag.dataset.tag) : tags.add(tag.dataset.tag);
      setPath(draft, "constraints.notTags", tags.size ? [...tags] : undefined);
      return draw(view);
    }
    const vt = t.closest("[data-version-toggle]");
    if (vt) {
      const level = vt.dataset.versionToggle;
      if (draft.versions[level]) {
        hiddenVersions[level] = draft.versions[level];
        draft.versions[level] = null;
      } else {
        // Al encenderla, parte de la versión de arriba más cercana.
        const above = LEVELS.slice(0, LEVELS.findIndex((l) => l.id === level)).reverse().find((l) => draft.versions[l.id]);
        draft.versions[level] = hiddenVersions[level] || structuredClone(above ? draft.versions[above.id] : { label: "" });
      }
      return draw(view);
    }
    const removePhase = t.closest("[data-remove-phase]");
    if (removePhase) {
      draft.frequency.phases.splice(Number(removePhase.dataset.removePhase), 1);
      return draw(view);
    }

    const action = t.closest("[data-action]")?.dataset.action;
    if (action === "add-phase") {
      const last = draft.frequency.phases.at(-1);
      draft.frequency.phases.push({ from: last.to ? addDays(last.to, 1) : null, to: null, days: [...last.days] });
      draw(view);
    }
    if (action === "new-category") newCategorySheet(view);
    if (action === "save") await save(view);
    if (action === "reset-week") {
      await store.removeOverride(draft.id, thisWeek);
      await store.resetAssignments(thisWeek);
      await renderTaskEdit(view, draft.id);
    }
    if (action === "archive") confirmArchive(view);
    if (action === "restore") {
      await store.setTaskStatus(draft.id, "active");
      await store.resetAssignments(thisWeek);
      location.hash = "#/tasks";
    }
  };
}

function confirmArchive(view) {
  const { sheet, close } = openSheet(
    `
    <h2 class="display sheet-title">Archive ${esc(draft.name)}?</h2>
    <p class="muted">It leaves your lists. Its history stays, and you can restore it anytime.</p>
    <div class="stack" style="margin-top: 24px">
      <button class="btn btn-primary btn-block" data-confirm="yes">Archive</button>
      <button class="btn btn-ghost btn-block" data-confirm="no">Keep it</button>
    </div>`,
    { label: "Archive task" },
  );
  sheet.addEventListener("click", async (event) => {
    const answer = event.target.closest("[data-confirm]")?.dataset.confirm;
    if (!answer) return;
    close();
    if (answer === "yes") {
      await store.setTaskStatus(draft.id, "archived");
      await store.resetAssignments(weekStart(todayISO()));
      location.hash = "#/tasks";
    }
  });
}
