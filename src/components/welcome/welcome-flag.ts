/** Clave de localStorage que marca que este dispositivo ya vio la bienvenida. */
export const WELCOME_SEEN_KEY = "lista:welcome-seen";

/**
 * Variable CSS inline en <html> mientras la bienvenida está pendiente; la
 * pone el script de (app)/layout antes de hidratar y la quita Welcome.
 */
export const WELCOME_PENDING_PROPERTY = "--welcome-pending";
