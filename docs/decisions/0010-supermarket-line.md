# 0010. La línea del súper reemplaza la pantalla del modo compra

Fecha: 2026-11-11
Estado: Aceptado

## Contexto

El modo compra (F-1) muestra la lista entera con la cabecera de avance y la
barra plegada. El prototipo de `/design/linea` probó otra forma, "andén con
riel": una estación (categoría) a la vez en un cartel de tinta y la línea
como un riel en el borde derecho. El usuario la probó y la asignó como F-9
(`docs/improvements.md`). Antes de implementarla quedaban abiertas cuatro
decisiones: qué manda en el orden de las estaciones, cómo se elige la lista
sin categorías, cómo convive el ticket de la caja con "Buena compra" (M-3) y
dónde vive la posición en el recorrido.

## Decisión

1. **El andén reemplaza la pantalla del modo compra.** Fuera del modo compra
   la lista no cambia. Nada avanza solo: "Siguiente" espera el toque.
2. **Manda el orden de la lista.** Las estaciones siguen
   `categories.position`, el orden manual de "Ordenar el recorrido",
   compartido por todos los miembros. El orden aprendido (`learnRoute`,
   `src/lib/domain/learn-route.ts`, sobre `items.checked_at` por `trip_id`)
   es una sugerencia: cuando difiere, "Ordenar el recorrido" lo ofrece y
   aceptarlo lo guarda como orden de la lista, para todos. Sin migración.
3. **La lista simple es una preferencia de este dispositivo**, guardada en
   `localStorage` como el propio modo compra: una sola estación, "Tu lista",
   y el riel mide el carro. Además se usa sola cuando todo lo pendiente cae
   en una categoría.
4. **La posición es de este dispositivo.** Dónde estoy y qué estaciones pasé
   se guardan con el viaje en `localStorage`; los otros miembros no lo ven.
   Las funciones puras que la mueven están en `src/lib/domain/line.ts`.
5. **El ticket y "Buena compra" se funden.** La caja es la última parada:
   muestra el ticket (una línea por estación, el estimado por moneda y el
   talón "No conseguido") y ahí vive "Terminé". Al tocarlo, "Buena compra"
   queda como titular breve, sin repetir el resumen. Fuera del modo compra,
   "Vaciar el carro" conserva el resumen de M-3. "No conseguido" es lo que
   quedó pendiente: no hay un tercer estado.
6. **Sin tokens nuevos.** El cartel usa `surface-inverse`. El fondo de tinta
   para toda la pantalla queda fuera: pediría una paleta oscura forzada y
   tocaría el ADR 0008.

## Alternativas consideradas

- Que mande el orden aprendido: el riel y la lista fuera del modo compra
  podrían diferir, y cada miembro vería otro orden sin haberlo elegido.
- Lista simple como ajuste de la lista: pide una migración y obliga a todos
  los miembros a comprar igual.
- Lista simple solo automática: con la categoría asignada sola (A-1) casi
  nunca se daría.
- El ticket en lugar de "Buena compra": se pierde el momento editorial al
  terminar. Los dos enteros: repiten las mismas cifras.
- Guardar la posición en la lista (servidor): sería F-5 (compra compartida
  en vivo), que no está asignada.
- three.js para el recorrido o el ticket: descartado para el recorrido; el
  ticket en 3D es un experimento aparte, sin decidir.

## Consecuencias

- `learnRoute` pasa de `src/app/design/linea/` a `src/lib/domain/`.
- El almacenamiento del modo compra (`lista:shopping`) gana la posición y la
  preferencia de lista simple; un valor viejo sin ellas sigue siendo válido.
- F-9 absorbe M-16 (títulos de categoría compactos en el modo compra).
- Tienen que seguir funcionando dentro de la estación: escrituras
  optimistas, Realtime, totales por moneda (M-2), el "+" que despliega el
  campo, deshacer (A-4), deslizar para borrar (M-9), la espera de A-5 y el
  wake lock.
- Límites conocidos: el riel con más estaciones de las que entran en
  pantallas muy bajas, y la vibración, que no existe en iPhone.
