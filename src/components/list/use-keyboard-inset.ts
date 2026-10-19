"use client";

import { useSyncExternalStore } from "react";

/*
 * Alto del teclado virtual en iOS, donde el teclado no achica el layout
 * viewport y una barra `fixed; bottom: 0` quedaría tapada. En Android
 * (interactive-widget=resizes-content) y en escritorio vale 0.
 */
function subscribeToViewport(onChange: () => void) {
  const viewport = window.visualViewport;
  viewport?.addEventListener("resize", onChange);
  viewport?.addEventListener("scroll", onChange);
  window.addEventListener("resize", onChange);
  return () => {
    viewport?.removeEventListener("resize", onChange);
    viewport?.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
}

function getKeyboardInset() {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  const inset = window.innerHeight - viewport.height - viewport.offsetTop;
  return Math.max(0, Math.round(inset));
}

function getServerKeyboardInset() {
  return 0;
}

/**
 * Alto del teclado virtual, para subir lo que va fijo abajo (la barra de
 * agregar, la hoja de edición).
 */
export function useKeyboardInset() {
  return useSyncExternalStore(
    subscribeToViewport,
    getKeyboardInset,
    getServerKeyboardInset,
  );
}
