# Dirección de diseño: Fresh Editorial

Visión creativa, principios visuales y direcciones posibles para la app.
Este documento se consulta antes de cualquier trabajo de interfaz, junto
con [DESIGN_REFERENCES.md](DESIGN_REFERENCES.md).

Estado: **propuesta pendiente de aprobación**. No define pantallas,
componentes ni código. Las decisiones abiertas están en la sección 10.

---

## 1. Ambición

La app tiene que sentirse al nivel de los mejores sitios reconocidos por
Awwwards en originalidad, coherencia y ejecución, pero es una herramienta
de uso diario que se usa con una mano, en un pasillo, con prisa. La
ambición se mide así:

- Que alguien la abra por primera vez y piense "esto lo hizo alguien con
  criterio", no "esto es una plantilla".
- Que añadir, marcar y compartir se sientan instantáneos y satisfactorios.
- Que los pocos momentos cinematográficos (primer uso, carro vaciado,
  invitación) sean memorables porque son raros.
- Que nada parezca generado por defecto: ni los botones, ni los iconos, ni
  las sombras, ni los estados vacíos.

## 2. Concepto: Fresh Editorial

**La lista de compras como objeto editorial.** Una página de revista de
cocina bien maquetada: tipografía protagonista, papel cálido, un acento
fresco, imágenes de alimentos con carácter propio, y una estructura tan
clara que no hace falta explicarla.

De cada referencia se toma un principio, no una estética:

| De | Se toma | Se deja |
| -- | ------- | ------- |
| MindMarket | Color de superficie por capítulo, ilustración con paleta propia como identidad | La densidad de ilustración por pantalla |
| Floema | Papel y tinta, una familia tipográfica, espaciado gobernado por dos variables fluidas, color solo en etiquetas de categoría | Fotografía a pantalla completa en cada sección |
| Mistral | Tres roles tipográficos, bordes finos en vez de sombras, iconografía propia coherente | El modo oscuro como único modo |
| Lando Norris | Un acento saturado usado con avaricia, tokens globales de movimiento, microetiquetas en mayúsculas | La duración de 0.75s para todo, el bloqueo por orientación |
| Oryzo | Estados de espera con identidad, escala fluida desde una unidad, un protagonista bien iluminado | Todo lo demás |

## 3. Principios visuales

1. **Tipografía primero.** La jerarquía se construye con tamaño, peso,
   tracking y espacio. Antes de añadir un fondo, una línea o un icono,
   preguntarse si la tipografía sola resuelve.
2. **Papel, no vidrio.** Superficies mate, cálidas, opacas. Sin
   glassmorphism, sin degradados decorativos, sin sombras difusas por
   defecto. Una sola sombra suave existe en el sistema, para hojas y
   diálogos que flotan de verdad.
3. **Un acento, con avaricia.** El color saturado señala la acción
   primaria y el estado "hecho". Todo lo demás es neutro o tinte suave.
4. **Líneas y aire antes que tarjetas.** Las filas de la lista se separan
   con reglas de 1px o solo con espacio. Las tarjetas se reservan para
   objetos que realmente son objetos (una invitación, un resumen de
   compra).
5. **Color con significado.** Las categorías tienen color porque ayuda a
   escanear el pasillo. Ningún otro color aparece sin función.
6. **Imagen propia o ninguna.** Ilustración original de alimentos con un
   estilo definido. Cero fotografía de stock. Si no hay una ilustración
   buena, el espacio queda vacío y bien compuesto.
7. **El movimiento confirma e informa.** Cada animación responde a una
   pregunta: ¿qué pasó?, ¿de dónde vino?, ¿a dónde fue? Si no responde
   ninguna, no existe.
8. **Rápido en lo frecuente, lento en lo raro.** Añadir y marcar: 150 a
   250 ms. Momentos editoriales: 500 a 900 ms. Nunca al revés.
9. **Mobile first de verdad.** Se diseña a 375px con una mano y se expande
   a desktop como un pliego de revista, no al revés.
10. **Accesible por defecto.** Contraste AA, objetivos de 44px, foco
    visible, movimiento reducido respetado. No es una capa posterior.

## 4. Paleta

### Punto de partida propuesto

Off-white cálido, verde profundo, verde pistacho y acentos cítricos. Se
evaluaron tres caminos antes de recomendar.

**A. Verde fresco (punto de partida del brief).** Papel cálido, tinta
verde casi negra, pistacho como superficie secundaria, lima y naranja
como acentos. Fresca, de alimentos, reconocible. Riesgo: el verde está muy
asociado a "orgánico/eco" y puede caer en cliché si se usa sin disciplina.

**B. Papel y tinta (Floema, Mistral).** Neutros cálidos y un solo acento.
Color solo en categorías y en alimentos ilustrados. Máxima sofisticación,
mínimo riesgo de cliché. Riesgo: puede resultar fría para un producto
doméstico y cotidiano.

**C. Color expresivo por capítulo (MindMarket).** Superficies de color
pleno que cambian por vista. Mucha personalidad. Riesgo: en una app que se
abre veinte veces por semana cansa, y compite con el color de categorías.

**Recomendación: A con la disciplina de B.** La estructura cromática es
papel y tinta; el verde profundo hace de tinta en lugar del negro; el
pistacho aparece solo como superficie secundaria (carro, hojas); los
cítricos solo en acción primaria y estado hecho. El color expresivo de C
queda para los dos o tres momentos cinematográficos, nunca para la lista.

### Tokens candidatos

Valores de partida para explorar, no definitivos. Todos pendientes de
validación de contraste y de prueba en pantalla real bajo luz de
supermercado.

| Rol | Claro | Oscuro | Nota |
| --- | ----- | ------ | ---- |
| Papel (fondo) | `#F6F3EC` | `#13181480` sobre `#121814` | Crema cálido, nunca blanco puro ni negro puro |
| Tinta (texto principal) | `#1B2A1F` | `#EEEBE2` | Verde casi negro, da calidez sin leerse como "verde" |
| Tinta secundaria | `#5B6A5E` | `#9BA69C` | Para metadatos, eyebrows |
| Regla (bordes) | tinta al 12% | marfil al 14% | Líneas de 1px |
| Pistacho (superficie 2) | `#DCE9C8` | `#1F2B22` | Carro, hojas, agrupaciones |
| Verde bosque (marca) | `#2F4A3A` | `#8FB89B` | Logotipo, acentos de marca |
| Lima (acento activo) | `#C9F04A` | `#C9F04A` | Acción primaria, "hecho". Solo sobre tinta o bosque, nunca como fondo de texto claro |
| Naranja cítrico (acento 2) | `#F26B1D` | `#FF8A47` | Atención, cambios de otros miembros, precios destacados |
| Tomate (error) | `#D9432B` | `#F06A52` | Único rojo del sistema |

Categorías: diez tintes derivados de una misma saturación y luminosidad,
para que convivan sin pelear. Se aplican en la etiqueta de categoría y en
un hilo de 2px al lado de la agrupación, no como fondo de fila.

Modo oscuro: desde el inicio en los tokens, aunque la prioridad de pulido
sea el modo claro. El supermercado es un lugar iluminado.

## 5. Tipografía

### Opciones evaluadas

**1. Geist + Instrument Serif (punto de partida del brief).** Geist
(Vercel, OFL) como fuente de interfaz, con tabulares para cantidades y
precios. Instrument Serif (OFL) para momentos editoriales: titulares de
estado vacío, cifras de total, invitación. Contraste claro entre lo
funcional y lo editorial. Riesgo: Geist es muy visible hoy en productos
de desarrollo; hay que usarla con tracking y tamaños propios para que no
se lea como "dashboard de Vercel".

**2. Una sola familia expresiva (Floema, MindMarket).** Una grotesca con
rango óptico amplio para todo. Máxima coherencia. Riesgo: menos recursos
para los momentos editoriales; exige una fuente con mucha personalidad,
y las que la tienen suelen ser de pago.

**3. Geist + display con más carácter.** Sustituir Instrument Serif por
una serif con más contraste o una display con rasgos propios. Más
reconocible, más riesgo de envejecer mal.

**Recomendación: opción 1 con reglas estrictas.**

- Instrument Serif solo por encima de 28px y nunca en etiquetas,
  botones ni filas de la lista. Su cursiva es el gesto editorial: una
  palabra en cursiva dentro de un titular en sans.
- Geist para toda la interfaz, con `font-feature-settings: "tnum"` en
  cantidades y precios. Geist Mono se evalúa para totales y precios (rol
  "dato", como Mistral con Space Mono); si no aporta, no entra.
- Tracking negativo creciente con el tamaño (0 en 14px, −1% en 20px,
  −2.5% en 40px, −4% por encima de 64px), tomado del patrón de MindMarket
  y Floema.
- Eyebrows en mayúsculas, 11 a 12px, tracking +6%, tinta secundaria: el
  sistema de metadatos (categoría, fecha, quién añadió).

### Escala

Escala fluida con `clamp`, pensada para 375px y 1440px:

| Rol | Móvil | Desktop | Fuente |
| --- | ----- | ------- | ------ |
| Display | 40px | 72px | Instrument Serif |
| Título | 28px | 40px | Instrument Serif o Geist 500 |
| Encabezado de sección | 20px | 24px | Geist 500 |
| Fila de lista | 17px | 18px | Geist 400 |
| Cuerpo | 15px | 16px | Geist 400 |
| Etiqueta | 13px | 13px | Geist 500 |
| Eyebrow | 11px | 12px | Geist 500, mayúsculas |

## 6. Imagen e ilustración

- **Ilustración monolínea de alimentos**, trazo de 1.5px a tamaño base, en
  tinta sobre papel, con un relleno plano opcional en pistacho o cítrico.
  Estilo cercano a los dibujos lineales del footer de Floema, aplicado a
  ingredientes. Se produce como SVG propio.
- **Recortes fotográficos de alimentos** solo para momentos
  cinematográficos (primer uso, carro vaciado), con fondo papel, luz
  natural y sin escena. Se evalúa si merece la pena producirlos; si no,
  la ilustración cubre todo.
- **Iconos de categoría propios**: diez glifos monolínea coherentes con la
  ilustración. Es el activo de identidad más rentable del proyecto.
- **Iconos de interfaz**: lucide con stroke ajustado a 1.5px y tamaño
  fijo, hasta que exista un set propio. Ningún icono relleno.
- Cero fotografía de stock, cero emojis como iconos, cero 3D.

## 7. Layout

- **Espaciado gobernado por dos variables fluidas**, como Floema: margen
  `clamp(16px, 4vw, 40px)` y gap `clamp(12px, 1.5vw, 24px)`. Todo lo
  demás se deriva.
- **Escala de espaciado** en pasos de 4px (4, 8, 12, 16, 24, 32, 48, 64,
  96) para interior de componentes.
- **Grilla**: 4 columnas en móvil, 8 en tablet, 12 en desktop. La lista
  ocupa 4/4, 6/8 y 7/12; el resto es aire o contexto.
- **Desktop como pliego**: la lista a la izquierda con el ancho de una
  columna de lectura (máximo 640px), y a la derecha una columna de
  contexto (totales, frecuentes, miembros). No se estira la lista a
  pantalla completa.
- **Radios**: 0 para reglas y agrupaciones, 6px para campos y chips, 12px
  para hojas y tarjetas-objeto, píldora para acciones principales. Nada
  intermedio.
- **Superficies**: papel (base), pistacho (secundaria), tinta (inversa,
  para momentos editoriales). Sin más niveles.
- **Sombras**: una sola, para hojas y diálogos: `0 12px 32px -8px` de
  tinta al 18%. Nada más tiene sombra.

## 8. Motion

### Filosofía

El movimiento es parte del diseño desde el primer boceto. Comunica
jerarquía (qué es importante), estado (qué cambió) e intención (qué va a
pasar). Nunca decora.

### Tokens

| Token | Valor | Uso |
| ----- | ----- | --- |
| `--ease-out` | `cubic-bezier(0.19, 1, 0.22, 1)` | Casi todo: entradas, hover, cambios de estado |
| `--ease-in-out` | `cubic-bezier(0.65, 0.05, 0, 1)` | Movimientos largos y cinematográficos |
| `--dur-instant` | 120 ms | Pressed, toggles, foco |
| `--dur-fast` | 200 ms | Hover, aparición de elementos pequeños |
| `--dur-base` | 320 ms | Reordenar, marcar ítem, hojas |
| `--dur-slow` | 600 ms | Transiciones de vista |
| `--dur-cinematic` | 900 ms | Momentos editoriales, una vez por sesión como mucho |
| `--stagger` | 35 ms | Entre elementos de una lista que entra |

### Coreografías clave (a diseñar, no definidas aquí)

- **Añadir ítem**: el ítem aparece en su categoría con un leve
  desplazamiento vertical y fade, el input se vacía sin parpadeo, el foco
  no se pierde. Menos de 250 ms en total.
- **Marcar comprado**: tachado animado de izquierda a derecha, el ítem
  baja a "en el carro" con animación de layout, la categoría se contrae
  si queda vacía. La satisfacción está en el tachado, no en confeti.
- **Cambio remoto**: el ítem que otro miembro añadió o marcó entra con un
  pulso suave en naranja que se apaga en un segundo. Informa sin gritar.
- **Vaciar carro**: el único momento con permiso para ser cinematográfico
  en el uso diario. Dura menos de un segundo.
- **Primer uso e invitación**: entradas coreografiadas con stagger,
  tipografía display, ilustración. Es donde vive la ambición Awwwards.

### Reglas

- Solo `transform` y `opacity` en animaciones frecuentes. Nada de animar
  `height`, `top` o `box-shadow` en la lista.
- `prefers-reduced-motion: reduce` sustituye desplazamientos por fundidos
  y elimina stagger y parallax. Se prueba en cada componente.
- Sin scroll suavizado ni secuestro de scroll. El scroll nativo del móvil
  es parte de la velocidad percibida.
- Sin animaciones en bucle visibles en la lista. Un indicador de
  sincronización puede pulsar; nada más.
- Librerías: Motion for React como candidata principal por animaciones de
  layout y gestos con soporte de reduced motion. GSAP solo si un momento
  cinematográfico lo justifica. Ninguna se instala hasta implementar.

## 9. Direcciones posibles

Tres exploraciones para bocetar antes de fijar la identidad. Se pueden
combinar.

**I. Mercado de barrio.** Cálida, ilustrada, con personalidad. Papel
crema, ilustración monolínea muy presente, eyebrows en mayúsculas,
cursiva serif como gesto. Energía de MindMarket con la contención de
Floema. Riesgo: demasiado "amable", poco premium.

**II. Papel y tinta.** Monocroma, tipográfica, casi sin color salvo en
categorías y en el acento. Reglas de 1px, mucho aire, Instrument Serif
grande en los momentos editoriales. Mistral y Floema. Riesgo: fría,
puede parecer una app de notas.

**III. Frescura cítrica.** Verde profundo como superficie protagonista
en momentos clave, lima como acento activo con la agresividad de Lando
Norris, papel para la lista. Contraste alto, reconocible desde lejos.
Riesgo: el lima en exceso cansa y tiene problemas de contraste.

**Recomendación: estructura de II, paleta de III, ilustración de I con
moderación.** Es decir: una app tipográfica y aireada, con verde profundo
y lima como firma cromática usada en superficies pequeñas, e ilustración
monolínea de alimentos en estados vacíos, categorías y momentos
editoriales.

## 10. Decisiones a tomar antes de diseñar

Ordenadas por impacto. Las cinco primeras bloquean el sistema de diseño.

1. **Paleta**: confirmar "A con la disciplina de B" y los tokens
   candidatos como punto de partida, o elegir otro camino.
2. **Tipografía**: confirmar Geist + Instrument Serif con las reglas de
   uso, y decidir si Geist Mono entra para precios y totales.
3. **Dirección**: confirmar la mezcla recomendada (II + III + I) o pedir
   bocetos de las tres por separado antes de decidir.
4. **Ilustración**: quién la produce. Opciones: SVG monolínea hecho en el
   proyecto (más control, más tiempo), encargo a un ilustrador (más
   calidad, coste), o ninguna ilustración en la primera versión y solo
   tipografía.
5. **Modo oscuro**: tokens desde el inicio con pulido posterior
   (recomendado), o solo claro hasta la Fase 4.
6. **Nombre y logotipo**: el nombre provisional "Lista" condiciona el
   wordmark. Si va a cambiar, conviene saberlo antes de dibujar la marca.
7. **Nivel cinematográfico del primer uso**: una pantalla de bienvenida
   coreografiada (recomendado, una sola vez) o entrar directo a la lista.
8. **Densidad de la lista**: compacta (más ítems por pantalla) o aireada
   (más editorial). Recomendación: aireada por defecto con opción
   compacta más adelante si la beta la pide.
9. **Color de categorías**: tintes por categoría (recomendado) o
   monocromo con solo el icono.
10. **Tono de voz**: voseo rioplatense ("Agregá"), tuteo neutro ("Agrega")
    o impersonal ("Agregar"). Afecta a cada texto de la interfaz.

## 11. Lo que se evita

Del brief, confirmado por las referencias:

- Dashboards genéricos de SaaS, sidebars con iconos, KPIs en tarjetas.
- Plantillas reconocibles y componentes con apariencia por defecto de
  librerías. Las primitivas accesibles (diálogo, menú, hoja) pueden venir
  de una librería sin estilos; su apariencia es siempre propia.
- Degradados y glassmorphism sin propósito. Sombras en más de un nivel.
- Animaciones constantes, en bucle o que retrasan la acción.
- Fotografía de stock, emojis como iconos, 3D sin justificación.
- Interfaces sobrecargadas de tarjetas.
- Scroll secuestrado, preloaders largos, bloqueos por orientación.

## 12. Siguiente paso

Con las decisiones de la sección 10 tomadas, el siguiente paso es el
sistema de diseño: tokens de color, tipografía, espaciado, radios,
superficies, motion y estados de interacción como variables CSS, más una
página de muestra interna con los componentes base en sus estados. Solo
después se diseñan pantallas.
