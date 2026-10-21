# Sistema de diseño: referencia de implementación

Qué existe en el código, cómo se usa y cómo se extiende. La visión y las
decisiones están en [DESIGN_DIRECTION.md](DESIGN_DIRECTION.md) y en el
[ADR 0008](decisions/0008-design-direction.md); esto es el mapa para
construir con ellas. La página interna `/design` muestra todo renderizado.

Estado: construido entre el 2026-10-17 y el 2026-10-18 en los PR 13 a 20.
Actualizado el 2026-10-19 con lo que sumó la Fase 2a (`ListRow` y `Section`
con las agrupaciones por categoría, las coreografías de la lista, la
excepción del pulso remoto y los e2e con Supabase local) y la 2c (compartir,
invitación, miembros, avisos de lista perdida y "traer lo de otra lista"), y
el 2026-10-20 con la Fase 3 (selector de categoría y hoja "Recorrido", precio
y totales, combobox, frecuentes y "Lo de siempre", guarda del doble toque y
alto medido de la barra). Todo lo de la Fase 3 se armó con tokens y
componentes existentes, sin tokens nuevos.

---

## 1. Dónde vive cada cosa

| Pieza | Archivo |
| ----- | ------- |
| Tokens CSS (color, tipografía, espaciado, radios, sombra, motion) | `src/app/globals.css` |
| Paleta y pares de contraste en TypeScript | `src/lib/design/tokens.ts` |
| Tokens de motion en TypeScript | `src/lib/design/motion.ts` |
| Utilidades de contraste (hex, oklch, WCAG) | `src/lib/design/contrast.ts` |
| Test que ata CSS y TypeScript y valida AA | `src/lib/design/tokens.test.ts` |
| Fuentes (Geist, Geist Mono, Instrument Serif) | `src/app/layout.tsx` |
| Primitivas de motion | `src/components/motion/index.tsx` |
| Componentes base | `src/components/ui/*.tsx` |
| Iconos de categoría | `src/components/icons/category-icons.tsx` |
| Ilustraciones | `src/components/illustrations/index.tsx` |
| Bienvenida del primer uso | `src/components/welcome/` |
| Textos visibles | `src/lib/texts.ts` |
| Página de muestra | `src/app/design/` |
| Capturas e invariantes visuales | `e2e/visual.spec.ts` |

## 2. Color

Dos capas de color en `globals.css`: paleta cruda por modo y roles
semánticos.

### Paleta (clase de Tailwind entre paréntesis)

| Token | Claro | Oscuro | Uso |
| ----- | ----- | ------ | --- |
| `--paper` (`bg-paper`) | `#f6f3ec` | `#121814` | Fondo base. Nunca blanco ni negro puros |
| `--paper-2` (`bg-paper-2`) | `#dce9c8` | `#1f2b22` | Pistacho: carro, hojas, agrupaciones, botón secundario |
| `--ink` (`text-ink`) | `#1b2a1f` | `#eeebe2` | Texto principal |
| `--ink-2` (`text-ink-2`) | `#56655a` | `#9ba69c` | Metadatos, eyebrows, cuerpo secundario, borde de campo |
| `--ink-3` (`text-ink-3`) | `#76837a` | `#6b776e` | Solo decorativo o deshabilitado (3:1 sobre papel y pistacho) |
| `--forest` | `#2f4a3a` | `#8fb89b` | Marca, foco en claro, hover de la acción primaria |
| `--lime` | `#c9f04a` | `#c9f04a` | Acción primaria y estado "hecho". Nunca como fondo de texto claro |
| `--on-lime` | `#1b2a1f` | `#1b2a1f` | El único texto permitido sobre lima |
| `--citrus` / `--citrus-text` | `#f26b1d` / `#b8480a` | `#ff8a47` / `#ff9a62` | Atención, cambios de otros. El `-text` es el que cumple 4.5:1 |
| `--tomato` / `--tomato-text` | `#d9432b` / `#b5341f` | `#f06a52` / `#f57f6a` | Único rojo. Igual: `-text` para texto |
| `--inverse-bg` / `--inverse-fg` / `--inverse-fg-2` | `#1b2a1f` / `#eeebe2` / `#afb8b0` | iguales | Superficie inversa (bienvenida, momentos): tinta verde en los dos modos, así la lima siempre va sobre tinta |
| `--focus-inverse` | `#c9f04a` | igual | Anillo de foco dentro de la superficie inversa; lo aplica la utilidad `surface-inverse` |

### Roles derivados

| Token | Valor | Uso |
| ----- | ----- | --- |
| `--rule` (`border-rule`) | tinta al 12% | Toda línea de 1px. Es el separador por defecto, en lugar de sombras |
| `--rule-strong` | tinta al 24% | Reglas que deben verse más |
| `--paper-hover` / `--paper-pressed` | tinta al 6% / 10% sobre papel | Hover y pressed de superficies |
| `--field-border` | `--ink-2` | Borde de campos (3:1 garantizado) |
| `--action-bg` / `--action-fg` | tinta / lima en claro, lima / tinta en oscuro | Botón primario y el disco de "hecho" (`CheckCircle`) |
| `--focus` | bosque en claro, lima en oscuro | Anillo de foco global (`:focus-visible`, 2px, offset 2px) |
| `--remote-pulse` | cítrico al 22% | Pulso de una fila que cambió otro miembro |
| `--attention-bg` / `--danger-bg` | cítrico / tomate al 10% sobre papel | Fondos de aviso. El texto va en tinta; el color en icono e hilo |
| `--scrim` | tinta al 40% en claro, negro al 60% en oscuro | Velo detrás de hojas |
| `--sheet-shadow` (`shadow-sheet`) | tinta al 22% en claro, negro al 60% en oscuro | La única sombra, definida por modo para que en oscuro no sea un halo claro |
| `--cat-<id>` / `--cat-<id>-thread` | oklch, ver abajo | Etiqueta e hilo de cada categoría |

### Categorías

Diez tintes con la misma luminosidad y croma, de modo que conviven sin
competir: etiqueta `oklch(90% 0.06 H)` en claro y `oklch(33% 0.05 H)` en
oscuro; hilo `oklch(55% 0.13 H)` en claro y `oklch(72% 0.13 H)` en
oscuro. `otros` no tiene croma. Los ids y tonos están en
`src/lib/design/tokens.ts` (`categoryIds`, `categoryHue`) y coinciden con
el seed de Supabase: `verduras`, `carnes`, `lacteos`, `panaderia`,
`almacen`, `bebidas`, `congelados`, `limpieza`, `higiene`, `otros`.

El color de categoría va en la etiqueta (`CategoryChip`) y en el hilo de
2px de la agrupación (`Section thread`). Nunca como fondo de fila.

### Contraste

`tokens.test.ts` comprueba, en cada `npm test`, que los hex de
`globals.css` coinciden con `tokens.ts` y que los 35 pares de uso por
modo cumplen WCAG AA (4.5:1 texto, 3:1 bordes e iconos). Si un token
cambia, cambian los dos archivos y el test lo exige. `/design` muestra los
ratios en vivo.

## 3. Tipografía

Tres roles (ADR 0008): Geist para interfaz (`font-sans`), Instrument Serif
para display (`font-serif`, solo por encima de 28px, nunca en etiquetas ni
filas) y Geist Mono para datos (`font-mono`: cantidades, precios,
totales). Las tres se cargan con `next/font` en el layout raíz.

Escala fluida entre 375px y 1440px, como clases `text-*` con su
interlineado, tracking y peso incorporados:

| Clase | Tamaño | Tracking | Fuente habitual | Uso |
| ----- | ------ | -------- | --------------- | --- |
| `text-display` | 40 → 72px | −2.5% → −4% | serif | Titulares editoriales, bienvenida, momentos |
| `text-title` | 28 → 40px | −1.6% → −2.5% | serif | Wordmark en cabecera, títulos de página |
| `text-heading` | 20 → 24px | −1% | sans 500 | Encabezados de sección, títulos de hoja |
| `text-row` | 17 → 18px | 0 | sans | Filas de la lista |
| `text-body` (por defecto en `body`) | 15 → 16px | 0 | sans | Cuerpo |
| `text-label` | 13px | 0 | sans 500 | Botones, etiquetas, chips |
| `text-eyebrow` o utilidad `eyebrow` | 11 → 12px | +6% | sans 500, mayúsculas, tinta 2 | Metadatos |

El tracking de display y title también es fluido (la regla: 0 a 14px,
−1% a 20px, −2.5% a 40px, −4% desde 64px), y va en `rem` con `clamp()`
porque un valor en `em` no puede variar con el viewport; la cuenta está
comentada en `globals.css`.

Las cifras son tabulares en `input`, `td` y cualquier elemento con
`data-numeric`. Para una palabra en cursiva dentro de un titular serif se
usa `<em>`.

## 4. Espaciado, radios, superficies y sombra

- Dos variables fluidas gobiernan el layout: `--spacing-margin`
  (`clamp(16px, 4vw, 40px)`, clase `px-margin`) y `--spacing-gap`
  (`clamp(12px, 1.5vw, 24px)`, clase `gap-gap`). La utilidad `px-safe`
  aplica el margen respetando los safe areas.
- Interior de componentes: la escala de 4px de Tailwind.
- Objetivos táctiles: `h-touch` / `size-touch` (44px) y `touch-lg` (52px,
  acción principal). Fila de lista: `h-row` (56px).
- Radios: `rounded-none` para reglas y agrupaciones, `rounded-field` (6px)
  para campos y chips, `rounded-sheet` (12px) para hojas y
  tarjetas-objeto, `rounded-full` para acciones. Nada intermedio: las
  clases `rounded-sm` a `rounded-4xl` colapsan en esos valores.
- Superficies: papel (base), pistacho (`bg-paper-2`, carro, agrupaciones,
  botón secundario), tinta inversa con la utilidad `surface-inverse`, que
  además cambia el color de foco a lima. Las hojas van sobre papel y se
  distinguen por la sombra y el velo, no por el color. Sin más niveles.
- Sombra: solo `shadow-sheet`, para hojas y diálogos que flotan de verdad.
  Nada más tiene sombra.

## 5. Motion

Tokens en `globals.css` (`--motion-*`) y espejados en
`src/lib/design/motion.ts`; el test de tokens los compara.

| Token | Valor | Uso |
| ----- | ----- | --- |
| `--motion-ease-out` (`ease-out`) | `cubic-bezier(0.19, 1, 0.22, 1)` | Casi todo |
| `--motion-ease-in-out` (`ease-in-out`, `ease-cinematic`) | `cubic-bezier(0.65, 0.05, 0, 1)` | Movimientos largos |
| `duration-instant` / `fast` / `base` / `slow` / `cinematic` | 120 / 200 / 320 / 600 / 900 ms | Pressed y foco / hover / marcar y hojas / vistas / momentos |
| `--motion-stagger` | 35 ms | Entre elementos de una lista que entra |
| `--motion-shift` | 8px | Desplazamiento de las entradas |

Primitivas en `src/components/motion` (Motion for React, ADR 0009):

- `MotionProvider` en el layout raíz: `reducedMotion="user"` y transición
  base. Con movimiento reducido las primitivas quitan desplazamientos,
  retrasos, escalonado y cambios de altura; quedan los fundidos. Esto se
  resuelve en JavaScript (`useReducedMotion`), no en CSS.
- `Enter` (entrada suelta, `delay` opcional), `Stagger` (con
  `delayChildren`) + `StaggerItem` (listas coreografiadas), `Collapse`
  (bloques que aparecen y desaparecen, como el banner de conexión: fundido
  y desplazamiento de `--motion-shift`, sin animar la altura, que cambia de
  golpe; mientras se desvanece lleva `pointerEvents: none`, para que su
  contenido, que ya no corresponde, no reciba un toque pensado para lo que
  quedó debajo).
- Transiciones reutilizables: `transitions`.

Reglas: solo `transform` y `opacity` en interacciones frecuentes; las
transiciones CSS de los componentes usan las clases de duración y curva;
sin scroll suavizado ni secuestro de scroll; sin bucles visibles en la
lista. Las coreografías clave están descritas en DESIGN_DIRECTION.md,
sección 8.

Excepción documentada: el pulso remoto (`ListRow highlighted`, token
`--remote-pulse`) anima `background-color`. Se permite porque es raro (solo
lo provocan los cambios de otros miembros), corto (`duration-instant` al
encender, `duration-slow` al apagar) y no va atado a una interacción
frecuente del usuario. Todo lo que sí es frecuente (marcar, añadir, mover
filas) sigue en `transform` y `opacity`.

### Coreografías de la lista

Implementadas en `src/components/list/list-view.tsx`:

- **Entrada solo para lo nuevo.** `Enter` anima únicamente las filas y los
  grupos cuyo id aparece después de la primera carga (`useFreshIds`): la
  primera carga es la línea base y no anima nada, y una fila que solo
  cambia de sección conserva su id y no vuelve a entrar. Un grupo entra
  (fundido y desplazamiento) solo si es nuevo y contiene algo recién
  añadido; sus filas no entran por su cuenta.
- **Marcar.** La fila se queda 320 ms (`duration-base`) en su sección
  mientras se juega el tachado y el check, y después viaja a la otra. El
  viaje es un `layoutId` compartido (el id del ítem) con
  `layout="position"`, que mueve solo con `transform` y no escala la fila
  entre secciones de distinto ancho. Con movimiento reducido no hay espera:
  la fila se mueve de inmediato.
- **Grupos.** Cada categoría de Pendientes es un `Enter` con
  `layout="position"`: cuando un grupo aparece o desaparece, los de abajo
  se deslizan. No se anima la altura de nada.
- **Cambio remoto.** `ListView` pasa `highlighted` a las filas cuyo id
  está en `useRemoteChanges`: el pulso dura 400 ms encendido y después
  `ListRow` lo funde en `duration-slow`, un segundo en total. Solo lo
  provocan las filas que otro miembro añade, edita, marca o devuelve,
  también si una lectura las mostró antes de que llegara su evento; nunca
  los cambios propios, los ecos, los borrados ni los archivados. Es un
  fundido de color sin desplazamiento, así que con
  movimiento reducido se queda tal cual (las transiciones CSS no dependen
  de `useReducedMotion`). `ListRow` expone `data-highlighted` para las
  pruebas. Una fila que otro miembro marca viaja por el mismo `layoutId`,
  sin la espera de 320 ms (esa es solo de los toques propios), y una que
  añade entra con el `Enter` de siempre y con el pulso.

Aviso aprendido en la bienvenida: cuando una raíz con `AnimatePresence`
tiene hijos `Enter` o `Stagger` con retrasos, los hijos llevan
`exit={undefined}` o la salida nunca termina.

## 6. Componentes base (`src/components/ui`)

| Componente | Para qué | Notas |
| ---------- | -------- | ----- |
| `Button` | Toda acción | Píldora. Variantes `default` (lima sobre tinta), `secondary` (pistacho), `outline`, `ghost`, `danger`, `link`. Tamaños `sm`, `touch` (por defecto), `touch-lg`, `icon-touch`, `icon-touch-lg`. `asChild` para enlaces |
| `Input` + `Field` | Campos de texto | `Field` pone etiqueta visible, ayuda (texto o un nodo, como el "Total: $ 135" con el monto en mono) o error (con `role="alert"`) y le pasa a `Input` id, `aria-describedby` y `aria-invalid` por contexto |
| `Eyebrow` | Metadatos en mayúsculas | `tone="ink"` cuando es título; `as` para la etiqueta |
| `Chip` / `CategoryChip` | Etiquetas cortas / categoría con tinte e icono | `CategoryChip interactive` es un botón con `aria-pressed` y un área táctil de 44px alrededor de sus 28px visibles; `hideIcon` quita el icono |
| `CheckCircle` | Marca visual de "hecho" | Disco con el par de acción: tinta con check lima en claro, lima con check tinta en oscuro. Solo presentación; el control accesible lo pone `ListRow` |
| `ListRow` | Fila de la lista | 56px, tachado animado, `note`, `quantity` en mono, `total` (lo que cuesta la línea, en mono, tinta 2, bajo la cantidad y alineado a la derecha como una columna de ticket; el nombre sigue recortándose y nada empuja el check de 44px), `highlighted` para el pulso remoto. El checkbox mide 44px y su etiqueta accesible es solo el nombre del ítem (el rol y `aria-checked` dicen el resto). Con `onPress` el nombre es un botón de 44px con `aria-haspopup="dialog"` (abre la hoja de edición); sin él es texto. `as` elige la raíz: `li` por defecto, `div` cuando el `li` lo pone un envoltorio de motion |
| `Section` + `SectionEmpty` | Agrupación | `thread` pone el hilo de categoría, `icon` el icono junto al título, `count` en mono. `level` 2 (por defecto, `h2` en `text-heading`) o 3 (`h3` en `text-row font-medium`): el nivel 3 es el grupo de categoría dentro de Pendientes y no lleva nombre accesible, para que diez grupos no llenen la lista de landmarks (el `h3` sigue en la navegación por encabezados) |
| `EmptyState` | Estado vacío de una sección | Ilustración en tinta 2 a la izquierda, texto a la derecha. Es una invitación a actuar |
| `Banner` | Aviso persistente | Tonos `info`, `attention`, `error`. El texto siempre en tinta; el color en icono e hilo izquierdo. Esquinas izquierdas rectas. `action` va al costado (un botón); `footer` en una línea propia debajo del texto, alineada con él, para dos botones o una pregunta (muestra en `/design`) |
| `Sheet` | Hoja flotante | Radix Dialog + Motion. `side` right, left, bottom, top. `SheetHeader`, `SheetBody`, `SheetFooter`, `SheetTitle`, `SheetDescription`. Guarda el estado abierto para animar la salida |
| `InvitationCard` | La invitación como objeto | Pistacho, `rounded-sheet`: arriba el nombre de la lista en serif, una línea de corte discontinua con muescas del color del papel, abajo el enlace en mono (`data-testid="invite-link"`, `select-all`). `link` en `null` muestra el texto de "preparando". Lo usa la hoja de compartir (`src/components/share/`) |
| `Moment` | Momento editorial | Superficie tinta, titular display con `<em>`, ilustración, acción, entrada escalonada. Pocas veces: carro vaciado, invitación |

Las primitivas accesibles vienen de Radix (`radix-ui`); el aspecto es
siempre propio y sale de los tokens. Las primitivas accesibles nuevas se
escriben directamente sobre `radix-ui` (la CLI de shadcn se puede usar con
`npx` como punto de partida, pero su salida se reestiliza antes de
mergear). Ningún componente contiene cadenas de
interfaz: todo texto viene de `src/lib/texts.ts`.

## 7. Iconos e ilustraciones

- `CategoryIcon` (`src/components/icons/category-icons.tsx`): diez
  glifos monolínea en grilla de 24, trazo 1.5px, `currentColor`. Leen a
  14px en un chip y a 20px en una sección.
- Iconos de interfaz: `lucide-react` con `strokeWidth={1.5}` (2 o 2.5 solo
  para el check y el más de la acción principal).
- Ilustraciones (`src/components/illustrations`): `EmptyBagIllustration`,
  `CartIllustration`, `FullBagIllustration` e `InvitationIllustration` (dos hojas de lista, la de adelante con un producto marcado en lima). Grilla de 120, trazo fijo de
  1.5px (`vector-effect: non-scaling-stroke`), tinta en `currentColor`; los
  únicos rellenos son el lima de la bolsa llena y el del producto marcado de
  la invitación, los dos en momentos editoriales. Se usan en tinta 2 para
  estados vacíos y en tinta inversa en los momentos.
- Icono PWA: la marca de "hecho" (círculo lima con check sobre tinta),
  en `public/icons/`. Se regenera con sharp desde fuera del proyecto.
- Wordmark: tipográfico, `font-serif text-title` con el nombre de
  `texts.app.name`. Sin SVG aparte, a propósito (decisión 6).

## 8. Primer uso

`Welcome` (`src/components/welcome/`) se muestra una vez por dispositivo
(`localStorage` `lista:welcome-seen`). Un script inline en
`src/app/(app)/layout.tsx` pone `--welcome-pending` en `<html>` antes de
hidratar y la lista queda con `visibility: hidden` (atributo
`data-welcome-hide`) hasta que la bienvenida termina; `<html>` lleva
`suppressHydrationWarning` por ese estilo inline. Termina sola a los 2,6 s
o con un toque, Enter o Escape; cualquier tecla o foco dentro cancela el
reloj, y con movimiento reducido no hay cierre automático. Al terminar el
foco pasa al campo de añadir. Si la bienvenida no llega a montarse, la
lista reaparece sola a los 6 s por una animación CSS de respaldo.

Los e2e arrancan como un dispositivo que ya la vio (`storageState` en
`playwright.config.ts`); `e2e/welcome.spec.ts` y el test de movimiento
reducido de `visual.spec.ts` lo desactivan.

### Compartir e invitación

- **Compartir** es una acción de la cabecera (`UserPlus`, junto al menú) que
  abre una hoja desde la derecha (`ShareSheet`); solo la ve el dueño de la
  lista, que es quien puede invitar. Un dueño anónimo ve primero por qué
  hace falta una cuenta y el mismo paso de correo y código del menú
  (`GuestAccount`, exportado de `account-section.tsx`); con cuenta, el
  enlace se crea al abrir la hoja y aparece en `InvitationCard`, con
  "Compartir enlace" (Web Share, si el navegador la tiene), "Copiar enlace"
  (con confirmación en una región `role="status"`; si el portapapeles falla,
  el enlace queda seleccionado) y "Armar otro enlace". Abrir la hoja otra vez
  muestra el mismo enlace mientras nadie lo use y le quede más de un día de
  vida (el que ya mandaste sigue siendo el que vale); "Armar otro enlace" es
  la forma de crear uno nuevo para la persona siguiente.
- **Pantalla de invitación** (`/invite/[token]`, `InviteScreen`): superficie
  tinta en los dos modos, titular `text-display` con `<em>`, ilustración y
  entrada escalonada (`Stagger`), con el texto abajo a 375px y como pliego
  de dos columnas desde `md`. Estados: cargando, sin conexión, válida
  (unirse), ya estás adentro, enlace propio, usada, vencida, inexistente;
  los errores de aceptar salen en un `Banner` sin perder la pantalla. El
  foco va al `h1` cuando aparece un estado. Al unirse marca la bienvenida
  como vista (`markWelcomeSeen`): la invitación ya fue su primer uso.
- **Guarda de la invitación** (`data-guard="true"` en la pantalla): si la
  lista actual de quien abre un enlace válido es suya y hay más gente en
  ella (`isSharedOwnList`), unirse a otra la dejaría atrás sin verla y sin
  que nadie más pueda sumarse (la v1 muestra una sola lista). La pantalla
  avisa y deja decidir: bajo el cuerpo, un bloque con hilo lima a la
  izquierda ("Antes de unirte", "Hay N personas más en tu lista.", qué pasa),
  "Ir a mi lista" como acción principal (lima) y "Unirme igual" como acción
  secundaria, en texto sobre la tinta. La pantalla espera a que las listas
  estén leídas antes de mostrarse válida, para no cambiar de acciones después;
  si la lectura falla, queda la invitación sin aviso. Al tocar "Unirme igual"
  el aviso queda fijo hasta que termina, aunque las listas cambien.

### Categorías y recorrido

- **Selector de categoría** (hoja de edición, `data-slot="category-picker"`):
  un `role="group"` con la etiqueta "Categoría" y un `CategoryChip
  interactive` por categoría viva, en el orden del recorrido. Los chips van
  separados 16px en las dos direcciones: cada uno extiende su área táctil 8px
  por lado y así las extensiones nunca se pisan. Mientras no se toca nada
  muestra la categoría que la lista le da al ítem (la propia, o la de
  respaldo), y sigue a la lista si cambia; Guardar manda `category_id` solo si
  se eligió otra.
- **Hoja "Recorrido"** (`RouteSheet`, `src/components/list/route-sheet.tsx`;
  la abre el botón "Ordenar el recorrido" de la cabecera de Pendientes): una
  `Sheet` desde abajo con una fila por categoría viva, también las vacías
  (Pendientes las oculta, así que acá es el único lugar para ubicarlas): hilo
  de categoría a la izquierda, icono, nombre, cuántos pendientes hay (en mono,
  solo si hay; el lector oye "2 pendientes") y dos botones `ghost` de 44px,
  "Subir “Nombre”" y "Bajar “Nombre”". Sin arrastrar. Cada toque mueve la
  categoría un lugar, optimista.
- **Movimiento.** Las filas se deslizan a su lugar con `layout="position"` y
  `transitions.base`, solo por `transform` y sin entrada propia
  (`initial={false}`); con movimiento reducido cambian de lugar sin deslizar.
  Pendientes sigue el mismo orden: los grupos se deslizan por su `layout`, sin
  pulso, y un reorden de otro miembro se anuncia sin autor ("Cambiaron el
  orden del recorrido").
- **Foco.** Al abrir, el foco va a la hoja y no a la primera flecha; al
  cerrar, vuelve al botón que la abrió (`onCloseAutoFocus`). Los botones de
  los extremos usan `aria-disabled` y no `disabled`, así el foco no se pierde
  cuando la categoría llega a un extremo (se ven atenuados y no hacen nada).
  Si al reordenar React mueve el nodo que tenía el foco y este cae al
  `body` o a la hoja, vuelve a la misma flecha de la misma categoría en su
  lugar nuevo, y nunca se lo quita a quien ya fue a otro lado.
- **Anuncio y error.** Una región `role="status"` siempre montada
  (`data-slot="route-announcement"`) dice una vez dónde quedó la categoría
  ("“Bebidas”, 3 de 9") cuando la lista propia muestra el movimiento; no se
  recalcula si otro miembro la mueve después. Si el servidor rechaza, la
  categoría vuelve y un `Banner` de error dentro de un `Collapse` lo dice, con
  botón de cerrar; los rechazos de una apertura no se vuelven a mostrar en la
  barra de añadir.

### Precio y totales

- **Hoja de edición.** Bajo cantidad y unidad: el campo de precio (la misma
  letra que los otros campos, con cifras tabulares; `inputMode="decimal"`,
  coma decimal) y la moneda. La etiqueta del campo
  sigue a la unidad escrita en la hoja ("Precio por kg", "por litro", "por
  unidad"); debajo, si la línea difiere del precio, "Total: $ 135" con el
  monto en mono. La moneda es un `RadioGroup` de Radix con dos opciones, "$"
  y "US$", estilizado con `buttonVariants` outline; la elegida va en el par
  neutro invertido (`bg-ink text-paper`: píldora tinta en claro, crema en
  oscuro), nunca en lima, que queda para la acción primaria y "hecho". El
  nombre accesible es "$, pesos uruguayos" / "US$, dólares". Guardar manda
  `estimated_price` y `currency` solo si cambiaron, y la moneda sola nunca
  para un ítem sin precio (el trigger del catálogo la tomaría como un par
  nuevo y olvidaría el último precio). El pie de la hoja (Guardar, Borrar)
  queda fijo abajo, sobre papel y con una regla de 1px, mientras el cuerpo
  se desplaza.
- **Fila.** `ListRow total`: el total de la línea bajo la cantidad, a la
  derecha y en mono (ver la tabla de componentes). `Field help` acepta un nodo,
  no solo texto: así sale "Total: $ 135" con el monto en mono.
- **Totales** (`EstimateLine`, `src/components/list/estimate-line.tsx`, con
  muestra en `/design`): al pie de Pendientes y dentro del pistacho del carro,
  "Estimado" como eyebrow y un monto por moneda en mono (`$ 1.234 · US$ 12`);
  si a algún producto le falta el precio, debajo "2 de 3 con precio". Sin
  ningún precio no hay línea. Se calcula sobre lo que cada sección muestra, así
  que el monto viaja con la fila al marcar.

### Añadir: sugerencias, frecuentes y "Lo de siempre"

La barra fija de abajo (`AddItemBar`) crece hacia arriba; se arma con piezas
existentes, sin componente nuevo en `ui` (`suggestion-list.tsx` y
`frequents-row.tsx`, en `src/components/list`).

- **Combobox.** El campo es un combobox ARIA 1.2 (`role="combobox"`,
  `aria-autocomplete="list"`, `aria-expanded`, `aria-controls`,
  `aria-activedescendant`) y siempre conserva el foco. Las opciones son su
  `listbox`, sobre el campo, en papel con reglas de 1px y sin sombra: hasta 5,
  desde el primer carácter, para la parte del nombre de lo escrito
  (`parseItemInput`). Lo que ya está pendiente no se propone para agregar:
  va primero, como "En la lista · 3" (ver abajo). Cada una lleva el icono
  de su categoría, el nombre y el último precio en mono. **La mejor queda
  pegada al campo** (la lista no salta al afinar la búsqueda) y las flechas
  siguen lo que se ve: arriba desde el campo llega primero a ella. Enter agrega
  la activa (o lo escrito, sin activa), Escape cierra, y tocar una opción
  agrega ese producto con la cantidad y la unidad de lo escrito ("2 kg tom" +
  "Tomates"), su categoría y su último precio. Tocar no mueve el foco
  (`preventDefault` en pointer y mouse down): el teclado no se cierra.
- **Frecuentes.** Con el campo vacío, una fila que se desplaza de costado
  (grupo "Frecuentes"): primero "Lo de siempre" con su cuenta (pistacho), luego
  hasta 12 productos de un toque (`outline`, con un más), que entran con la
  cantidad con que se compran (A-3, ver abajo). Píldoras de 36px con
  un área táctil de 44px (pseudo-elemento sobre el relleno vertical de la
  fila). Sin historial la fila no existe. Al escribir la reemplazan las
  sugerencias (el contenido cambia de golpe dentro del mismo `Collapse`, así
  la barra no suma las dos alturas mientras una sale).
- **"Lo de siempre"** (repaso desde `docs/improvements.md`, A-3). Solo con 2 o
  más productos habituales sin pendiente. La píldora (`aria-haspopup="dialog"`)
  abre la hoja de repaso desde abajo (`review-sheet.tsx`, con las piezas de
  `Sheet`; la misma de una lista pegada, ver abajo):
  los productos en el orden del recorrido (`inRouteOrder`), todos tildados con
  el `CheckCircle` de la lista, el icono de su categoría y la cantidad con que
  vuelven en mono. Cada fila es un `role="checkbox"` de 56px; destildada, el
  nombre pasa a tinta secundaria. "Agregar N productos" (`touch-lg`, en un pie
  fijo con regla, siempre a la vista) suma lo tildado; sin nada tildado dice
  "Nada para agregar" y queda deshabilitado. Cerrar no agrega nada, y cada
  apertura empieza todo tildado. Al agregar, la hoja se cierra, el foco vuelve
  al campo si estaba ahí al abrirla (un toque con el teclado cerrado no lo
  abre) y lo tildado entra en una escritura (`useAddItems`), cada producto
  con su cantidad, su categoría y su precio en esa base; la barra avisa
  "Agregaste N productos" (`Banner` info, sin cierre; sale cuando la hoja ya
  se fue, así el lector de pantalla lo oye) con "Deshacer" durante 8 s
  (`useUndoAdd`, una sola escritura). Una región `role="status"`
  (`data-slot="add-announcement"`) siempre montada lo lee. Un rechazo del alta
  de varios o del deshacer tiene su propio texto (`itemErrors.addMany`,
  `itemErrors.undoAdd`) y reemplaza al aviso.
- **Lista pegada** (F-2). Pegar en el campo dos productos o más en varias
  líneas, o tres o más en una ("leche, pan, 1,5 kg de papas"), no los escribe
  en el campo: abre la misma hoja de repaso, "Lista pegada", con un producto
  por línea tal como se habría escrito (`pastedList`: sin la fecha y el autor
  de WhatsApp, viñetas, numeración, casillas, emoji al principio ni marcas de
  negrita; los títulos "Súper:" fuera; "Tomates, 2 kg" es un producto; cada
  uno una vez), todos tildados con su cantidad y el icono de la categoría que
  les tocaría. Lo que ya está pendiente se ve sin círculo, en tinta secundaria,
  con "Ya está en la lista", y no se agrega. Hasta 50 por pegado; si vinieron
  más, una línea lo dice bajo la descripción. "Agregar N productos" los suma
  en una escritura, en el orden pegado, con la categoría y el precio del
  catálogo y el mismo aviso con "Deshacer". Una lista de una línea que se
  cierra sin agregar queda en el campo, como un pegado común; una de varias
  líneas se descarta. Lo que no es lista se pega como siempre. Un segundo
  toque en "Agregar" mientras la hoja sale no agrega dos veces (también en
  "Lo de siempre"). La nota que escribe "Mandar lo que falta" (" — _nota_")
  se descarta, y varias líneas con un título y un solo producto también son
  una lista: su mensaje pegado vuelve con los mismos productos (ver "Mandar lo
  que falta", abajo).
- **Ya está en la lista** (`docs/improvements.md`, A-2). Un producto pendiente
  (mismo nombre normalizado; lo del carro no cuenta) no se agrega dos veces.
  En las sugerencias, lo pendiente que coincide va primero, pegado al campo,
  con "En la lista" y su cantidad en lugar del precio. Enter con ese nombre, o
  tocar esa opción, vacía el campo sin crear otra fila y la barra avisa
  "“Leche” ya está en la lista" (`Banner` info, con "Cantidad: 3" si la
  tiene). Si las cantidades se suman (la misma unidad, o ninguna; sin
  cantidad cuenta uno), el aviso trae "Sumar 2" (lo escrito, o uno), que
  edita la fila en una escritura; si no ("2 kg" contra "3"), solo un cierre.
  Se va a los 8 s como los otros avisos y lo lee la misma región
  `add-announcement`. No es una escritura: un rechazo que llega mientras se
  ve lo tapa, y cerrarlo no cierra otros avisos. No se suma solo: dos
  personas que anotan "pan" quieren un pan, no dos.
- **Guarda del doble toque** (`use-double-tap.ts`). En la lista de
  sugerencias, en la fila de frecuentes y en los círculos de marcar de la
  lista (A-4), un segundo toque casi en el mismo lugar (menos de 24px) antes
  de 350 ms no hace nada: lo que quedó bajo el dedo después del primero puede
  ser otra opción, otra píldora, la fila siguiente (la marcada se fue al carro
  o su grupo se cerró) o la misma fila todavía en su lugar. El teclado
  (Enter, Espacio, o `event.detail === 0`) no tiene doble toque.
- **"Al carro" con deshacer** (A-4). Marcar algo deja en la barra "“Tomates”
  al carro" (`Banner` info) con "Deshacer" (`outline`, nombre accesible
  "Deshacer: devolver “Tomates” a pendientes", que empieza con lo que se ve),
  que lo devuelve a pendientes sin ir a buscarlo al carro. Es el último
  marcado desde este dispositivo, mientras su marca va al servidor o ya llegó
  (`useMutationState` de los marcados), y solo mientras siga en el carro, una
  sola vez: cerrado (a los 8 s, con Deshacer o reemplazado) o fuera del carro
  después de haber estado (desmarcado acá o por otro miembro, borrado,
  vaciado), no vuelve aunque vuelva el producto; los marcados de antes de que
  la barra se montara tampoco. Como "ya está en la lista", queda fuera del
  orden de los avisos de escrituras: un rechazo siempre le gana y cerrarlo no
  cierra nada más. No pasa por la región `add-announcement`: lo dice el
  checkbox, que conserva el foco.
- **Alto de la barra.** `useBarHeight` mide la barra con un `ResizeObserver` y
  publica su alto real en `--add-bar-measured`, que lee `pb-add-bar` en la
  página (con el alto nominal de respaldo hasta medirla). También cuenta el
  teclado de iOS (`visualViewport`, `use-keyboard-inset.ts`). Si la página
  estaba al final cuando la barra crece, un `window.scrollTo` la desplaza lo
  mismo: las últimas filas no quedan debajo, con el teclado abierto o cerrado.

### Mandar lo que falta

`SendPending` (`src/components/list/send-pending.tsx`, `docs/improvements.md`
F-3), armado con piezas existentes, sin componente nuevo en `ui`.

- **Botón.** En la cabecera de Pendientes, a la izquierda de "Ordenar el
  recorrido" y pegado a él (los dos de 44px, los iconos a 24px): `ghost`,
  `icon-touch`, icono de lucide con trazo 1.5. Con Web Share es el avión de
  papel (`Send`, "Mandar lo que falta") y abre la hoja de compartir del
  sistema con el texto; sin Web Share es `Copy` ("Copiar lo que falta") y
  copia. El nombre dice lo que hace. Sin nada pendiente no está (lo dicen los
  datos: una fila recién marcada que todavía se ve no cuenta); el de
  "Recorrido" no se mueve. Cerrar la hoja del sistema no avisa nada; otro
  fallo al compartir copia, y un segundo toque mientras la hoja del sistema
  está arriba no hace nada.
- **Aviso de copiado.** Lo da la barra de abajo, donde salen las noticias de
  la lista: `Banner` info "Copiamos lo que falta" con "Pegalo en el chat que
  quieras." y cierre, 8 s, fuera del orden de los avisos de escrituras (como
  "ya está en la lista" y "al carro": un rechazo le gana). Lo lee la región
  `add-announcement`. Toma el lugar del aviso info que tapa, que no vuelve al
  cerrarlo. La lista se lo pasa a la barra por un aviso guardado por
  `QueryClient` (`useLastCopy`), sin props; una copia de antes de que la
  barra se montara no se avisa.
- **Copiar a mano.** Si tampoco se puede copiar, una `Sheet` desde abajo, "Lo
  que falta", con la explicación y el texto como un mensaje citado: regla de
  2px `rule-strong` a la izquierda, `whitespace-pre-wrap`, ya seleccionado y
  con `select-all` (un toque lo vuelve a seleccionar entero). El foco va a la
  hoja, no a su cierre; al cerrarla vuelve al botón.
- **El texto** (`pendingText`, `src/lib/domain/pending-text.ts`), pensado para
  WhatsApp y legible en cualquier chat, sin precios: "Lo que falta:", y por
  categoría, en el orden del recorrido, el nombre en negrita de WhatsApp
  terminado en ":" ("*Frutas y verduras:*") y un producto por línea con la
  viñeta de lista de WhatsApp: "- Tomates 2 kg", "- Leche ×3 — _descremada_"
  (la cuenta tras "×", la nota al final en cursiva tras una raya, y con ella
  lo que el campo de agregar no leería: una unidad que no conoce, una cuenta
  de más de 999). Un solo grupo va sin título de categoría. Pegado en el campo vuelve con los mismos
  productos y cantidades (F-2).
- Lo común con la hoja de compartir (`useCanShare`, `shareOrCopy`,
  `selectText`) está en `src/components/share/web-share.ts`.

### Miembros, avisos y "traer lo de otra lista"

- **Hoja de la cabecera para todos.** La acción es `UserPlus` si el dueño
  está solo y `Users` si la lista es compartida o el usuario no es el dueño
  (nombre accesible "Compartir lista" para el dueño, "Ver quién comparte la
  lista" para un miembro). Es la misma hoja (`ShareSheet`, que vuelve a
  empezar, cerrada, cuando cambia la lista de la pantalla para la misma
  persona). La hoja y su acción **siguen montadas mientras las listas cargan
  o se reemplazan**: dentro dice "Cargando tu lista…" (`role="status"`, sin
  más). Pasa con la hoja abierta al entrar a una cuenta que ya existe desde
  ella (cambia el usuario y sus listas aún no están leídas): la hoja es el
  mismo nodo y, cuando aparece la lista de la cuenta, sigue el aviso
  "Listo, tu lista quedó guardada" con su invitación. Al salir de la lista,
  la hoja conserva lo que mostraba mientras se desvanece. Un miembro ve
  solo `MembersSection`; el dueño ve, si hay alguien más, primero los
  miembros y debajo "Sumar a alguien más" con la invitación (el paso de
  invitar queda en un lugar fijo: que alguien se una no lo rehace).
- **`MembersSection`** (`src/components/share/members-section.tsx`): se arma
  con piezas existentes, sin componente nuevo en `ui`. `Section` con conteo
  y filas separadas por reglas de 1px y de 56px como mínimo: "Vos" o el
  correo en `text-row` y debajo, en `text-label` tinta 2, "Dueño" y el
  correo propio ("Dueño · ana@correo.com"); "Sin cuenta" para un anónimo.
  Sin tarjetas. Se actualiza en vivo por Realtime.
- **Confirmación ligera** (`useConfirm` en `members-section.tsx`, el mismo
  patrón del borrado de la hoja de edición, con los mismos 350 ms y 4 s; si
  aparece un tercer uso, se extrae a `src/components/ui`): el primer toque en "Sacar" (dueño,
  en la fila del miembro) o en "Salir de la lista" (miembro, al pie) pide
  confirmación: el botón pasa a "Tocá otra vez" sobre `--danger-bg` con
  texto en tinta, la fila dice qué pasa ("Va a dejar de ver la lista.") y
  el botón queda armado (`data-armed`) a los 350 ms. Un solo objetivo a la
  vez. Una región `role="status"` siempre montada lee la pregunta. Los dos
  gestos son optimistas: la persona sale de la lista al instante y, si el
  servidor rechaza, vuelve con un `Banner` de error. El dueño no tiene
  "Salir".
- **Foco al perder la lista.** La hoja desde la que se salió (o que estaba
  abierta cuando sacaron a la persona) se cierra sin devolver el foco a su
  botón: `ShareSheet` lo retiene (`onCloseAutoFocus`) y pide
  `requestNoticeFocus`; `MembershipNotices` lleva el foco al botón "Cerrar
  aviso" apenas hay aviso (también si salir falló). Es el mismo patrón del
  momento de carro vaciado: la región `role="status"` dice qué pasó y el
  nombre del botón solo no lo diría. Ese momento tiene además "Deshacer"
  (A-4), un `ghost` callado sobre tinta como "Ahora no" de la invitación, al
  lado de "Volver a la lista": devuelve al carro lo que esa vaciada archivó
  (`useRestoreCart`, una escritura), y como algo vuelve al carro el momento
  termina y el foco va a "Vaciar el carro". Si el servidor lo rechaza, lo
  vaciado se vuelve a ir, el momento vuelve con su "Deshacer" para probar de
  nuevo y la barra avisa "No volvió lo del carro". La petición caduca a los 15 s, para que
  un aviso tardío nunca le robe el foco a quien ya fue a otro lado.
- **Avisos de lista perdida** (`MembershipNotices`, arriba de la lista,
  encima de "Pendientes"): `Banner` con botón de cerrar, sin cierre
  automático porque es la única explicación de por qué cambió la lista. Tres
  casos: `left` (info, "Saliste de la lista"), `removed` (cítrico, "Ya no
  estás en esa lista": neutro a propósito, también cubre salir desde otro
  dispositivo y una lista que dejó de existir) y `leave_failed` (error,
  `role="alert"`). Entran y salen con `Collapse`. La frase se lee por una
  región `role="status"` siempre montada (`data-slot="membership-announcement"`),
  porque el rol de un banner que aparece con su texto no se anuncia de
  forma fiable.
- **Traer lo de otra lista** (`BringOver`, mismo lugar, bajo los avisos): un
  `Banner` info con `footer` y dos acciones, un bloque de la pantalla y no
  una hoja, porque quien acaba de llegar a una lista quiere verla y la
  respuesta puede esperar. Un componente con dos casos (`data-kind`):
  `leftover`, lo que quedó atrás al unirse a una lista compartida ("N cosas
  en tu lista anterior": "Traerlas acá" o "Descartarlas"; si era una lista
  ajena, "Copiarlas acá" o "Salir de esa lista", y si está vacía solo
  salir), y `carry-over`, lo que el dispositivo tenía sin cuenta al entrar a
  una cuenta existente ("N cosas que anotaste en este dispositivo sin
  cuenta": "Traerlas" o "Dejarlas afuera"). Aparece una vez y desaparece al
  responder; mientras corre deshabilita los dos botones y el elegido cambia
  de texto ("Trayendo…"); un error sale en un `Banner` error debajo y deja
  los botones para reintentar. Una lista propia vacía se fusiona sin
  preguntar.

### Productos guardados (menú)

`ProductsSection` (`src/components/menu/products-section.tsx`, M-5) va en
la hoja del menú debajo de "Cuenta", separada por una regla: lo que el
catálogo de la lista recuerda de cada producto agregado alguna vez.

- Título `text-heading` ("Productos guardados"), una línea de explicación en
  tinta secundaria y un campo "Buscar producto" (`Field` + `Input`,
  `type="text"` con `enterKeyHint="search"`: sin el botón de borrar nativo
  del navegador). La búsqueda sigue la regla de las sugerencias (el comienzo
  del nombre o de una palabra posterior, sin importar tildes ni mayúsculas).
- Filas como las de miembros: 56px de alto con regla inferior, el icono de
  la categoría que el catálogo recuerda, el nombre y debajo cuántas veces se
  agregó ("Agregado 4 veces"), en orden alfabético.
- "Olvidar" (`danger`) con la confirmación ligera del sistema
  (`src/components/use-confirm.ts`, la misma de "Sacar" a un miembro): el
  primer toque pasa a "Tocá otra vez" sobre el fondo de peligro y la segunda
  línea dice "Deja de sugerirse." (corta, para que la fila no crezca y el
  segundo toque caiga en el mismo botón); el segundo toque, pasados 350 ms,
  olvida. La pregunta se lee en una región `role="status"` siempre montada.
  Optimista: la fila sale al instante; si el servidor rechaza, vuelve y lo
  dice un `Banner` error. El foco, si estaba en el botón que se fue, pasa
  al título de la sección (`tabIndex={-1}`), no al buscador, que en el
  teléfono abriría el teclado.
- No está en las sugerencias mismas: una opción de un `listbox` no puede
  tener un botón propio (sus hijos son presentacionales, y axe lo marca
  como `nested-interactive`).

## 9. Accesibilidad

- Contraste AA garantizado por test para cada par de tokens.
- Objetivos táctiles de 44px como mínimo; 52px para la acción principal.
- Foco visible global con `:focus-visible` en el color de foco del modo,
  y lima dentro de la superficie inversa (`surface-inverse`).
- `prefers-reduced-motion` respetado por `MotionProvider` y por los
  tokens (`--motion-shift` y `--motion-stagger` a 0).
- Etiquetas visibles en los campos, errores asociados por
  `aria-describedby`, hojas con `role="dialog"` de Radix, filas con
  `role="checkbox"` y `aria-checked`.
- Foco que no se pierde cuando el elemento que lo tenía desaparece: tras
  marcar, el foco sigue a la fila hasta su checkbox en la nueva sección (si
  no se había movido a otro lado); la hoja de edición lo devuelve al nombre
  de la fila, o al campo de añadir si la fila se borró; el momento de carro
  vaciado lleva el foco a su acción y, si se cierra porque algo vuelve al
  carro, lo devuelve a "Vaciar el carro".
- Los avisos de escrituras rechazadas son banners `role="alert"` (el tono
  `error` de `Banner`) sobre el campo de añadir, con botón para cerrarlos.
- Los cambios de otros miembros no se comunican solo con color: una
  región `role="status"` (cortés, siempre montada, oculta a la vista) dice
  una frase por ráfaga de cambios, sin autor ("Agregaron “Leche”", "Sacaron
  2 productos de la lista"), y nunca los cambios propios. Sus textos viven
  en `texts.remoteChanges`.
- Inputs de 16px como mínimo para evitar el zoom de iOS.

## 10. Pruebas

- `npm test`: tokens de color y motion contra el CSS, contraste AA,
  conversión oklch.
- `npm run test:e2e`: `visual.spec.ts` captura la lista, la lista sin
  conexión (Auth cortado con `page.route`), `/design` y la página sin
  conexión en claro y oscuro, la hoja del menú y la bienvenida
  con movimiento reducido, y comprueba invariantes deterministas (fondo
  igual al token papel, `color-scheme` correcto, sin desbordamiento
  horizontal a 375px, hoja sobre papel, filas sin translate con movimiento
  reducido), familia, tamaño y peso computados en wordmark, botón y
  encabezado, la media query real del modo y 44px mínimos en todo control
  de la lista. No compara píxeles: las fuentes se rasterizan distinto en
  cada sistema. Las capturas quedan en `test-results/` y suben como
  artefacto en CI.
- `e2e/list.spec.ts`, `e2e/phase-2a.spec.ts` y `e2e/phase-2b.spec.ts`
  ejercitan la lista contra el Supabase local y necesitan `E2E_SUPABASE=1`
  y `npm run db:start`; sin eso se saltean. En CI corren siempre: el job
  "E2E" levanta el stack local y exporta sus claves antes del build.
  Adjuntan capturas a 375px en claro y oscuro (lista, lista agrupada,
  momento de carro vaciado, aviso de rechazo, hoja de edición y
  confirmación de borrado). `phase-2b.spec.ts` abre dos contextos (dos
  miembros de una misma lista), mide cada cambio de uno a otro (menos de
  1 s, también con escrituras en cola mientras el otro escribe), comprueba
  con un `MutationObserver` que solo pulsan las filas del otro miembro y
  que las propias no parpadean, comprueba qué se les dice a los lectores
  de pantalla (la frase exacta al otro miembro y nada al que hizo el
  cambio) y adjunta la fila en pleno pulso.
  `e2e/phase-2c.spec.ts` hace lo mismo sin atajos: una persona convierte su
  cuenta con el código que llega a Mailpit, comparte el enlace, otra lo abre
  en un dispositivo que nunca vio la app, se une y los cambios van en los dos
  sentidos con los mismos criterios; además prueba el enlace usado, el
  vencido, el inexistente y el propio, y las acciones de compartir. Los
  helpers comunes están en `e2e/two-members.ts`.
  `e2e/phase-2c-members.spec.ts` sigue con los miembros, sin atajos y en
  claro y oscuro a 375px: el dueño ve aparecer a quien se une sin recargar,
  lo saca con la confirmación ligera y esa persona pierde la lista en menos
  de un segundo (aviso neutro, lista propia nueva, y lo que el dueño agrega
  después no le llega); un miembro sale y el dueño lo ve sin recargar; lo
  que quedó atrás se trae o se descarta (el otro lo ve llegar); y una cuenta
  en otro dispositivo carga su lista y ofrece lo que ese dispositivo tenía
  (traerlo o dejarlo afuera). Adjunta capturas de la hoja de miembros del
  dueño y del miembro, la confirmación de sacar y de salir, los avisos de
  "removed" y "left", las dos preguntas de traer ítems y el aviso del
  formulario de código ante una cuenta existente. Los helpers de compartir
  (hojas, capturas, código de Mailpit, dos personas en una lista por la
  invitación real) están en `e2e/sharing.ts`.
  Esa suite también cubre: el pulso y el anuncio de "traer lo de otra lista"
  (en la pantalla del dueño las filas que llegan pulsan y se leen en una
  frase; las copias de quien las trae no pulsan ni parpadean), salir con la
  respuesta del servidor rechazada (`DELETE` de `list_members` con 403: avisa
  y la lista vuelve, con el foco en el aviso), a quien sacan con su hoja
  abierta, entrar a una cuenta existente desde la hoja de compartir (mismo
  nodo, estado de carga, aviso conservado) y la guarda de la invitación.
  `e2e/supabase-admin.ts` usa la clave secreta del stack local solo del
  lado de Node (nunca desde la página) para dejar ítems en otras
  categorías, para dejar el escenario armado sin pasar por la interfaz.
- `e2e/phase-3a.spec.ts` y `e2e/phase-3a-members.spec.ts`: cambiar la
  categoría de un ítem en su hoja (y que el catálogo lo aprenda), reordenar
  desde "Recorrido" con Pendientes siguiéndolo, un movimiento rechazado (la
  categoría vuelve y la hoja lo dice) y, con movimiento reducido, que las filas
  y los grupos no se trasladen; entre dos miembros, que el reorden y el cambio
  de categoría lleguen en menos de 1 s. `e2e/categories-db.spec.ts` prueba
  contra la base la RPC `move_category` (los dos cambios de fila, el reintento
  idempotente, los casos sin efecto, los permisos de miembros y de ajenos, y
  dos miembros a la vez con posiciones 0..n-1). `e2e/catalog-db.spec.ts` prueba
  que el catálogo guarda el último precio con la unidad en que se dio, y la
  última cantidad con la suya, aparte (A-3), también al fusionar listas.
- `e2e/phase-3b.spec.ts` y `e2e/phase-3b-members.spec.ts`: un precio por kilo
  en dólares, los totales, el carro y el catálogo; el nombre largo que sigue
  recortándose sin empujar el check; "Guardar" y "Borrar" a la vista mientras el
  formulario se desplaza; y entre dos miembros, que un cambio de precio y de
  moneda llegue en menos de 1 s.
- `e2e/phase-3c.spec.ts` y `e2e/phase-3c-members.spec.ts`: las sugerencias,
  los frecuentes y "Lo de siempre" (el repaso, una sola petición para agregar y otra
  para deshacer), el alto de la barra, y entre dos miembros el criterio de
  `phase-2b` con N filas (menos de 1 s, pulso solo en el otro, una frase para
  su lector de pantalla). Con capturas a 375px en claro y oscuro.
- `e2e/a2-duplicates.spec.ts`: un producto pendiente no se agrega dos veces,
  el aviso con su cantidad y "Sumar" (una sola edición), la opción "En la
  lista" de las sugerencias, unidades que no se suman, y lo del carro que se
  agrega como siempre. Con capturas a 375px en claro y oscuro.
- `e2e/a3-usuals.spec.ts`: el repaso de "Lo de siempre" (orden del
  recorrido, cantidades, filas de 44px o más, el botón a la vista), destildar
  y agregar el resto en una petición con su cantidad y su precio por kilo, un
  frecuente que entra con su cantidad, y cerrar sin agregar. Con capturas a
  375px en claro y oscuro.
- `e2e/f2-paste.spec.ts`: una lista pegada abre el repaso (lo pendiente se
  ve y no se agrega), lo tildado entra en una sola petición con su categoría
  y su precio, un doble toque en "Agregar" agrega una vez, y una lista de una
  línea cerrada sin agregar queda en el campo.
  Con capturas a 375px en claro y oscuro.
- `e2e/f3-share-text.spec.ts`: "Mandar lo que falta" con Web Share simulada
  (`addInitScript`): la hoja del sistema recibe el texto exacto (recorrido,
  "Otros" al final, cantidades, la nota, sin el carro), cerrarla no avisa, el
  texto pegado en el campo marca todo como "Ya está en la lista" y sin nada
  pendiente el botón no está. Sin Web Share: copia (el portapapeles tiene el
  texto), la barra avisa y se cierra, y con el portapapeles rechazado la hoja
  muestra el texto seleccionado y al cerrarla el foco vuelve al botón. Con
  capturas a 375px en claro y oscuro.
- `e2e/m5-forget.spec.ts`: "Productos guardados" en el menú (orden, cuántas
  veces, la búsqueda), olvidar un producto mal escrito con dos toques (un
  solo DELETE) y que deje de sugerirse, también tras recargar. Con capturas
  a 375px en claro y oscuro. `e2e/catalog-db.spec.ts` prueba contra la base
  que un miembro puede olvidar, que alguien de afuera no, y que el catálogo
  sigue sin poder escribirse fuera de los triggers.
- `e2e/a4-undo.spec.ts`: el aviso "al carro" con su Deshacer (una sola
  escritura), dos toques rápidos en el mismo círculo que marcan uno solo, el
  Deshacer del momento de carro vaciado (lo vaciado vuelve, también tras
  recargar; rechazado, el momento vuelve), y entre dos miembros que lo que vuelve le llega al otro en menos
  de 1 s. Con capturas a 375px en claro y oscuro.
- `src/lib/utils.test.ts`: `cn` conoce las escalas del sistema (roles
  tipográficos, táctiles, radios, sombra, curva, duración). Sin esa
  configuración borra `text-label` cuando sigue un `text-ink`.
- Verificación manual obligatoria antes de cada PR visual: renderizado a
  375px en claro y oscuro (y la coreografía si hay motion).

## 11. Cómo extender

**Un token nuevo.** Añadirlo en `globals.css` en las dos paletas (claro y
oscuro) o en los roles derivados, exponerlo en `@theme inline` para tener
clase de Tailwind, y si es un hex de paleta, añadirlo a `tokens.ts` y a
`contrastPairs` con el par sobre el que se usa. `npm test` falla hasta que
todo coincida y cumpla AA. Mostrarlo en `/design`.

**Un componente nuevo.** Va en `src/components/ui`, sin cadenas literales
(textos en `texts.ts`), con tokens y clases del sistema, estados hover /
pressed / foco / deshabilitado / inválido donde apliquen, y su muestra con
estados en `/design`. Si anima, usa las primitivas de motion o las clases
de duración y curva, solo `transform` y `opacity`, y se prueba con
movimiento reducido. Si viene de Radix, el aspecto se reemplaza entero.

**Un icono o ilustración nueva.** Misma grilla y trazo que los existentes,
`currentColor`, sin rellenos salvo el lima en momentos editoriales. Se
revisa renderizado a los tamaños reales de uso antes de abrir el PR.

**Un texto nuevo.** En `texts.ts`, en voseo rioplatense (ADR 0007).

## 12. Avisos de entorno

- `next dev` con Turbopack puede servir CSS viejo tras editar
  `globals.css` o tras correr `next build` con el dev server abierto. Si
  una regla no aparece, parar la preview, borrar `.next/dev` y relanzar.
  Correr los e2e locales antes del build.
- `npm run typecheck` ejecuta `next typegen` primero: los tipos de rutas
  (`LayoutProps`) solo existen después.
