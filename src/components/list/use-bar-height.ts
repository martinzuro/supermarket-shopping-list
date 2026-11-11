"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Variable CSS que lee `pb-add-bar` (globals.css) en la página. */
const PROPERTY = "--add-bar-measured";

/**
 * Publica el alto real de la barra fija de abajo en `--add-bar-measured`,
 * para que la página deje libre ese espacio: la barra crece con el aviso,
 * las sugerencias o la fila de frecuentes, y con el teclado abierto o
 * cerrado cambia su padding de safe area.
 *
 * Lo que la barra hace no mueve la lista bajo el dedo:
 *
 * - Al crecer con la página al final, la acompaña solo si la persona está en
 *   la barra (el foco en el campo, escribiendo): así lo último agregado no
 *   queda debajo. Si está en la lista (marcando, borrando), la página se
 *   queda quieta y el aviso tapa un momento las últimas filas: un
 *   desplazamiento ahí corre la fila siguiente bajo el dedo de la ráfaga.
 * - Al achicarse, la reserva baja solo lo que no mueva la página. Con la
 *   página al final, una reserva más chica recorta el scroll y todo baja de
 *   golpe: un toque que ya empezó termina en otra fila o en un encabezado.
 *   Lo que sobra se libera a medida que la persona sube (el evento
 *   `scroll`), donde ya no mueve nada.
 * - El teclado de iOS es otra cosa: no es un toque en la lista. Al abrirse
 *   con la página al final, la página lo acompaña (el foco está en el campo)
 *   y lo último queda sobre el teclado. Al cerrarse, la reserva baja de una
 *   al alto de la barra: si esperara a que la persona suba, quedaría un hueco
 *   del alto del teclado al final de la página.
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
  // Across the keyboard's measures: the reserve the page has now, the bar's
  // last height, and the keyboard inset the last measure saw.
  const state = useRef({ bar: 0, reserve: 0, inset: 0 });

  useEffect(() => {
    const bar = ref.current;
    if (!bar || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const current = state.current;
    // The keyboard moved (this run comes from a new inset, not a resize).
    const keyboardMoved = current.inset !== keyboardInset;
    current.inset = keyboardInset;
    const reserve = (height: number) => {
      current.reserve = height;
      root.style.setProperty(PROPERTY, `${height}px`);
    };
    // Lowers the reserve towards the bar's height as far as the page can
    // lose at its end without the scroll moving.
    const settle = () => {
      if (current.reserve <= current.bar) return;
      const room = Math.max(
        0,
        // A negative scroll (the iOS bounce at the top) is still the top.
        root.scrollHeight - window.innerHeight - Math.max(0, window.scrollY),
      );
      const next = Math.max(current.bar, current.reserve - Math.floor(room));
      if (next !== current.reserve) reserve(next);
    };
    const measure = (release = false) => {
      // Desde el borde de arriba de la barra hasta el fondo de la ventana:
      // la barra y, en iOS, el teclado que la levanta.
      const height = Math.ceil(
        window.innerHeight - bar.getBoundingClientRect().top,
      );
      if (height === current.bar) return;
      const grew = current.bar > 0 && height > current.bar;
      current.bar = height;
      if (height <= current.reserve) {
        if (release) reserve(height);
        else settle();
        return;
      }
      // Antes de cambiar la reserva: ¿estaba la página al final?
      const atEnd =
        window.scrollY + window.innerHeight >= root.scrollHeight - 2;
      reserve(height);
      if (atEnd && grew && bar.contains(document.activeElement)) {
        window.scrollTo({
          top: root.scrollHeight - window.innerHeight,
          behavior: "instant",
        });
      }
    };
    const observer = new ResizeObserver(() => measure());
    observer.observe(bar);
    measure(keyboardMoved);
    window.addEventListener("scroll", settle, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", settle);
    };
  }, [ref, keyboardInset]);

  useEffect(
    () => () => {
      state.current = { bar: 0, reserve: 0, inset: 0 };
      document.documentElement.style.removeProperty(PROPERTY);
    },
    [],
  );
}
