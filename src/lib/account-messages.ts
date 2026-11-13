/** Shared Spanish account errors. Server-action modules export functions only. */
export const PROBLEMA: Record<string, string> = {
  setup: "La clave de instalación no es válida. Pídesela a quien instala la aplicación.",
  claimed: "Ya hay una cuenta. Pide una invitación.",
  invalid: "Esa dirección de correo no es válida.",
  nameless: "Escribe tu nombre.",
  weak: "La clave necesita 10 caracteres como mínimo.",
  taken: "Ya hay una cuenta con ese correo. Entra con tu clave.",
  full: "Ya hay diez cuentas, que son todas las que caben.",
};
