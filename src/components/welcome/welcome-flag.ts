/** Clave de localStorage que marca que este dispositivo ya vio la bienvenida. */
export const WELCOME_SEEN_KEY = "lista:welcome-seen";

/**
 * Variable CSS inline en <html> mientras la bienvenida está pendiente; la
 * pone el script de (app)/layout antes de hidratar y la quita Welcome.
 */
export const WELCOME_PENDING_PROPERTY = "--welcome-pending";

/**
 * Marca la bienvenida como vista en este dispositivo y quita la variable CSS
 * que mantiene oculta la lista. La usa la propia bienvenida al terminar y la
 * pantalla de invitación al aceptar: quien llega por una invitación ya fue
 * recibido, no necesita la bienvenida encima de la lista compartida.
 */
export function markWelcomeSeen() {
  try {
    localStorage.setItem(WELCOME_SEEN_KEY, String(Date.now()));
  } catch {
    // Sin almacenamiento la bienvenida se repetirá; no es grave.
  }
  document.documentElement.style.removeProperty(WELCOME_PENDING_PROPERTY);
}
