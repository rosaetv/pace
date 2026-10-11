// Guía de estilos: todas las piezas visuales juntas para revisarlas.
// Los valores vienen de css/theme.css.

import { icon, openSheet } from "../ui.js";
import { ENERGY } from "./today.js";

const PASTELS = ["mint", "sky", "peach", "rose", "butter", "lilac", "coral"];

export function renderStyleguide(view) {
  view.innerHTML = `
    <a class="icon-btn" href="#/settings" aria-label="Back">${icon("chevron-left")}</a>
    <h1 class="display screen-title" style="margin-top: 16px">Style guide</h1>

    <h2 class="display section-title">Type</h2>
    <div class="card stack">
      <p class="display" style="font-size: var(--font-size-xxl); margin: 0">Hi there</p>
      <p class="display" style="font-size: var(--font-size-xl); margin: 0">Good morning</p>
      <p class="display" style="font-size: var(--font-size-lg); margin: 0">Your day</p>
      <p style="margin: 0"><strong>Figtree semibold</strong> for task names and buttons.</p>
      <p style="margin: 0">Figtree regular for body text, 16 px, easy to read on the phone.</p>
      <p class="small muted" style="margin: 0">Secondary text, 14 px</p>
      <p class="eyebrow">Dates and hints</p>
    </div>

    <h2 class="display section-title">Colors</h2>
    <div class="swatches">
      <div class="swatch" style="background: var(--color-primary); color: var(--color-on-primary)">Primary</div>
      <div class="swatch" style="background: var(--color-ink-bar); color: var(--color-on-ink-bar)">Ink</div>
      <div class="swatch" style="background: var(--color-bg); color: var(--color-text); box-shadow: inset 0 0 0 1px var(--color-border)">Background</div>
      ${PASTELS.map((p) => `<div class="swatch tint-${p}">${p[0].toUpperCase() + p.slice(1)}</div>`).join("")}
    </div>

    <h2 class="display section-title">Energy</h2>
    <div class="stats" style="grid-template-columns: repeat(4, minmax(0, 1fr))">
      ${ENERGY.map((e) => `<div class="stat tint-${e.tint}"><span class="stat-label">${icon(e.icon)}</span><span class="stat-value" style="font-size: var(--font-size-md)">${e.label}</span></div>`).join("")}
    </div>

    <h2 class="display section-title">Limits</h2>
    <div class="stack">
      ${[
        { used: 1, max: 3, tint: "lilac", note: "Under the limit" },
        { used: 3, max: 3, tint: "butter", note: "At the limit" },
        { used: 4, max: 3, tint: "coral", note: "Over, no penalty" },
      ]
        .map(
          (l) => `
        <div class="tint tint-${l.tint}">
          <div class="row" style="justify-content: space-between">
            <strong>${icon("pizza")} Takeout · ${l.used} of ${l.max}</strong>
            <span class="small" style="color: var(--ink-2)">${l.note}</span>
          </div>
          <div class="meter">${Array.from({ length: Math.max(l.max, l.used) }, (_, i) => `<span class="${i < l.used ? "on" : ""}"></span>`).join("")}</div>
        </div>`,
        )
        .join("")}
    </div>

    <h2 class="display section-title">Tasks</h2>
    <ul class="task-list">
      <li class="task">
        <span class="task-emoji tint-mint" aria-hidden="true">🏋️</span>
        <div class="task-text"><p class="task-name">Gym</p><p class="task-detail">Light session · 1 of 2 this week</p></div>
        <button class="check" aria-label="Mark as done">${icon("check")}</button>
      </li>
      <li class="task is-done">
        <span class="task-emoji tint-sky" aria-hidden="true">🚿</span>
        <div class="task-text"><p class="task-name">Shower</p></div>
        <button class="check" aria-label="Mark as not done">${icon("check")}</button>
      </li>
    </ul>

    <h2 class="display section-title">Buttons</h2>
    <div class="stack">
      <button class="btn btn-primary btn-block">Show my day</button>
      <button class="btn btn-secondary btn-block">Not today</button>
      <button class="btn btn-ghost btn-block">Keep as is</button>
      <div class="chips">
        <button class="chip" aria-pressed="true">Usual day</button>
        <button class="chip" aria-pressed="false">Day off</button>
        <button class="chip" aria-pressed="false">Rest day</button>
      </div>
    </div>

    <h2 class="display section-title">Sheets</h2>
    <button class="btn btn-secondary btn-block" data-action="sheet">Open a sample sheet</button>
  `;

  view.onclick = (event) => {
    if (!event.target.closest("[data-action=sheet]")) return;
    const { sheet, close } = openSheet(
      `
      <h2 class="display sheet-title">Rough week</h2>
      <p class="muted">You've had 3 low days. Lighten the rest of the week to 50%?</p>
      <div class="stack" style="margin-top: 24px">
        <button class="btn btn-primary btn-block" data-close>Lighten my week</button>
        <button class="btn btn-ghost btn-block" data-close>Keep as is</button>
      </div>`,
      { label: "Sample sheet" },
    );
    sheet.addEventListener("click", (e) => e.target.closest("[data-close]") && close());
  };
}
