// Pestaña Perfil: semanas cumplidas, peso y medidas.

import { getWorkouts, getPlan, getMeasurements, saveMeasurement, deleteMeasurement, getProfile, saveProfile } from "../store.js";
import { downloadBackup, getLastBackup, readBackupFile, importData, deleteData, DELETE_CATEGORIES, storageUsage } from "../backup.js";
import { BODY_METRICS } from "../data/catalog.js";
import { weeklySummary } from "../stats.js";
import { VERSION } from "../version.js";
import { getUnits, setDefaultUnit, unitToggle } from "../units.js";
import { t, locale } from "../i18n.js";
import { applyTheme } from "../theme.js";
import { lineChart, bindCharts } from "../chart.js";
import { formatKg } from "./session.js";
import { esc, icons, header, pageHeader, openSheet, confirmSheet, toast } from "../ui.js";

export async function renderProfile(view) {
  const plan = await getPlan();
  const summary = weeklySummary(await getWorkouts(), plan?.daysPerWeek);
  const records = await getMeasurements();
  const rows = weekWindow(summary);
  const milestone = nextMilestone(summary.current);
  const profile = await getProfile();
  const lastBackup = await getLastBackup();
  const units = await getUnits();
  const usage = await storageUsage();

  const metricRows = Object.entries(BODY_METRICS)
    .map(([key, metric]) => {
      const values = valuesFor(records, key);
      const latest = values.at(-1);
      const first = values[0];
      const delta = values.length > 1 ? latest.value - first.value : null;
      return `
      <a class="list-row" href="#/perfil/medida/${key}">
        <span class="list-row-text">
          <strong>${metric.label}</strong>
          <small>${delta !== null ? `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${formatKg(Math.abs(delta))} ${metric.unit} ${t("profile.since", { date: shortDate(first.date) })}` : latest ? shortDate(latest.date) : t("profile.noRecords")}</small>
        </span>
        <span class="metric-value">${latest ? `${formatKg(latest.value)} <small>${metric.unit}</small>` : "—"}</span>
        ${icons.chevron}
      </a>`;
    })
    .join("");

  view.innerHTML = `
    ${pageHeader({
      eyebrow: t("tab.perfil"),
      title: profile.name ? esc(profile.name) : t("profile.yourProfile"),
      action: `<button class="icon-btn" data-action="name" aria-label="${profile.name ? t("profile.changeName") : t("profile.addName")}">${icons.pencil}</button>`,
    })}

    <h2 class="section-title">${t("profile.weeksTitle")}</h2>
    <section class="card streak-card">
      <div class="streak">
        <div><strong>${summary.current}</strong><small>${t("profile.streakLabel", { n: summary.current })}</small></div>
        <div><strong>${summary.best}</strong><small>${t("profile.bestStreak")}</small></div>
      </div>
      <div class="milestone">
        <div class="milestone-head">
          <span>${summary.current ? t("milestone.next") : t("milestone.first")}: <strong>${milestone.name}</strong></span>
          <span class="milestone-count">${t("milestone.count", { n: summary.current, total: milestone.weeks })}</span>
        </div>
        <div class="milestone-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${milestone.weeks}" aria-valuenow="${summary.current}" aria-label="${t("milestone.progress", { name: milestone.name })}">
          <span style="width:${(summary.current / milestone.weeks) * 100}%"></span>
        </div>
        <p class="muted small-note">${summary.current ? t("milestone.left", { n: milestone.weeks - summary.current }) : t("milestone.start")}</p>
      </div>

      <div class="week-rows" role="list" aria-label="${t("profile.weeksAria")}">
        ${rows
          .map(
            (row) => `
          <div class="week-row">
            <span class="week-month">${monthShort(row[0].start)}</span>
            <div class="week-grid">
              ${row
                .map(
                  (w) => `<span role="listitem" class="week-dot ${w.state} ${w.current ? "current" : ""}"
                    title="${weekLabel(w)}" aria-label="${weekLabel(w)}"></span>`
                )
                .join("")}
            </div>
          </div>`
          )
          .join("")}
      </div>

    </section>

    <div class="title-row section-row">
      <h2 class="section-title">${t("profile.body")}</h2>
      <button class="btn-small" data-action="record">${icons.plus} ${t("profile.record")}</button>
    </div>
    <div class="list">${metricRows}</div>

    <h2 class="section-title">${t("profile.preferences")}</h2>
    <section class="card settings-card">
      <div class="setting-row">
        <span>${t("profile.language")}</span>
        ${segmented("lang", t("profile.language"), [["auto", t("profile.auto")], ["es", "ES"], ["en", "EN"]], profile.lang || "auto")}
      </div>
      <div class="setting-row setting-divider">
        <span>${t("profile.appearance")}</span>
        ${segmented("theme", t("profile.appearance"), [["auto", t("profile.auto")], ["light", t("profile.light")], ["dark", t("profile.dark")]], profile.theme || "auto")}
      </div>
      <p class="muted small-note">${t("profile.autoNote")}</p>
      <div class="setting-row setting-divider">
        <span>${t("profile.defaultUnit")}</span>
        ${unitToggle(units.default || "kg", "default-unit")}
      </div>
      <p class="muted small-note">${t("profile.defaultUnitNote")}</p>
      <div class="setting-row setting-divider">
        <span>${t("profile.quote")}</span>
        ${segmented("quote", t("profile.quote"), [["show", t("common.yes")], ["hide", t("common.no")]], profile.hideQuote ? "hide" : "show")}
      </div>
    </section>

    <h2 class="section-title">${t("profile.backup")}</h2>
    <section class="card backup-card">
      <p class="backup-status ${backupIsOld(lastBackup) ? "warn" : ""}">${backupText(lastBackup)}</p>
      <div class="stack">
        <button class="btn btn-primary" data-action="export">${t("profile.export")}</button>
        <button class="btn btn-secondary" data-action="import">${t("profile.import")}</button>
      </div>
      ${usage !== null ? `<p class="muted small-note">${usage < 0.1 ? t("profile.usageTiny") : t("profile.usage", { mb: formatKg(Math.round(usage * 10) / 10) })}</p>` : ""}
      <p class="muted small-note">${t("profile.backupNote")}</p>
      <input type="file" accept="application/json,.json" data-import-file hidden />
    </section>

    <h2 class="section-title">${t("profile.deleteData")}</h2>
    <button class="btn btn-ghost-danger btn-outline-danger" data-action="delete">${t("profile.chooseDelete")}</button>

    <p class="app-version"><strong>Show Up</strong> · ${t("profile.version", { v: VERSION })}</p>
  `;

  view.onclick = async (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    const refresh = () => renderProfile(view);
    if (action === "record") recordSheet(refresh);
    else if (action === "name") nameSheet(profile, refresh);
    else if (action === "lang") {
      await saveProfile({ ...profile, lang: event.target.closest("[data-value]").dataset.value });
      location.reload(); // Se recarga para mostrar todo en el nuevo idioma.
    } else if (action === "theme") {
      const theme = event.target.closest("[data-value]").dataset.value;
      await saveProfile({ ...profile, theme });
      applyTheme(theme);
      const y = window.scrollY;
      await renderProfile(view);
      window.scrollTo(0, y);
    } else if (action === "quote") {
      await saveProfile({ ...profile, hideQuote: event.target.closest("[data-value]").dataset.value === "hide" });
      const y = window.scrollY;
      await renderProfile(view);
      window.scrollTo(0, y);
    } else if (action === "default-unit") {
      await setDefaultUnit(event.target.closest("[data-unit]").dataset.unit);
      const y = window.scrollY;
      await renderProfile(view);
      window.scrollTo(0, y);
    }
    else if (action === "export") {
      try {
        if (await downloadBackup()) {
          toast(t("backup.ready"));
          refresh();
        }
      } catch (error) {
        console.error(error);
        toast(t("backup.exportError"));
      }
    } else if (action === "import") view.querySelector("[data-import-file]").click();
    else if (action === "delete") deleteSheet(refresh);
  };

  view.onchange = async (event) => {
    const input = event.target.closest("[data-import-file]");
    if (!input?.files[0]) return;
    const file = input.files[0];
    input.value = "";
    let data;
    try {
      data = await readBackupFile(file);
    } catch (error) {
      toast(error.message);
      return;
    }
    const ok = await confirmSheet({
      title: t("backup.importTitle"),
      text: t("backup.importText", { date: longDate(data.exportedAt), n: data.workouts.length }),
      confirmLabel: t("backup.importConfirm"),
      danger: true,
    });
    if (!ok) return;
    await importData(data);
    toast(t("backup.imported"));
    location.hash = "#/entrenar";
  };
}

// ---------- Nombre ----------

function nameSheet(profile, onSaved) {
  const close = openSheet({
    title: t("profile.nameTitle"),
    body: `
      <form class="form record-form" novalidate>
        <input class="input" name="name" value="${esc(profile.name || "")}" placeholder="${t("profile.namePlaceholder")}" autocomplete="given-name" maxlength="30" />
        <button class="btn btn-primary" type="submit">${t("common.save")}</button>
      </form>`,
    onMount: (sheet) => {
      const form = sheet.querySelector("form");
      setTimeout(() => form.elements.name.focus(), 250);
      form.onsubmit = async (event) => {
        event.preventDefault();
        await saveProfile({ ...profile, name: form.elements.name.value.trim() });
        close();
        onSaved();
      };
    },
  });
}

// ---------- Borrar por categorías ----------

function deleteSheet(onDone) {
  const selected = new Set();
  const close = openSheet({
    title: t("delete.title"),
    body: `
      <div class="choice-list delete-list">
        <button class="choice" data-all aria-pressed="false"><span>${t("delete.all")}</span></button>
        ${Object.entries(DELETE_CATEGORIES)
          .map(
            ([key, c]) => `
          <button class="choice choice-tall" data-category="${key}" aria-pressed="false">
            <span>${c.label}</span><small>${c.detail}</small>
          </button>`
          )
          .join("")}
      </div>
      <p class="muted small-note">${t("delete.note")}</p>
      <button class="btn btn-danger btn-spaced-sm" data-confirm-delete disabled>${t("delete.button")}</button>`,
    onMount: (sheet) => {
      const all = Object.keys(DELETE_CATEGORIES);
      const confirmBtn = sheet.querySelector("[data-confirm-delete]");
      const sync = () => {
        sheet.querySelectorAll("[data-category]").forEach((b) => b.setAttribute("aria-pressed", selected.has(b.dataset.category)));
        sheet.querySelector("[data-all]").setAttribute("aria-pressed", selected.size === all.length);
        confirmBtn.disabled = !selected.size;
        confirmBtn.textContent = selected.size === all.length ? t("delete.buttonAll") : selected.size ? `${t("delete.button")} (${selected.size})` : t("delete.button");
      };
      sheet.addEventListener("click", async (event) => {
        const category = event.target.closest("[data-category]")?.dataset.category;
        if (category) {
          selected.has(category) ? selected.delete(category) : selected.add(category);
          sync();
        } else if (event.target.closest("[data-all]")) {
          if (selected.size === all.length) selected.clear();
          else all.forEach((c) => selected.add(c));
          sync();
        } else if (event.target.closest("[data-confirm-delete]")) {
          const labels = [...selected].map((c) => DELETE_CATEGORIES[c].label.toLowerCase()).join(", ");
          const categories = [...selected];
          close();
          const ok = await confirmSheet({
            title: t("delete.confirmTitle"),
            text: t("delete.confirmText", { list: labels }),
            confirmLabel: t("delete.confirmButton"),
            danger: true,
          });
          if (!ok) return;
          await deleteData(categories);
          toast(t("delete.done"));
          onDone();
        }
      });
    },
  });
}

function backupText(iso) {
  if (!iso) return t("backup.never");
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  return t("backup.last", { days });
}

const backupIsOld = (iso) => !iso || Date.now() - new Date(iso) > 30 * 86400000;

// ---------- Semanas: vista de 6 meses e hitos ----------

// 26 semanas en 2 filas de 13: hasta 20 pasadas, la actual y las próximas.
function weekWindow(summary) {
  const past = summary.weeks.slice(-21);
  const weeks = past.map((w) => ({
    ...w,
    state: w.done ? "done" : w.current ? "upcoming" : "missed",
  }));
  const last = weeks.at(-1).start;
  for (let i = 1; weeks.length < 26; i++) {
    const start = new Date(last);
    start.setDate(start.getDate() + i * 7);
    weeks.push({ start, state: "upcoming", future: true, count: 0, goal: weeks.at(-1).goal });
  }
  return [weeks.slice(0, 13), weeks.slice(13)];
}

function weekLabel(w) {
  const date = shortDate(w.start);
  if (w.future) return t("week.upcoming", { date });
  if (w.current) return t("week.current", { date, n: w.count, goal: w.goal, done: w.done });
  return t("week.past", { date, n: w.count, goal: w.goal, done: w.done });
}

const MILESTONES = [4, 8, 12, 26, 52];

function nextMilestone(current) {
  const weeks = MILESTONES.find((m) => m > current);
  if (weeks) return { weeks, name: t(`milestone.w${weeks}`) };
  const years = Math.floor(current / 52) + 1;
  return { weeks: years * 52, name: t("milestone.years", { n: years }) };
}

// Selector de varias opciones con el estilo de "kg | lb".
function segmented(action, label, options, current) {
  return `
    <span class="unit-toggle" role="group" aria-label="${label}">
      ${options.map(([value, text]) => `<button type="button" data-action="${action}" data-value="${value}" aria-pressed="${value === current}">${text}</button>`).join("")}
    </span>`;
}

const monthShort = (date) => date.toLocaleDateString(locale(), { month: "short" }).replace(".", "");

// ---------- Detalle de una medida ----------

export async function renderMetric(view, key) {
  const metric = BODY_METRICS[key];
  if (!metric) {
    location.replace("#/perfil");
    return;
  }
  const records = await getMeasurements();
  const values = valuesFor(records, key);
  const latest = values.at(-1);
  const format = (v) => `${formatKg(v)} ${metric.unit}`;

  view.innerHTML = `
    ${header({ back: "#/perfil" })}
    <h1 class="screen-title">${metric.label}</h1>
    ${latest
      ? `<p class="hero-number">${formatKg(latest.value)}<small>${metric.unit}</small></p>
         <p class="muted day-meta">${t("metric.last", { date: longDate(latest.date) })}</p>`
      : `<section class="card empty"><p>${t("metric.none", { name: metric.label.toLowerCase() })}</p></section>`}
    ${values.length
      ? `<section class="card chart-card">
           <p class="chart-title">${t("metric.evolution")}</p>
           ${lineChart(values.slice(-24).map((v) => ({ y: v.value, label: shortDate(v.date) })), format)}
         </section>
         <div class="list history-list">
           ${[...values]
             .reverse()
             .map(
               (v) => `
             <div class="list-row">
               <span class="list-row-text"><strong>${format(v.value)}</strong><small>${longDate(v.date)}</small></span>
               <button class="icon-btn" data-delete="${v.recordId}" aria-label="${t("metric.deleteRecord")}">${icons.close}</button>
             </div>`
             )
             .join("")}
         </div>`
      : ""}
    <button class="btn btn-primary btn-spaced" data-action="record">${t("metric.recordOne", { name: metric.label.toLowerCase() })}</button>
  `;
  bindCharts(view);

  view.onclick = async (event) => {
    if (event.target.closest('[data-action="record"]')) {
      recordSheet(() => renderMetric(view, key), key);
      return;
    }
    const del = event.target.closest("[data-delete]");
    if (!del) return;
    const ok = await confirmSheet({ title: t("metric.deleteTitle"), text: t("metric.deleteText", { name: metric.label.toLowerCase() }), confirmLabel: t("delete.button"), danger: true });
    if (!ok) return;
    const record = records.find((r) => r.id === del.dataset.delete);
    delete record.values[key];
    if (Object.keys(record.values).length) await saveMeasurement(record);
    else await deleteMeasurement(record.id);
    toast(t("metric.deleted"));
    renderMetric(view, key);
  };
}

// ---------- Registrar peso y medidas ----------

function recordSheet(onSaved, onlyKey) {
  const keys = onlyKey ? [onlyKey] : Object.keys(BODY_METRICS);
  const close = openSheet({
    title: onlyKey ? t("metric.recordOne", { name: BODY_METRICS[onlyKey].label.toLowerCase() }) : t("metric.recordAll"),
    body: `
      <form class="form record-form" novalidate>
        <label class="field">
          <span>${t("metric.date")}</span>
          <input class="input" type="date" name="date" value="${today()}" max="${today()}" />
        </label>
        <div class="metric-grid">
          ${keys
            .map(
              (key) => `
            <label class="field">
              <span>${BODY_METRICS[key].label} <small>${BODY_METRICS[key].unit}</small></span>
              <input class="input" name="${key}" inputmode="decimal" autocomplete="off" />
            </label>`
            )
            .join("")}
        </div>
        ${onlyKey ? "" : `<p class="muted small-note">${t("metric.fillNote")}</p>`}
        <p class="form-error" role="alert"></p>
        <button class="btn btn-primary" type="submit">${t("common.save")}</button>
      </form>`,
    onMount: (sheet) => {
      const form = sheet.querySelector("form");
      if (onlyKey) setTimeout(() => form.elements[onlyKey].focus(), 250);
      form.onsubmit = async (event) => {
        event.preventDefault();
        const values = {};
        for (const key of keys) {
          const raw = form.elements[key].value.trim().replace(",", ".");
          if (!raw) continue;
          const number = parseFloat(raw);
          if (!Number.isFinite(number) || number <= 0) {
            form.querySelector(".form-error").textContent = t("metric.checkValue", { name: BODY_METRICS[key].label.toLowerCase() });
            return;
          }
          values[key] = number;
        }
        if (!Object.keys(values).length) {
          form.querySelector(".form-error").textContent = t("metric.atLeastOne");
          return;
        }
        await saveMeasurement({ id: Date.now().toString(36), date: form.elements.date.value || today(), values });
        close();
        toast(t("metric.saved"));
        onSaved();
      };
    },
  });
}

// ---------- Utilidades ----------

function valuesFor(records, key) {
  return records.filter((r) => r.values[key] !== undefined).map((r) => ({ date: r.date, value: r.values[key], recordId: r.id }));
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Las fechas de medidas son "AAAA-MM-DD"; se leen como fecha local.
const toDate = (value) => (value instanceof Date ? value : /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value));
const shortDate = (value) => toDate(value).toLocaleDateString(locale(), { day: "numeric", month: "short" }).replace(".", "");
const longDate = (value) => toDate(value).toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
