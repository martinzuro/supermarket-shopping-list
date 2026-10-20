"use client";

import { useEffect, type RefObject } from "react";

/** Variable CSS que lee `pb-add-bar` (globals.css) en la página. */
const PROPERTY = "--add-bar-measured";

/**
 * Publica el alto real de la barra fija de abajo en `--add-bar-measured`,
 * para que la página deje libre justo ese espacio: la barra crece con el
 * aviso, las sugerencias o la fila de frecuentes, y con el teclado abierto o
 * cerrado cambia su padding de safe area. Si la página estaba al final cuando
 * la barra crece, la acompaña, para que las últimas filas no queden debajo.
 */
export function useBarHeight(
  ref: RefObject<HTMLElement | null>,
  /**
   * Lo que el teclado tapa (useKeyboardInset): en iOS el teclado no achica
   * la ventana y la barra sube sobre él con `bottom`, así que la página tiene
   * que reservar también ese alto. Cambiar `bottom` no cambia el tamaño de
   * la barra: el efecto vuelve a medir con cada cambio.
   */
  keyboardInset = 0,
) {
  useEffect(() => {
    const bar = ref.current;
    if (!bar || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    let last = 0;
    const measure = () => {
      // Desde el borde de arriba de la barra hasta el fondo de la ventana:
      // la barra y, en iOS, el teclado que la levanta.
      const height = Math.ceil(
        window.innerHeight - bar.getBoundingClientRect().top,
      );
      if (height === last) return;
      // Antes de cambiar la reserva: ¿estaba la página al final?
      const atEnd =
        window.scrollY + window.innerHeight >= root.scrollHeight - 2;
      root.style.setProperty(PROPERTY, `${height}px`);
      if (atEnd && last > 0 && height > last) {
        window.scrollTo({
          top: root.scrollHeight - window.innerHeight,
          behavior: "instant",
        });
      }
      last = height;
    };
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    measure();
    return () => {
      observer.disconnect();
      root.style.removeProperty(PROPERTY);
    };
  }, [ref, keyboardInset]);
}
