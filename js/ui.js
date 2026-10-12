// Piezas de interfaz reutilizables.

export function esc(text = "") {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Ícono de Lucide por su nombre en lucide.dev (por ejemplo "sun", "list-checks").
export function icon(name, className = "icon") {
  const pascal = name.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
  // Formato de Lucide: ["svg", atributos, [[etiqueta, atributos], ...]]
  const node = window.lucide?.icons?.[pascal];
  if (!node) return "";
  const children = node[2]
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(" ")}/>`)
    .join("");
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${children}</svg>`;
}

// Hoja que sube desde abajo. Devuelve el elemento y una función para cerrarla.
// onClose se llama si la cierras tocando fuera.
export function openSheet(html, { label = "", onClose } = {}) {
  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";
  backdrop.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}">
      <div class="sheet-handle"></div>
      ${html}
    </div>`;
  const close = () => backdrop.remove();
  backdrop.addEventListener("click", (event) => {
    if (event.target !== backdrop) return;
    close();
    onClose?.();
  });
  document.body.append(backdrop);
  return { sheet: backdrop.firstElementChild, close };
}

export function emptyState({ iconName, title, text }) {
  return `
    <section class="card empty">
      ${icon(iconName)}
      <h2 class="display">${esc(title)}</h2>
      <p>${esc(text)}</p>
    </section>`;
}

// Hoja con una pregunta y botones. Devuelve el id del botón elegido (o null si la cierras).
export function askSheet({ title, text = "", body = "", actions, label = title }) {
  return new Promise((resolve) => {
    const { sheet, close } = openSheet(
      `
      <h2 class="display sheet-title">${esc(title)}</h2>
      ${text ? `<p class="muted" style="margin: 4px 0 0">${esc(text)}</p>` : ""}
      ${body}
      <div class="stack" style="margin-top: 24px">
        ${actions.map((a) => `<button class="btn btn-${a.style || "secondary"} btn-block" data-answer="${a.id}">${esc(a.label)}</button>`).join("")}
      </div>`,
      { label, onClose: () => resolve(null) },
    );
    sheet.addEventListener("click", (event) => {
      const answer = event.target.closest("[data-answer]")?.dataset.answer;
      if (!answer) return;
      close();
      resolve(answer);
    });
  });
}

// Aviso breve abajo ("Saved"). Desaparece solo.
export function toast(text) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 1800);
}

// Campos de emoji: solo uno. Si escribes otro, reemplaza al anterior (se queda el último).
export function lastGrapheme(text = "") {
  const parts = [...new Intl.Segmenter().segment(text.trim())];
  return parts.at(-1)?.segment || "";
}

document.addEventListener(
  "input",
  (event) => {
    const el = event.target;
    if (!el.classList?.contains("input-emoji")) return;
    const one = lastGrapheme(el.value);
    if (el.value !== one) el.value = one;
  },
  true, // antes que el resto: quien lea el campo ya ve un solo emoji
);
