# Referencias de diseño

Análisis de las cinco referencias obligatorias y aprendizajes aplicables al
proyecto. Fecha del análisis: 2026-10-17.

## Método y límites

Las cinco páginas se revisaron en el navegador integrado de Claude Code con
viewport emulado de 1440×900 (desktop) y 375×812 (móvil). Para cada una se
tomaron capturas estáticas a lo largo del scroll y se inspeccionaron los
estilos computados: tipografías cargadas, tokens CSS declarados en `:root`,
colores de fondo y texto, radios, duraciones de transición, presencia de
reglas `prefers-reduced-motion` y librerías detectables en el DOM.

Lo que **sí** se pudo verificar: composición, tipografía, paleta, sistema de
grilla, jerarquía, comportamiento responsive y los estados de animación que
quedaron registrados entre capturas consecutivas (por ejemplo, un objeto 3D
que cambia de ángulo al hacer scroll, o un preloader).

Lo que **no** se pudo verificar y por tanto no se afirma: estados hover,
cursores personalizados, transiciones entre páginas en movimiento,
velocidad y curvas reales de las animaciones, sonido. Donde una librería de
transición está presente se indica como dato técnico, no como observación
de la animación.

Limitación específica: **landonorris.com en móvil** muestra una pantalla
de bloqueo "Please rotate your device, this is a vertical drive" incluso con
orientación portrait emulada. Su versión móvil no se pudo ver. El texto del
DOM sugiere interacciones propias ("tap to lock", "back to scroll") que no
se verificaron.

---

## 1. landonorris.com

Sitio personal de un piloto de F1. Construido en Webflow por el estudio
Off+Brand, con Lenis para scroll suavizado y 21 elementos `canvas` para
efectos propios. Cero reglas de `prefers-reduced-motion`.

### Identidad y dirección de arte

- Dos mundos cromáticos que se alternan por sección: crema cálido y verde
  oscuro casi negro, con lima eléctrico como único acento. Tokens
  declarados: crema `#efefe5`, blanco cálido `#f4f4ed`, negro `#111112`,
  verde oscuro `#282c20`, lima `#d2ff00`, naranja `#ff6b00`.
- Textura de fondo con curvas topográficas finas, visible en crema y en
  verde oscuro. Da profundidad sin usar sombras ni degradados.
- La firma manuscrita en lima aparece como gesto gráfico sobre fotografía y
  texto. Es un elemento de identidad, no decoración.
- Retrato recortado sobre fondo crema en el hero, con la navegación mínima
  en las esquinas.

### Tipografía y jerarquía

- Una sans variable (Mona Sans, 200 a 900) para todo, más una display
  (Brier) para citas en serif. La serif aparece solo en momentos
  editoriales: citas cortas en verde oscuro sobre crema.
- Escala declarada en tokens: h1 4rem, h2 4.5rem, "impact" 7.94rem,
  eyebrow 0.58rem. Los eyebrows son microetiquetas en mayúsculas sobre cada
  foto, tipo pie de revista ("THE PRIZE GIVING 2019").
- Titulares en mayúsculas condensadas a tamaño de pantalla completa, en una
  banda horizontal que parece un marquee.

### Layout y espaciado

- Contenedor fluido `clamp(992px, 100vw, 1920px)` con padding 1.25 a 2rem
  y gap base 1.25rem. Padding de sección 3.5rem más gaps.
- Composición editorial asimétrica: fotos de distintos tamaños en una
  grilla con mucho aire, texto en columnas estrechas, citas sueltas.
- Radios declarados en tres pasos: 1rem, 3rem, 6.25rem (píldora). Los
  botones de navegación son píldoras lima con icono.

### Motion

- Tokens globales de movimiento: duración por defecto `0.75s` y curva
  `cubic-bezier(0.65, 0.05, 0, 1)`. Es una curva con arranque lento y
  frenado largo, típica de la sensación "premium".
- Entre capturas, el paso de hero crema a sección verde oscuro ocurre con
  la firma en lima superpuesta a una foto, lo que indica una transición de
  sección coreografiada. No se verificó la animación en sí.

### Responsive y navegación

- Navegación fija con logo a la izquierda y dos píldoras a la derecha.
- Móvil: no verificable (ver límites).

### Qué aprender

- Dos modos cromáticos que alternan por sección dan ritmo sin cambiar el
  sistema. Para la app: la lista en claro y los momentos editoriales en
  oscuro, o al revés.
- Un acento único y saturado (lima) usado con avaricia vale más que una
  paleta amplia.
- Tokens de motion globales (una duración, una curva) garantizan
  consistencia. Adoptar la idea, no los valores: 0.75s es demasiado para
  una interacción frecuente.
- Microetiquetas en mayúsculas como sistema de metadatos editoriales.
- Qué no copiar: la ausencia de soporte a movimiento reducido y el
  bloqueo por orientación en móvil.

---

## 2. mindmarket.com

Agencia de investigación de mercado. Astro en Netlify, Lenis para scroll y
Swup para transiciones entre páginas. Una regla de `prefers-reduced-motion`.

### Identidad y dirección de arte

- Color como personalidad: hero en verde manzana, página en crema cálido,
  footer en amarillo limón, botones en amarillo o coral. Texto siempre en
  carbón `#2c2e2a`, nunca negro puro.
- Ilustración vectorial plana de personajes grandes, con paleta propia
  (coral, azul, amarillo, lila, verde) que ocupa el espacio de la
  fotografía. Es la pieza que hace el sitio reconocible.
- Preloader: el logo (una "m" de trazo continuo en verde) aparece sobre
  crema antes del hero. Se observó como estado estático.

### Tipografía y jerarquía

- Una sola familia (Inter) en tres pesos (400, 500, 700). Toda la
  personalidad tipográfica viene del tamaño y el tracking: h1 de 140px con
  letter-spacing −6% y peso 500. El cuerpo grande también lleva tracking
  negativo (29.75px, −1.8px).
- Jerarquía por tamaño, no por cambio de fuente. Titular, subtítulo y
  cuerpo son la misma voz a tres volúmenes.

### Layout y espaciado

- Grilla de 6 columnas con gutter variable. Los bloques de texto van en
  tarjetas blancas de radio grande (~24px) que flotan sobre el paisaje
  ilustrado. Son pocas tarjetas y grandes; no hay rejilla de cards.
- Sección de cifras: números enormes en azul dentro de tarjetas blancas
  con un icono circular en la esquina, y una tarjeta verde con check. Las
  tarjetas se solapan ligeramente.
- Footer amarillo con "Let's Connect" a tamaño de pantalla.

### Motion

- Presencia de Lenis y Swup indica scroll suavizado y transiciones entre
  páginas. No se observaron en movimiento.
- Entre capturas del hero, las ilustraciones cambian de posición respecto
  al texto, compatible con parallax por scroll. No verificado.

### Responsive y navegación

- Desktop: barra blanca redondeada con logo, menú y un botón verde
  circular con icono de hamburguesa.
- Móvil: la barra se convierte en una píldora blanca con sombra suave,
  logo a la izquierda y el círculo verde a la derecha. El titular de 140px
  baja a ~64px manteniendo el tracking. Las ilustraciones pasan a ser
  escenario de fondo y las tarjetas blancas ocupan el ancho completo con
  botón coral.

### Qué aprender

- Una sola familia tipográfica bien usada (tamaño, peso, tracking) es más
  distintiva que mezclar fuentes sin criterio.
- Color de superficie por sección (verde, crema, amarillo) crea capítulos
  sin necesidad de divisores ni sombras.
- Ilustración original con paleta propia es el activo de identidad más
  fuerte que se puede tener. Para la app: ilustración de alimentos con un
  estilo definido, no iconos genéricos.
- Tarjetas: pocas, grandes, con un propósito. No como unidad de layout por
  defecto.
- Qué no copiar: la cantidad de ilustración por pantalla. En una app de uso
  diario sería ruido.

---

## 3. oryzo.ai

Proyecto ficticio del estudio Lusion: un posavasos de corcho "con IA". Es
una pieza de demostración de WebGL. Astro, 6 `canvas` con WebGL propio,
2 vídeos, altura de documento de 56.691px (un scroll de más de 60
pantallas). Cero reglas de `prefers-reduced-motion`.

### Identidad y dirección de arte

- Paleta cálida y terrosa declarada en tokens: crema `#ffedd7`, negro
  cálido `#100904`, marrón `#382416`, verde oliva `#445231` y `#5d6c49`,
  naranja `#dc5000`, piel `#f6e0c6`.
- Preloader convertido en pieza de identidad: sobre verde oliva aparece un
  círculo con manejadores de curva Bézier en naranja, como si el producto
  se estuviera dibujando en una herramienta vectorial. El círculo crece
  con la carga. Hay un crédito irónico "Adobe Illustrator" en la esquina.
- Hero fotográfico: el posavasos sobre una tabla de corte verde con
  herramientas de diseño alrededor. Luego el fondo se oscurece a negro
  cálido y el producto queda flotando en 3D.

### Tipografía y jerarquía

- Halyard Display y Halyard Text (variables, Adobe Fonts) para display y
  cuerpo, Literata (serif) para momentos de lectura, DM Mono para datos.
- Escala fluida basada en una unidad de pantalla: `--screen-unit` deriva
  del ancho interior sobre 1920 y de la altura sobre 1024. H1 = 164
  unidades, h2 = 68, h3 = 45, cuerpo = 18. Todo escala proporcionalmente.
- Titulares en mayúsculas con tracking apretado, en crema sobre oscuro.
  Etiquetas pequeñas en mayúsculas para navegación y metadatos.
- En el DOM cada letra del footer aparece duplicada ("L L U U S S..."):
  técnica de división por carácter para animaciones de texto por letra.

### Layout y espaciado

- Grilla de 16 columnas con gap proporcional (24/90 del ancho de columna)
  y padding lateral de 3.125vw. Altura de fila derivada del padding.
- Composición cinematográfica: el objeto siempre en el centro, texto en
  bloques a izquierda y derecha que entran y salen con el scroll.

### Motion

- Verificado entre capturas: el posavasos se eleva, gira en 3D y cambia de
  escala mientras el fondo pasa de fotografía a negro. Es un relato
  guiado por scroll (scrollytelling) donde el scroll es la línea de
  tiempo.
- El preloader animado se verificó en dos estados (círculo pequeño con
  manejadores, círculo grande con progreso).
- En móvil la experiencia es la misma, con un tiempo de carga visiblemente
  mayor (el loader seguía presente a los 10 segundos).

### Responsive y navegación

- Navegación mínima en mayúsculas pequeñas, esquinas. Indicador vertical
  de sección a la derecha.
- Móvil: misma puesta en escena, objeto centrado, texto apilado.

### Qué aprender

- El preloader y los estados de espera son oportunidades de identidad,
  no tiempo muerto. Para la app: el estado de carga inicial y el de
  "sincronizando" pueden tener carácter propio con coste mínimo.
- Una escala tipográfica fluida derivada de una unidad única mantiene las
  proporciones en cualquier pantalla.
- Un solo objeto protagonista, luz y fondo que cambia: el cine se hace con
  pocos elementos bien iluminados, no con muchos.
- Qué no copiar: casi todo lo demás. 60 pantallas de scroll, WebGL
  obligatorio y carga de 10 segundos son incompatibles con una app de uso
  diario. La ambición se traslada a dos o tres momentos puntuales, nunca a
  la interacción frecuente.

---

## 4. floema.com/en

Fabricante portugués de mobiliario y señalética para exteriores. Nuxt,
Lenis, 3 `canvas` sin WebGL. Cinco reglas de `prefers-reduced-motion`, la
mejor de las cinco referencias en este aspecto. Diseñado por Bizarro.

### Identidad y dirección de arte

- Papel y tinta: fondo crema `#f2efea`, texto `#241f21`. Color solo en
  etiquetas de categoría (coral para Urban, verde para Nature) y en el
  footer, que es amarillo verdoso con el logotipo gigante en negro y
  dibujos lineales de productos.
- Fotografía real de lugares reales (plazas de Lisboa, costa, bosque) a
  pantalla completa, con el producto integrado en el paisaje. Nada de
  stock: cada foto es de un proyecto.
- Intro: el claim "Spaces for people, made for life." aparece centrado
  sobre crema mientras una constelación de miniaturas de producto aparece
  tenue alrededor y detrás. En móvil la constelación se ve con más
  claridad: miniaturas dispersas en toda la pantalla.

### Tipografía y jerarquía

- Una única familia propia (Zimula) en un solo peso (400) para absolutamente
  todo: titulares de 57px con tracking −4%, etiquetas de 12px, botones.
  La jerarquía viene del tamaño, del tracking y del espacio.
- "The Collections": lista tipográfica grande con el nombre de cada
  colección, una miniatura fotográfica incrustada en la línea y el
  conteo entre paréntesis a menor tamaño. Es composición editorial pura.

### Layout y espaciado

- Grilla de 24 columnas con gap fluido `clamp(14px, 9.71px + 1.1vw, 28px)`
  y margen `clamp(16px, 10.15px + 1.5vw, 36px)`. Todo el espaciado se
  deriva de estas dos variables.
- Paneles numerados (01 a 05) a pantalla completa con una línea de
  progreso horizontal, la etiqueta vertical "Made to Last" y el texto
  anclado al tercio inferior.
- Radios: 0, 3.75px y 12px, más botones píldora blancos. Sin sombras
  visibles salvo en la tarjeta flotante del catálogo.

### Motion

- Duraciones computadas de 0.25 a 0.3s con curva `cubic-bezier(0.19, 1,
  0.22, 1)` (expo-out) para hover y márgenes. Son rápidas y con frenado
  elegante.
- Lenis presente. Las transiciones entre paneles no se verificaron en
  movimiento.

### Responsive y navegación

- Desktop: logo a la izquierda, menú de cuatro píldoras y selector de
  idioma a la derecha, todo flotando sobre la foto.
- Móvil: logo, idioma y una píldora blanca con hamburguesa más lupa. Los
  paneles mantienen la etiqueta numerada, el titular a 32px y la píldora
  de acción. La tarjeta de catálogo pasa a flotar abajo.

### Qué aprender

- Una sola fuente, un solo peso, y aun así nada parece pobre. La
  sofisticación está en el tamaño, el tracking, la alineación y el aire.
- Dos variables fluidas (gap y margen) gobiernan todo el espaciado. Es el
  sistema de layout más limpio de las cinco referencias y el más fácil de
  trasladar a tokens CSS.
- Color reservado a etiquetas de categoría: directamente aplicable a las
  categorías de la lista de compras.
- Micro-composiciones editoriales como la lista de colecciones con imagen
  en línea: aplicable a la vista de frecuentes o al resumen de la compra.
- Soporte real a movimiento reducido.
- Qué no copiar: el peso de la fotografía a pantalla completa en cada
  sección. En la app la imagen es puntual.

---

## 5. mistral.ai

Empresa de modelos de IA. Astro en Netlify. Sin `canvas`: todo es SVG, CSS
e imagen. Tres reglas de `prefers-reduced-motion`.

### Identidad y dirección de arte

- Fondo casi negro `#101013` con superficie secundaria `#1a1a1e`, texto
  marfil `#fafaf4`, gris `#6d6d78` para secundarios. Acento en una rampa
  cálida de cinco pasos que es la bandera de la marca: `#ffaf01`,
  `#ff8204`, `#ff5229`, `#e51300`, `#c4001d`.
- Ilustración pixel-art coherente hasta el último icono: gato, castillo,
  banderas, carpetas. Formas geométricas planas (cuadrados, rombos) en los
  colores de la rampa como elementos compositivos. Líneas finas de grilla
  y un arco como fondo del hero.
- Identidad reconocible desde el favicon hasta la página: sistema, no
  decoración.

### Tipografía y jerarquía

- ALTMistral (familia propia, peso 500) para titulares y nombres de
  producto; Inter 400 para cuerpo; Space Mono para datos. Titulares de
  56px con tracking −1%, tarjetas con títulos de 24 y 32px.
- Tres roles tipográficos claros y nunca mezclados: display, lectura,
  dato.

### Layout y espaciado

- Grilla de líneas visibles: las secciones y tarjetas se separan con
  bordes de 1px, no con sombras ni fondos distintos. Las celdas de la
  grilla son el layout.
- Radios pequeños (4 y 6px): sensación técnica, precisa.
- Componentes: lista de pestañas a la izquierda, contenido a la derecha;
  fila de logos; tarjetas con icono, título y texto; cita grande sobre
  naranja.

### Motion

- Transiciones computadas de 0.15 y 0.3s. Es el sitio más contenido en
  movimiento. En la sección "No one else should hold the strings" hay
  chips con icono que, por su disposición, parecen animarse; no se
  verificó.

### Responsive y navegación

- Desktop: barra superior con logo, menú y dos acciones.
- Móvil: barra de tres celdas (logo, "Get in touch" centrado, icono de
  grilla). Las pestañas pasan a un desplegable. Las tarjetas se apilan
  conservando los bordes y el ritmo. Funciona sin perder identidad.

### Qué aprender

- Bordes de 1px en lugar de sombras: define la jerarquía sin ensuciar.
  Directamente aplicable a filas de la lista y agrupaciones por
  categoría.
- Tres roles tipográficos (display, lectura, dato) con una fuente para cada
  uno. Para la app: display para momentos editoriales, UI para todo lo
  demás, mono o tabular para cantidades y precios.
- Un sistema de iconos propio y coherente vale más que una librería
  genérica. Para la app: iconos de categoría propios.
- Una rampa de acento de pocos pasos, usada en superficies pequeñas,
  carga toda la identidad cromática.
- Qué no copiar: el modo oscuro como único modo. La lista se usa a plena
  luz en el supermercado.

---

## Síntesis: principios transferibles

| Principio | Referencia que lo demuestra |
| --------- | --------------------------- |
| Pocas fuentes, mucho criterio: el carácter viene del tamaño, el peso y el tracking | Floema, MindMarket |
| Un acento saturado usado con avaricia sobre neutros cálidos | Lando Norris, Mistral |
| Color de superficie por sección o capítulo, sin divisores | MindMarket, Lando Norris |
| Bordes finos y aire en lugar de sombras y tarjetas | Mistral, Floema |
| Dos variables fluidas gobiernan todo el espaciado | Floema, Oryzo |
| Tokens globales de movimiento: una duración base, una curva | Lando Norris, Floema |
| Curvas expo-out rápidas para lo frecuente, lentas para lo cinematográfico | Floema (0.25s) vs Lando (0.75s) |
| Los estados de espera son identidad | Oryzo, MindMarket |
| Ilustración e iconografía propias, coherentes hasta el detalle | Mistral, MindMarket |
| Microetiquetas en mayúsculas como sistema de metadatos | Lando Norris, Oryzo, Floema |
| Movimiento reducido como requisito, no como extra | Floema (5 reglas), Mistral (3) |
| La ambición cinematográfica se concentra en pocos momentos | Oryzo, en negativo |

## Anti-patrones observados que no se trasladan

- Bloqueo por orientación o por dispositivo (Lando Norris en móvil).
- Experiencias que dependen de WebGL y tardan segundos en cargar (Oryzo).
- Scroll de decenas de pantallas para llegar al contenido (Oryzo).
- Banners de cookies que tapan el hero en la primera visita (MindMarket,
  Floema, Mistral). La app no usará cookies de terceros, así que no hace
  falta ninguno.
- Falta de soporte a `prefers-reduced-motion` (Lando Norris, Oryzo).
