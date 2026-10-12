// Acceso a IndexedDB, la base de datos local del navegador.
// Todas las tablas se crean desde ya para no tener que migrar datos más adelante.

const DB_NAME = "pace";
const DB_VERSION = 1;

// Tablas con su clave e índices.
const SCHEMA = {
  kv: {}, // ajustes y datos sueltos
  tasks: { keyPath: "id" },
  categories: { keyPath: "id" },
  taskOverrides: { keyPath: "id", indexes: ["weekStart"] }, // cambios "Just this week"
  days: { keyPath: "date" }, // energía, tipo de día, rest day
  completions: { keyPath: "id", indexes: ["date", "taskId"] },
  skips: { keyPath: "id", indexes: ["date"] }, // "Not today"
  limitEntries: { keyPath: "id", indexes: ["date"] },
  bonusResults: { keyPath: "id", indexes: ["date"] },
  events: { keyPath: "id" }, // citas (v1: también Google Calendar)
  plans: { keyPath: "id", indexes: ["date"] }, // comida/cena fuera, salidas
  weeks: { keyPath: "weekStart" }, // oficina, gym, energía y reparto de cada semana
};

export const STORES = Object.keys(SCHEMA);

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const [name, { keyPath, indexes = [] }] of Object.entries(SCHEMA)) {
          if (db.objectStoreNames.contains(name)) continue;
          const store = db.createObjectStore(name, keyPath ? { keyPath } : undefined);
          indexes.forEach((index) => store.createIndex(index, index));
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    // Pide al sistema que no borre estos datos para liberar espacio.
    navigator.storage?.persist?.();
  }
  return dbPromise;
}

async function run(storeName, mode, action) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = action(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const db = {
  get: (store, key) => run(store, "readonly", (s) => s.get(key)),
  getAll: (store) => run(store, "readonly", (s) => s.getAll()),
  // Registros con el índice entre dos valores (por ejemplo, fechas de una semana).
  range: (store, index, from, to) => run(store, "readonly", (s) => s.index(index).getAll(IDBKeyRange.bound(from, to))),
  put: (store, value, key) => run(store, "readwrite", (s) => (key === undefined ? s.put(value) : s.put(value, key))),
  delete: (store, key) => run(store, "readwrite", (s) => s.delete(key)),
  clear: (store) => run(store, "readwrite", (s) => s.clear()),
};

export const newId = () => crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
