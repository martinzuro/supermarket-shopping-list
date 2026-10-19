# Sistema de diseño: referencia de implementación

Qué existe en el código, cómo se usa y cómo se extiende. La visión y las
decisiones están en [DESIGN_DIRECTION.md](DESIGN_DIRECTION.md) y en el
[ADR 0008](decisions/0008-design-direction.md); esto es el mapa para
construir con ellas. La página interna `/design` muestra todo renderizado.

Estado: construido entre el 2026-10-17 y el 2026-10-18 en los PR 13 a 20.

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

Tres capas en `globals.css`: paleta cruda por modo, roles semánticos y
alias de shadcn (solo para código heredado; no usar en código nuevo).

### Paleta (clase de Tailwind entre paréntesis)

| Token | Claro | Oscuro | Uso |
| ----- | ----- | ------ | --- |
| `--paper` (`bg-paper`) | `#f6f3ec` | `#121814` | Fondo base. Nunca blanco ni negro puros |
| `--paper-2` (`bg-paper-2`) | `#dce9c8` | `#1f2b22` | Pistacho: carro, hojas, agrupaciones, botón secundario |
| `--ink` (`text-ink`) | `#1b2a1f` | `#eeebe2` | Texto principal |
| `--ink-2` (`text-ink-2`) | `#56655a` | `#9ba69c` | Metadatos, eyebrows, cuerpo secundario, borde de campo |
| `--ink-3` (`text-ink-3`) | `#7f8c82` | `#6b776e` | Solo decorativo o deshabilitado (3:1) |
| `--forest` | `#2f4a3a` | `#8fb89b` | Marca, foco en claro, hover de la acción primaria |
| `--lime` | `#c9f04a` | `#c9f04a` | Acción primaria y estado "hecho". Nunca como fondo de texto claro |
| `--on-lime` | `#1b2a1f` | `#1b2a1f` | El único texto permitido sobre lima |
| `--citrus` / `--citrus-text` | `#f26b1d` / `#b8480a` | `#ff8a47` / `#ff9a62` | Atención, cambios de otros. El `-text` es el que cumple 4.5:1 |
| `--tomato` / `--tomato-text` | `#d9432b` / `#b5341f` | `#f06a52` / `#f57f6a` | Único rojo. Igual: `-text` para texto |
| `--inverse-bg` / `--inverse-fg` / `--inverse-fg-2` | tinta / marfil | marfil / tinta | Superficie inversa de los momentos editoriales |

### Roles derivados

| Token | Valor | Uso |
| ----- | ----- | --- |
| `--rule` (`border-rule`) | tinta al 12% | Toda línea de 1px. Es el separador por defecto, en lugar de sombras |
| `--rule-strong` | tinta al 24% | Reglas que deben verse más |
| `--paper-hover` / `--paper-pressed` | tinta al 6% / 10% sobre papel | Hover y pressed de superficies |
| `--field-border` | `--ink-2` | Borde de campos (3:1 garantizado) |
| `--action-bg` / `--action-fg` | tinta / lima en claro, lima / tinta en oscuro | Botón primario |
| `--focus` | bosque en claro, lima en oscuro | Anillo de foco global (`:focus-visible`, 2px, offset 2px) |
| `--remote-pulse` | cítrico al 22% | Pulso de una fila que cambió otro miembro |
| `--attention-bg` / `--danger-bg` | cítrico / tomate al 10% sobre papel | Fondos de aviso. El texto va en tinta; el color en icono e hilo |
| `--scrim` | `rgb(27 42 31 / 0.4)` | Velo detrás de hojas, oscuro en ambos modos |
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
| `text-display` | 40 → 72px | −4% | serif | Titulares editoriales, bienvenida, momentos |
| `text-title` | 28 → 40px | −2.5% | serif | Wordmark en cabecera, títulos de página |
| `text-heading` | 20 → 24px | −1% | sans 500 | Encabezados de sección, títulos de hoja |
| `text-row` | 17 → 18px | 0 | sans | Filas de la lista |
| `text-body` (por defecto en `body`) | 15 → 16px | 0 | sans | Cuerpo |
| `text-label` | 13px | 0 | sans 500 | Botones, etiquetas, chips |
| `text-eyebrow` o utilidad `eyebrow` | 11 → 12px | +6% | sans 500, mayúsculas, tinta 2 | Metadatos |

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
- Superficies: papel (base), pistacho (`bg-paper-2`), tinta inversa
  (`bg-inverse-bg text-inverse-fg`). Sin más niveles.
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
| `--motion-shift` | 8px, 0 con movimiento reducido | Desplazamiento de las entradas |

Primitivas en `src/components/motion` (Motion for React, ADR 0009):

- `MotionProvider` en el layout raíz: `reducedMotion="user"` y transición
  base. Con movimiento reducido desaparecen desplazamientos y cambios de
  altura; quedan los fundidos.
- `Enter` (entrada suelta, `delay` opcional), `Stagger` + `StaggerItem`
  (listas coreografiadas), `Collapse` (bloques que aparecen y desaparecen,
  como el banner de conexión).
- Transiciones y variantes reutilizables: `transitions`, `enterVariants`.

Reglas: solo `transform` y `opacity` en interacciones frecuentes; las
transiciones CSS de los componentes usan las clases de duración y curva;
sin scroll suavizado ni secuestro de scroll; sin bucles visibles en la
lista. Las coreografías clave están descritas en DESIGN_DIRECTION.md,
sección 8.

Aviso aprendido en la bienvenida: cuando una raíz con `AnimatePresence`
tiene hijos `Enter` o `Stagger` con retrasos, los hijos llevan
`exit={undefined}` o la salida nunca termina.

## 6. Componentes base (`src/components/ui`)

| Componente | Para qué | Notas |
| ---------- | -------- | ----- |
| `Button` | Toda acción | Píldora. Variantes `default` (lima sobre tinta), `secondary` (pistacho), `outline`, `ghost`, `danger`, `link`. Tamaños `sm`, `touch` (por defecto), `touch-lg`, `icon-touch`, `icon-touch-lg`. `asChild` para enlaces |
| `Input` + `Field` | Campos de texto | `Field` pone etiqueta visible, ayuda o error (con `role="alert"`) y le pasa a `Input` id, `aria-describedby` y `aria-invalid` por contexto |
| `Eyebrow` | Metadatos en mayúsculas | `tone="ink"` cuando es título; `as` para la etiqueta |
| `Chip` / `CategoryChip` | Etiquetas cortas / categoría con tinte e icono | `CategoryChip interactive` es un botón con `aria-pressed` para el selector; `hideIcon` quita el icono |
| `CheckCircle` | Marca visual de "hecho" | Solo presentación; el control accesible lo pone `ListRow` |
| `ListRow` | Fila de la lista | 56px, checkbox accesible de 44px, tachado animado, `note`, `quantity` en mono, `highlighted` para el pulso remoto, `onPress` para editar |
| `Section` + `SectionEmpty` | Agrupación | `thread` pone el hilo de categoría, `icon` el icono junto al título, `count` en mono |
| `EmptyState` | Estado vacío de una sección | Ilustración en tinta 2 a la izquierda, texto a la derecha. Es una invitación a actuar |
| `Banner` | Aviso persistente | Tonos `info`, `attention`, `error`. El texto siempre en tinta; el color en icono e hilo izquierdo. Esquinas izquierdas rectas |
| `Sheet` | Hoja flotante | Radix Dialog + Motion. `side` right, left, bottom, top. `SheetHeader`, `SheetBody`, `SheetFooter`, `SheetTitle`, `SheetDescription`. Guarda el estado abierto para animar la salida |
| `Moment` | Momento editorial | Superficie tinta, titular display con `<em>`, ilustración, acción, entrada escalonada. Pocas veces: carro vaciado, invitación |

Las primitivas accesibles vienen de Radix (`radix-ui`); el aspecto es
siempre propio y sale de los tokens. Ningún componente contiene cadenas de
interfaz: todo texto viene de `src/lib/texts.ts`.

## 7. Iconos e ilustraciones

- `CategoryIcon` (`src/components/icons/category-icons.tsx`): diez
  glifos monolínea en grilla de 24, trazo 1.5px, `currentColor`. Leen a
  14px en un chip y a 20px en una sección.
- Iconos de interfaz: `lucide-react` con `strokeWidth={1.5}` (2 o 2.5 solo
  para el check y el más de la acción principal).
- Ilustraciones (`src/components/illustrations`): `EmptyBagIllustration`,
  `CartIllustration`, `FullBagIllustration`. Grilla de 120, trazo fijo de
  1.5px (`vector-effect: non-scaling-stroke`), tinta en `currentColor`; el
  único relleno es el lima de la bolsa llena. Se usan en tinta 2 para
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
o con un toque, Enter o Escape.

Los e2e arrancan como un dispositivo que ya la vio (`storageState` en
`playwright.config.ts`); `e2e/welcome.spec.ts` y el test de movimiento
reducido de `visual.spec.ts` lo desactivan.

## 9. Accesibilidad

- Contraste AA garantizado por test para cada par de tokens.
- Objetivos táctiles de 44px como mínimo; 52px para la acción principal.
- Foco visible global con `:focus-visible` en el color de foco del modo.
- `prefers-reduced-motion` respetado por `MotionProvider` y por los
  tokens (`--motion-shift` y `--motion-stagger` a 0).
- Etiquetas visibles en los campos, errores asociados por
  `aria-describedby`, hojas con `role="dialog"` de Radix, filas con
  `role="checkbox"` y `aria-checked`.
- Inputs de 16px como mínimo para evitar el zoom de iOS.

## 10. Pruebas

- `npm test`: tokens de color y motion contra el CSS, contraste AA,
  conversión oklch.
- `npm run test:e2e`: `visual.spec.ts` captura la lista, `/design` y la
  página sin conexión en claro y oscuro, la hoja del menú y la bienvenida
  con movimiento reducido, y comprueba invariantes deterministas (fondo
  igual al token papel, `color-scheme` correcto, sin desbordamiento
  horizontal a 375px, hoja sobre papel, filas sin translate con movimiento
  reducido). No compara píxeles: las fuentes se rasterizan distinto en
  cada sistema. Las capturas quedan en `test-results/` y suben como
  artefacto en CI.
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
