// Respaldo: exportar todos tus datos a un archivo JSON e importarlos de vuelta.

import { db, STORES } from "./db.js";
import { getSettings, saveSettings, exportAll, init } from "./store.js";
import { todayISO } from "./logic/dates.js";

// Guarda el archivo: en el iPhone abre "Compartir" (Guardar en Archivos, AirDrop…).
export async function exportBackup() {
  const data = await exportAll();
  const name = `pace-backup-${todayISO()}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const file = new File([blob], name, { type: "application/json" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Pace backup" });
    } catch (error) {
      if (error.name === "AbortError") return false; // la cerraste sin guardar
      throw error;
    }
  } else {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const settings = await getSettings();
  await saveSettings({ ...settings, lastBackupAt: new Date().toISOString() });
  return true;
}

// Lee y revisa un archivo de respaldo. Devuelve el contenido o lanza un error con un mensaje claro.
export async function readBackup(file) {
  let json;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error("That file isn't a Pace backup.");
  }
  if (json?.app !== "pace" || typeof json.data !== "object") throw new Error("That file isn't a Pace backup.");
  if (!json.data.kv?.settings) throw new Error("This backup is missing your settings.");
  return json;
}

// Reemplaza todos tus datos por los del respaldo.
export async function restoreBackup(json) {
  for (const store of STORES) await db.clear(store);
  for (const store of STORES) {
    if (store === "kv") {
      // Sin fecha de inicio, lo pendiente nunca se arrastra desde antes de hoy.
      await db.put("kv", { ...json.data.kv.settings, startedAt: json.data.kv.settings.startedAt || todayISO() }, "settings");
      continue;
    }
    for (const record of json.data[store] || []) await db.put(store, record);
  }
  await init(); // aplica cambios de versión si el respaldo es antiguo
}
