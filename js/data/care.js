// Zonas a cuidar: ejercicios que más cargan cada zona.
// Si marcas una zona en el cuestionario, estos ejercicios casi no se proponen.
// Puedes agregar o quitar ejercicios de cada lista (usa su "id" de exercises.js).

export const CARE_ZONES = {
  rodillas: [
    "sentadilla-barra", "sentadilla-frontal", "sentadilla-hack", "sentadilla-smith",
    "zancadas-mancuernas", "sentadilla-bulgara", "step-up", "zancada-smith",
    "extension-cuadriceps", "curl-nordico",
  ],
  espalda_baja: [
    "peso-muerto", "peso-muerto-rumano-barra", "sentadilla-barra", "sentadilla-frontal",
    "remo-barra", "remo-t", "swing-kettlebell", "hiperextensiones", "press-militar", "rueda-abdominal",
  ],
  hombros: [
    "press-militar", "press-hombro-mancuernas", "press-hombro-maquina", "press-arnold", "press-hombro-banda",
    "fondos-paralelas", "fondos-banco", "press-inclinado-barra", "dominadas",
  ],
  munecas: [
    "flexiones", "press-frances", "curl-barra", "press-cerrado", "fondos-banco", "press-banca", "press-militar",
  ],
};

// Tipos de movimiento de cada zona a priorizar (para sumar un ejercicio extra).
export const FOCUS_PATTERNS = {
  glutes: ["hip_thrust", "abduction"],
  legs: ["squat", "lunge", "knee_ext", "knee_flex"],
  back: ["h_pull", "v_pull"],
  chest: ["h_push", "fly"],
  shoulders: ["lateral", "v_push", "rear_delt"],
  arms: ["biceps", "triceps"],
  core: ["core"],
};
