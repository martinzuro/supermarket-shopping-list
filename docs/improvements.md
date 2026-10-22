# Mejoras y arreglos

Backlog de experiencia de uso. Salió de recorrer la app como alguien que
hace la compra semanal (2026-10-20, `main` después de la Fase 3): armar una
lista de 11 productos a 375 px, marcarlos en el súper, vaciar el carro y
volver a la semana siguiente con cuatro semanas de historial simuladas en el
catálogo.

Estado: **propuestas sin fase asignada.** Ninguna entrada se implementa
hasta que el usuario la asigne a una fase: el plan dice que nada del backlog
entra antes de la Fase 5 salvo decisión explícita
([plan.md](plan.md), sección 6). Al asignarla se anota acá la fase; al
terminarla, la fecha y el PR.

Queda fuera de este documento el uso sin señal dentro del supermercado. Se
trata aparte: es un riesgo del plan ([plan.md](plan.md), sección 6) y una
fase futura del roadmap ([ADR 0003](decisions/0003-online-only.md)).

## Cómo usar este documento

- Cada entrada tiene un id estable: **A** para arreglos (algo que hoy falla
  en el uso), **M** para mejoras de lo que existe y **F** para
  funcionalidades nuevas. Los ids se citan en ramas, commits y PRs.
- La propuesta es el punto de partida, no el diseño cerrado: el detalle se
  decide al abordar la entrada, como en el [roadmap](roadmap.md).
- "Requiere" dice si hace falta una migración (siempre una nueva con
  `npx supabase migration new`; las mergeadas no se editan), un ADR nuevo
  o nada fuera del cliente.
- Todo trabajo visual sigue las reglas de `CLAUDE.md`: leer
  `DESIGN_SYSTEM.md`, `DESIGN_DIRECTION.md` y `DESIGN_REFERENCES.md`, usar
  los tokens y componentes existentes, textos en `src/lib/texts.ts` con
  voseo, y verificar a 375 px en claro y oscuro.
- Al cerrar una entrada: marcarla como hecha acá (fecha y PR) y actualizar
  `plan.md` y `roadmap.md` si cambia el alcance.

## Resumen

| Id  | Qué                                                 | Requiere              | Orden sugerido |
| --- | --------------------------------------------------- | --------------------- | -------------- |
| A-1 | Los productos nuevos caen en "Otros"                | Nada                  | Antes de beta  |
| A-2 | Duplicados sin aviso                                | Nada                  | Hecho          |
| A-3 | "Lo de siempre" a ciegas y sin cantidades           | Migración             | Hecho          |
| A-4 | Errores de pulgar al marcar y al vaciar el carro    | Nada                  | Hecho          |
| M-1 | Hoja de edición: categoría arriba, cantidad con +/− | Nada                  | Con la beta    |
| M-2 | Totales a la vista mientras se compra               | Nada                  | Con la beta    |
| M-3 | "Buena compra" con resumen                          | Nada                  | Con la beta    |
| M-4 | Categorías propias: crear, renombrar, borrar        | Migración             | Después        |
| M-5 | Olvidar una sugerencia del catálogo                 | Migración             | Hecho          |
| M-6 | Nombres con mayúscula inicial                       | Nada                  | Hecho          |
| M-7 | Quién agregó cada producto                          | Migración             | Después        |
| M-8 | Medir la fricción de compartir                      | Nada (ADR si cambia)  | Con la beta    |
| F-1 | Modo compra                                         | Nada                  | Con la beta    |
| F-2 | Pegar una lista                                     | Nada                  | Hecho          |
| F-3 | Mandar lo que falta como texto                      | Nada                  | Hecho          |
| F-4 | Historial de compras                                | Migración             | Hecho          |
| F-5 | "Está comprando"                                    | Nada en la base       | Después        |
| F-6 | Presupuesto por compra                              | Migración             | Después        |

---

## Arreglos

### A-1. Los productos nuevos caen en "Otros"

**Qué pasa.** `suggestCategory` (`src/lib/domain/categories.ts`) solo
consulta el catálogo de la lista. Un producto que la lista nunca vio entra
sin categoría y se muestra en "Otros": en la prueba, 10 de 10. Categorizar
a mano cuesta unos cuatro toques por producto (tocar el nombre, bajar en la
hoja hasta la categoría, elegir el chip, Guardar). El recorrido, que es el
diferencial de la app, no aporta nada la primera semana.

**Propuesta.**

- Un diccionario semilla de unos 300 productos frecuentes en el
  supermercado uruguayo que dé el tipo de categoría (`CategoryId` de
  `src/lib/design/tokens.ts`: `verduras`, `carnes`, `lacteos`, `panaderia`,
  `almacen`, `bebidas`, `congelados`, `limpieza`, `higiene`). En TypeScript,
  en `src/lib/domain`, no en la base.
- Búsqueda sobre el nombre normalizado, en este orden: el nombre completo,
  su singular o plural ("tomates" y "tomate"), la primera palabra ("leche
  descremada" es leche) y palabras clave conocidas. Ante una palabra ambigua
  es mejor no adivinar (devolver null y que vaya a "Otros") que adivinar mal.
- `suggestCategory` pasa a ser: catálogo, después diccionario, después null.
  Lo que el catálogo recuerda siempre gana, así la corrección del usuario
  manda. Del tipo se llega a la categoría de la lista con `categoryKind`; si
  la lista no tiene una categoría de ese tipo, null.
- El diccionario nunca devuelve "Otros": el comentario de `suggestCategory`
  explica por qué el catálogo no debe recordar "Otros" como elegido.
- Aplica a todas las altas, que ya pasan por `suggestCategory` en
  `src/components/list/add-item-bar.tsx`: el campo, las sugerencias, los
  frecuentes y "Lo de siempre".

**Criterios de aceptación.** "tomates", "Yerba Canarias 1 kg", "lavandina"
y "papel higiénico" entran en su grupo sin tocar nada. Un producto
desconocido sigue yendo a "Otros". Una categoría corregida a mano se
respeta en la próxima alta. Tests unitarios del diccionario con plurales,
tildes, primera palabra y casos ambiguos.

**Requiere.** Nada fuera del cliente.

### A-2. Duplicados sin aviso

**Estado: hecho el 2026-10-20**, a pedido del usuario antes de la Fase 4
(rama `feat/a2-duplicates`). Lo decidido al implementarlo:

- No se suma solo. Enter con un producto pendiente (o tocar su opción "En la
  lista") no crea otra fila y avisa "“Leche” ya está en la lista", con su
  cantidad. Si las cantidades se suman, el aviso ofrece "Sumar 2" (lo
  escrito, o uno); si no, solo se cierra. Sumar solo era peor para el caso
  más común: dos personas que anotan "pan" quieren un pan, no dos.
- Se suman la misma unidad (con "kilos" igual a "kg" y "lata" igual a
  "latas") o ninguna, y sin cantidad cuenta uno, como en el precio. Gramos y
  kilos no se convierten: no hay una unidad obvia para el resultado.
- Si el producto dejó de estar pendiente antes de tocar "Sumar" (se marcó o
  se borró), se agrega como nuevo con lo escrito.
- En las sugerencias, lo pendiente va primero, pegado al campo, y cuenta
  dentro de las 5 opciones.
- Código: `src/lib/domain/duplicates.ts` (`findPending`,
  `pendingMatchesFor`, `addedQuantity`), `sameUnit` y `unitForQuantity` en
  `parse-item-input.ts`, la barra en `add-item-bar.tsx`. Pruebas en
  `duplicates.test.ts`, `add-item-bar-catalog.test.tsx` y
  `e2e/a2-duplicates.spec.ts`.
- El aviso no es una escritura: un rechazo que llega mientras se ve lo
  tapa, y cerrarlo no cierra los rechazos de lo enviado antes (el orden de
  los avisos de escrituras es el de la cola).
- Queda abierto: "tomates" sin cantidad y "2 kg tomates" no se suman (el
  aviso solo informa), y podría ofrecer "Cambiar a 2 kg". Después de
  "Sumar", el lector de pantalla no oye la cantidad nueva. El aviso con
  "Sumar" no tiene cierre propio (como el de "Lo de siempre"): se va a los
  8 s o con la próxima alta.

**Qué pasa.** `suggestionsFor` y `frequentsOf` (`src/lib/domain/catalog.ts`)
excluyen lo pendiente. Escribir "ba" con bananas en la lista no muestra
nada, y Enter con "Leche" cuando ya está "leche ×3" crea una segunda fila
sin avisar. En una lista compartida es lo más probable: los dos anotan el
pan.

**Propuesta.**

- En las sugerencias, el ítem pendiente que coincide aparece como una opción
  propia: "En la lista · 3". Elegirla avisa como Enter (ver abajo).
- Enter con un nombre normalizado igual al de un ítem pendiente no crea otra
  fila. (La propuesta original sumaba sola y avisaba con "Deshacer"; se
  implementó preguntando, ver "Estado" arriba.)
- Lo que está en el carro no cuenta como duplicado: volver a anotar algo ya
  comprado es una necesidad nueva.
- Sin restricción única en la base: rompería el alta optimista. Si dos
  miembros agregan lo mismo a la vez, pueden quedar dos filas; se acepta.

**Criterios de aceptación.** No se puede crear un duplicado de un pendiente
desde el campo sin enterarse, y nada se suma sin pedirlo. El aviso no tapa
ni hace perder el rechazo de una escritura. Tests de `add-item-bar` con el
pendiente que coincide por nombre normalizado (mayúsculas, tildes).

**Requiere.** Nada fuera del cliente.

### A-3. "Lo de siempre" a ciegas y sin cantidades

**Estado: hecho el 2026-10-20**, a pedido del usuario después de A-2 (rama
`feat/a3-usuals-review`). Lo decidido al implementarlo:

- La píldora abre una hoja de repaso (`usuals-sheet.tsx`, desde F-2
  `review-sheet.tsx`): lo habitual que no
  está pendiente, en el orden del recorrido, todo tildado y con la cantidad con
  que vuelve. "Agregar N productos" suma lo tildado en una escritura, en ese
  orden, con el "Deshacer" de siempre. Cerrar no agrega nada.
- La migración `20261020200138_catalog_last_quantity.sql` agrega
  `catalog.last_quantity` y `last_quantity_unit`, un par de la misma fila y
  aparte de `last_unit` (la del precio). Lo da un alta con cantidad, o una
  edición de la cantidad o de su unidad que deja una cantidad (como "Sumar" de
  A-2). Un alta sin cantidad, o borrar la cantidad, no lo pisa: "tomates" a
  secas una vez no olvida los 2 kg de siempre. El trigger de UPDATE ahora
  también corre cuando cambia solo la cantidad, y `copy_list_into` copia el par
  al fusionar. Una edición que no renombra ya no reescribe `display_name` con
  la grafía de esa fila. Sin relleno: el catálogo existente empieza sin
  cantidad, y cada producto la toma la próxima vez que se agrega o se edita
  con una.
- El foco vuelve al campo al cerrar la hoja solo si estaba ahí (o en la
  píldora, con teclado) al abrirla: un toque con el teclado del teléfono
  cerrado no lo abre. El aviso "Agregaste N productos" sale cuando la hoja ya
  se fue, para que el lector de pantalla lo oiga (mientras se cierra, Radix
  oculta el resto de la página).
- Lo traen el repaso y los frecuentes (`rememberedAmount`), y con la unidad
  vuelve el precio por kilo (`rememberedPrice` en esa base). Las sugerencias
  mientras se escribe siguen con lo escrito.
- Código: `rememberedAmount` en `catalog.ts`, `inRouteOrder` en
  `categories.ts`, la hoja en `usuals-sheet.tsx` (hoy `review-sheet.tsx`) y la barra en
  `add-item-bar.tsx`. Pruebas en `catalog.test.ts`, `categories.test.ts`,
  `add-item-bar-catalog.test.tsx`, `e2e/catalog-db.spec.ts` y
  `e2e/a3-usuals.spec.ts`.
- Antes de desplegar, la migración tiene que estar en staging (`npx supabase
  db push`): el cliente pide las columnas nuevas y, sin ellas, la lectura del
  catálogo falla.
- Queda abierto: elegir una sugerencia mientras se escribe podría traer
  también la cantidad recordada cuando no se escribió ninguna.

**Qué pasa.** Un toque agrega hasta 15 productos (`USUAL_LIMIT`) y solo
muestra cuántos, no cuáles; se deshace durante 8 s. Vuelven sin cantidad ni
unidad: unos tomates que eran "2 kg" volvieron como "tomates", y por eso sin
precio (un precio por kilo no acompaña a un ítem sin unidad, limitación
conocida de la Fase 3). A los frecuentes les pasa lo mismo.

**Propuesta.**

- "Lo de siempre" abre una hoja de repaso con los productos habituales que no
  están pendientes, todos tildados y cada uno con su última cantidad y
  unidad. Se destilda lo que todavía hay en casa y "Agregar N" los suma en
  una escritura (`useAddItems`), con el mismo "Deshacer" de hoy. Es el
  momento de planificar la compra de cada semana.
- El catálogo recuerda la última cantidad y la unidad con que se agregó cada
  producto, y los frecuentes y el repaso las traen. Columnas nuevas (por
  ejemplo `last_quantity` y `last_quantity_unit`), separadas de `last_unit`:
  esa va siempre en par con el precio (migración
  `20261020154617_catalog_price_unit_pair.sql`) y mezclarlas rompe esa
  invariante. Con la unidad de vuelta, `rememberedPrice` vuelve a traer el
  precio por kilo.

**Criterios de aceptación.** Antes de agregar se ve qué entra. Los tomates
de "2 kg" vuelven como "2 kg" y con su precio. Test de base de datos en
`e2e/catalog-db.spec.ts` para las columnas nuevas.

**Requiere.** Migración: columnas en `catalog`, el trigger
`private.upsert_catalog_from_item` y `private.copy_list_into` (migración de
compartir), que copia las columnas del catálogo una por una al fusionar.
Después, `npm run db:reset` y `npm run db:types`.

### A-4. Errores de pulgar al marcar y al vaciar el carro

**Estado: hecho el 2026-10-21**, a pedido del usuario después de A-3 (rama
`feat/a4-undo-check-and-cart`). Lo decidido al implementarlo:

- Al marcar, la barra avisa "“Tomates” al carro" con "Deshacer" (8 s, como
  los otros avisos): el último marcado desde este dispositivo, solo mientras
  siga en el carro. Se lee de las mutaciones de marcar (`useMutationState`),
  así la lista no tiene que pasarle nada a la barra. No se anuncia en la
  región de la barra: lo dice el checkbox.
- La guarda del doble toque salió de la barra a un hook (`use-double-tap.ts`)
  y la usan también los círculos de marcar (`ListRow` pasa el evento). Un
  segundo toque rápido en el mismo lugar no marca la fila siguiente ni
  desmarca la que se acaba de marcar.
- El momento "Buena compra" tiene "Deshacer" mientras se ve (sin
  temporizador: es la pantalla de confirmación). `useRestoreCart` pone
  `deleted_at` en null solo en las filas archivadas con la hora de esa
  vaciada (desde F-4, las de su compra, con la RPC `restore_trip`), en una
  escritura, y las vuelve a mostrar al instante desde una copia
  que la lista guarda al vaciar (la relectura posterior ya las sacó de la
  caché). Va en la cola de la lista: si el pedido de vaciar todavía no había
  salido, ya no encuentra nada que archivar.
- Para el otro miembro, una fila que vuelve llega por Realtime como un UPDATE
  más nuevo: si la tenía marcada como archivada, vuelve y pulsa (se le anuncia
  como agregada); si una lectura ya la había sacado, se relee la lista.
- Código: `use-double-tap.ts`, `useRestoreCart` en `items.ts`, la barra en
  `add-item-bar.tsx` y la lista en `list-view.tsx`. Pruebas en
  `items.test.tsx`, `add-item-bar-catalog.test.tsx` y `e2e/a4-undo.spec.ts`
  (también con dos miembros).
- El aviso del marcado sale una sola vez y queda fuera del orden de los
  avisos de escrituras, como el de A-2: un rechazo siempre le gana (y no se
  pierde al cerrarlo), y no vuelve si el producto sale del carro y vuelve,
  ni al volver de otra página. Su "Deshacer" tiene como nombre accesible
  "Deshacer: devolver “…” a pendientes".
- Si el servidor rechaza el "Deshacer" del carro, el momento vuelve con su
  "Deshacer" para probar de nuevo.
- Queda abierto: al otro miembro, lo que vuelve se le anuncia como
  "Agregaron …"; podría decir que volvió al carro.

**Qué pasa.**

- Marcar manda la fila al carro, al final de la página y fuera de la vista.
  La fila se queda en su lugar solo 320 ms (`useLingering` en
  `src/components/list/list-view.tsx`).
- Si el grupo queda vacío desaparece y lo de abajo sube: un segundo toque en
  el mismo lugar, o un empujón del carrito, marca otro producto. Para
  corregirlo hay que bajar hasta el carro y buscarlo.
- "Vaciar el carro" archiva todo con un toque y no se puede deshacer: el
  momento "Buena compra" solo tiene "Volver a la lista".

**Propuesta.**

- Después de marcar, un aviso en la barra de abajo: "“tomates” al carro" con
  "Deshacer", reutilizando el aviso con deshacer que ya usa "Lo de siempre"
  en `add-item-bar.tsx`. Uno a la vez: el último marcado.
- La misma guarda contra el doble toque que tiene la barra de agregar
  (`DOUBLE_TAP_MS`, `DOUBLE_TAP_PX`) en los círculos de marcar.
- "Deshacer" en el momento "Buena compra" durante unos segundos: vuelve a
  poner `deleted_at` en null en las filas de esa vaciada. RLS ya permite ese
  UPDATE a los miembros. Comprobar cómo lo reciben la caché y Realtime de los
  otros miembros (hoy un UPDATE de una fila que no está en la caché pide una
  lectura).

**Criterios de aceptación.** Un marcado por error se corrige sin bajar al
carro. Dos toques rápidos en el mismo lugar marcan un solo producto. Una
vaciada por error se recupera. Todo con los tokens de motion y con
`prefers-reduced-motion`.

**Requiere.** Nada fuera del cliente.

---

## Mejoras de lo que existe

### M-1. Hoja de edición: categoría arriba, cantidad con +/−

**Qué pasa.** En `edit-item-sheet.tsx` la categoría es el último campo: a
375 px queda bajo el pliegue y los últimos chips no se ven sin bajar.
Cambiar la cantidad de 3 a 2 obliga a abrir el teclado.

**Propuesta.** Subir la categoría (después del nombre). Botones − y + junto a
la cantidad, al menos para cantidades sin unidad o con unidades de conteo
(paquete, lata, docena); para g, kg, ml y L, decidir el paso o dejar solo el
campo.

**Requiere.** Nada fuera del cliente.

### M-2. Totales a la vista mientras se compra

**Qué pasa.** El "Estimado" está al pie de Pendientes y al pie del carro.
Mientras se compra no se ve sin bajar, y no hay un total de la compra
entera.

**Propuesta.** Una línea fija y discreta, en la cabecera de Pendientes o
sobre la barra de agregar: "Carro $ 253 · Falta ~$ 708", por moneda
(`estimateOf` ya da los totales por moneda). Solo si algún producto tiene
precio. "N de M con precio" se queda en el pie.

**Requiere.** Nada fuera del cliente.

### M-3. "Buena compra" con resumen

**Propuesta.** El momento de vaciar el carro muestra cuántos productos
pasaron por caja, el estimado del carro por moneda y cuántos quedaron
pendientes. Los datos están en `handleEmptyCart` al tocar. Mantener la
composición del momento editorial (`Moment`).

**Requiere.** Nada fuera del cliente.

### M-4. Categorías propias: crear, renombrar, borrar

**Qué pasa.** La hoja Recorrido solo reordena las 10 categorías sembradas.
No se pueden crear (Mascotas, Bebé, Farmacia), renombrar ni sacar.

**Propuesta.** Desde la hoja Recorrido: agregar una categoría (al final del
recorrido), renombrarla y borrarla (borrado lógico; sus ítems pasan a
"Otros", como ya hace `groupByCategory` con una categoría que no está).

**Cuidado.**

- El tinte y el icono salen del nombre (`categoryKind` busca el nombre
  normalizado en `KINDS`). Renombrar "Almacén" a "Almacén y secos" lo haría
  verse como "Otros". El tipo tiene que vivir en la fila (columna `kind`),
  no deducirse del nombre.
- Una categoría propia necesita tinte e icono. Si se agregan, siguen la
  sección 11 de `DESIGN_SYSTEM.md` (dos modos, test de contraste, muestra en
  `/design`).
- La policy de UPDATE de `categories` deja cambiar `position` saltando las
  invariantes de `move_category`; endurecerla está en la Fase 4. Conviene
  hacerlo junto: crear y renombrar con RPC que bloqueen las categorías de la
  lista, como `move_category`.
- `merge_list` empareja categorías por nombre: revisar qué pasa con las
  renombradas.

**Requiere.** Migración (columna `kind`, RPC y policies), tipos y tests en
`e2e/categories-db.spec.ts`.

### M-5. Olvidar una sugerencia del catálogo

**Estado: hecho el 2026-10-21**, a pedido del usuario después de A-4 (rama
`feat/m5-forget-products`). Lo decidido al implementarlo:

- Se olvida desde el menú, en una sección "Productos guardados" debajo de
  "Cuenta" (`products-section.tsx`), y no desde la sugerencia ni la píldora:
  una opción de un `listbox` no puede tener un botón propio accesible (sus
  hijos son presentacionales, axe lo marca como `nested-interactive`), y la
  sección también sirve para lo que no aparece en los frecuentes (un error de
  tipeo con una sola alta). Lista todo lo que el catálogo recuerda, en orden
  alfabético, con cuántas veces se agregó y una búsqueda con la regla de las
  sugerencias.
- "Olvidar" usa la confirmación ligera de "Sacar" a un miembro, que pasó a
  un hook compartido (`src/components/use-confirm.ts`). Es optimista
  (`useForgetProduct` en `categories.ts`) y un rechazo trae la fila de vuelta
  con un aviso.
- En la base, una policy de DELETE para miembros en lugar de una RPC
  (migración `20261021144038_catalog_forget.sql`), como las de ítems y
  categorías: se concede solo DELETE, así que insertar o editar el catálogo
  sigue siendo cosa de los triggers. Si el producto se agrega de nuevo,
  empieza de cero.
- Lo olvidado vuelve si el producto se vuelve a agregar (empieza de cero),
  si se edita un pendiente con ese nombre (el trigger lo vuelve a crear con
  una sola alta) o si una fusión de listas trae el historial de otra lista
  que lo tenía.
- Un DELETE que no borra nada (otro miembro ya lo había olvidado, o quien lo
  pide ya no está en la lista) no da error: la relectura posterior deja el
  catálogo como está en el servidor.
- Antes de desplegar, la migración tiene que estar en staging (`npx supabase
  db push`); sin ella el cliente no rompe, pero "Olvidar" falla.
- Pruebas en `src/lib/queries/catalog.test.tsx`,
  `src/components/menu/products-section.test.tsx`, `e2e/catalog-db.spec.ts`
  y `e2e/m5-forget.spec.ts`.

**Qué pasaba** (antes de M-5). Un producto mal escrito ("tomatse") quedaba
en el catálogo y volvía en las sugerencias y los frecuentes. El catálogo era
de solo lectura para los miembros (policy "Members can read the catalog"; lo
escriben los triggers).

**Propuesta original** (reemplazada por lo decidido arriba). "Olvidar" desde
la sugerencia o desde la píldora de frecuentes, con una RPC que compruebe la
membresía y borre la entrada. Si el producto se vuelve a agregar, empieza de
cero. El catálogo no está en Realtime: el otro miembro lo ve en su próxima
lectura.

### M-6. Nombres con mayúscula inicial

**Estado: hecho el 2026-10-22**, a pedido del usuario después de F-4 (rama
`feat/m6-capital-names`). Lo decidido al implementarlo:

- La función es `capitalizeName` (`src/lib/domain/capitalize-name.ts`):
  pura, cambia solo la primera letra y no toca el resto ("coca-Cola zero"
  pasa a "Coca-Cola zero", "tomates Cherry" queda igual). Salta lo que haya
  antes de esa letra: espacios, emojis y signos ("🍅 tomates" pasa a
  "🍅 Tomates", "¿leche?" a "¿Leche?"). Una letra con tilde o eñe se trata
  como cualquier otra.
- "iPhone" y "eBay" quedan como están: una minúscula seguida de una
  mayúscula se toma como una grafía elegida, no como una mayúscula olvidada.
  Es la única excepción a "solo la primera letra", y vale solo para el
  principio del nombre. Una letra cuya mayúscula no vuelve a ella al pasar a
  minúscula ("ß" es "SS", "µ" pasa a una mu griega) también queda como está:
  poner la mayúscula nunca cambia `name_normalized`.
- Un nombre que empieza con un número queda como está ("7up", "2% leche"):
  la primera letra que viene después no es el comienzo del nombre.
- Se aplica en `newItem` (`src/lib/queries/items.ts`), por donde pasan
  todas las altas (el campo, las sugerencias, los frecuentes, "Lo de
  siempre", una lista pegada y "Agregar de nuevo" de una compra), y al
  guardar en la hoja de edición (`edit-item-sheet.tsx`). La hoja compara el
  nombre ya con la mayúscula: escribir "leche" sobre "Leche" no cambia nada.
- Un nombre en minúscula que ya estaba y no se toca en la hoja no se
  reescribe: queda así hasta que se edite. Tampoco cambian los que trae una
  fusión de listas o un arrastre de pendientes, que se crean en la base.
- `name_normalized` no cambia (`normalizeName` ignora las mayúsculas) y no
  hay migración. El catálogo sigue al último nombre escrito: lo que recordaba
  en minúscula ("yerba mate") pasa a "Yerba mate" la próxima vez que se
  agrega, porque el trigger de alta copia el nombre al `display_name`. Una
  edición que solo cambia la mayúscula no lo toca: el trigger de edición
  mira `name_normalized`, no `name`, así que las sugerencias y los
  frecuentes siguen en minúscula hasta la próxima alta. Una edición que
  cambia el nombre de verdad sí crea la entrada nueva, ya con la mayúscula.
- Las sugerencias, los frecuentes y las hojas de repaso muestran el nombre
  como lo trae el catálogo o lo pegado; lo que se guarda lleva la mayúscula.
  Lo escrito vuelve al campo tal cual si el servidor rechaza el alta, y el
  aviso nombra el producto como se mostró en la lista.
- Pruebas en `src/lib/domain/capitalize-name.test.ts`,
  `src/lib/queries/items.test.tsx`, `src/components/list/edit-item-sheet.test.tsx`,
  `src/components/list/add-item-bar-catalog.test.tsx`,
  `src/components/menu/trips-history.test.tsx` y `e2e/m6-capitals.spec.ts`.
  Los e2e y las pruebas que escribían un nombre en minúscula y lo esperaban
  igual en la lista pasaron a esperarlo con la mayúscula.

**Qué pasaba** (antes de M-6). Los nombres se guardaban tal como se
escribían: "tomates", "papel higienico". La lista mezclaba "leche" y "Leche".

**Propuesta original** (cumplida). Al agregar y al guardar la edición, poner
en mayúscula solo la primera letra del nombre, sin tocar el resto. Como el
trigger copia el último nombre escrito a `display_name`, el catálogo queda
igual. `name_normalized` no cambia.

**Requiere.** Nada fuera del cliente. Tests en `parse-item-input.test.ts` o
donde viva la función.

### M-7. Quién agregó cada producto

**Qué pasa.** En una lista compartida no se sabe quién anotó algo ("pañales
talle 3": ¿qué marca?). `items.created_by` existe, pero no hay nombre
visible: a los miembros se los reconoce por el correo o como "Sin cuenta".
Los UPDATE no traen autor (en la 2b quedó anotado que haría falta
`updated_by`). El eyebrow "Agregado por Ana · hace 2 min" ya está en
`/design`.

**Propuesta.** Un nombre visible por miembro, pedido al compartir o al
aceptar y editable en el menú; puede ser una columna en `list_members` en
lugar de una tabla de perfiles. Se muestra en la hoja de edición y, si no
carga la fila, en la fila solo para lo que agregó otro. El aviso de cambios
remotos para lectores de pantalla puede decir el autor.

**Requiere.** Migración (columna y policies) y revisar que el nombre solo lo
vean los miembros de la lista.

### M-8. Medir la fricción de compartir

**Qué pasa.** Para invitar hay que guardar primero la lista con correo y
código (decisión de la Fase 2c, [plan.md](plan.md) 3.3). Compartir con la
pareja o el hogar es el caso principal y suma un paso con email.

**Propuesta.** No cambiarlo ahora. En la beta (Fase 5), preguntar en el
feedback de los hogares si ese paso frenó a alguien; Vercel Analytics quedó
sin eventos, así que no hay medición automática. Si duele, ADR nuevo para
invitar primero y pedir la cuenta después.

**Requiere.** Nada ahora; un ADR si se cambia.

---

## Funcionalidades nuevas

### F-1. Modo compra

**Propuesta.** Una acción "Empezar a comprar" que cambia la pantalla mientras
se está en el súper:

- La pantalla no se apaga (Screen Wake Lock API). Si el navegador no la
  tiene, se sigue sin ella. El navegador la libera al ocultar la pestaña:
  pedirla de nuevo al volver.
- La barra de agregar se contrae a un botón (agregar sigue a un toque) y
  deja más lugar a la lista.
- Progreso ("7 de 18") y totales (M-2) siempre visibles.
- "Terminé" vacía el carro con el flujo de hoy (el momento, con el resumen de
  M-3) y sale del modo.
- El modo es por dispositivo (estado local), salvo lo que comparta F-5.

**Requiere.** Nada fuera del cliente. Es un estado de pantalla nuevo: pide
diseño según `DESIGN_DIRECTION.md`.

### F-2. Pegar una lista

**Estado: hecho el 2026-10-21**, a pedido del usuario después de M-5 (rama
`feat/f2-paste-list`). Lo decidido al implementarlo:

- Un pegado en el campo de agregar es una lista (`pastedList` en
  `src/lib/domain/paste.ts`) cuando trae dos productos o más en varias
  líneas, o tres o más en una (dos partes de una línea suelen ser un solo
  producto: "Aceite de oliva, extra virgen"). Uno por línea, y en una línea
  separados por coma o punto y coma seguidos de espacio (la coma decimal de
  "1,5 kg" no separa). Se quitan la fecha y el autor de los mensajes copiados
  de WhatsApp, viñetas, numeración ("1.", "2)", "3 -", "1️⃣"), casillas
  ("[ ]", "- [x]"), emoji al principio y las marcas de negrita, cursiva y
  tachado de WhatsApp; las líneas que terminan en ":" (títulos) y las que no
  tienen letras quedan fuera. Una parte que solo dice cuánto ("2 kg", "500g",
  "x3") va con el producto anterior si este no dice cuánto ("Tomates, 2 kg");
  sola, o después de uno que ya tiene cantidad, se descarta. "2 manzanas" es
  un producto. Cada producto una vez, por nombre normalizado (con cantidades
  distintas queda el primero), cortado a 200 caracteres sin partir un emoji.
  Lo que no es lista se pega como siempre.
- La vista previa es la hoja de repaso de "Lo de siempre", generalizada
  (`review-sheet.tsx`): todo tildado, cada producto con su cantidad y la
  categoría que le tocaría. Editable en el sentido de tildar y destildar; el
  texto de cada uno se corrige después, en su fila. Lo que ya está pendiente
  se muestra sin círculo con "Ya está en la lista" y no se agrega (A-2); sumar
  se hace desde la fila, no desde el pegado.
- Hasta 50 por pegado (una escritura); si vinieron más, la hoja lo dice.
- Una lista de una línea cerrada sin agregar queda en el campo, donde se
  pegó y hasta lo que el campo admite, como un pegado común; una de varias
  líneas se descarta. Si se tocó "Agregar", no vuelve al campo.
- Un segundo toque en "Agregar" mientras la hoja se va (sigue en pantalla
  durante su salida) no agrega dos veces; vale también para "Lo de siempre".
- Desde F-3, la nota " — _nota_" con que "Mandar lo que falta" la escribe se
  descarta antes de partir la línea, y un pegado de varias líneas con un
  título y un solo producto ("Súper:\nLeche") también es una lista: pegado
  como texto, el título quedaba en el nombre (ver F-3).
- Pruebas en `paste.test.ts`, `add-item-bar-catalog.test.tsx` y
  `e2e/f2-paste.spec.ts`.

Estaba en la fase futura del roadmap ("Importar ítems desde texto pegado").

**Propuesta.** Si al campo de agregar llega un pegado de varias líneas,
ofrecer "Agregar N productos" con una vista previa editable antes de
escribir.

- Partir por saltos de línea, y por comas solo si no rompen decimales
  ("1,5 kg").
- Quitar viñetas y numeración ("- ", "• ", "* ", "1. ").
- Cada línea pasa por `parseItemInput`, con categoría (A-1) y precio como
  cualquier alta. Lo que ya está pendiente no se agrega otra vez (A-2): la
  vista previa lo marca como "En la lista", y sumar es una decisión de
  quien pega, no automática.
- Una escritura con `useAddItems` y "Deshacer".

**Requiere.** Nada fuera del cliente.

### F-3. Mandar lo que falta como texto

**Estado: hecho el 2026-10-21**, a pedido del usuario después de F-2 (rama
`feat/f3-share-pending`). Cubre también "exportar lista como
texto" de la Fase 4 ([plan.md](plan.md), Datos y legal): es la misma pieza.
Lo decidido al implementarlo:

- Un botón de icono en la cabecera de Pendientes, a la izquierda de "Ordenar
  el recorrido" (así ese no se mueve cuando el otro no está): `ghost`,
  `icon-touch`, "Mandar lo que falta" con el avión de papel (`Send`) si el
  navegador tiene Web Share y "Copiar lo que falta" con `Copy` si no, porque
  el nombre dice lo que hace. Sin nada pendiente no se muestra.
- Con Web Share manda solo `{ text }`. Si quien comparte cierra la hoja del
  sistema (`AbortError`) no se avisa nada; cualquier otro fallo copia, como
  la hoja de compartir. Un segundo toque mientras la hoja del sistema está
  abierta no hace nada (fallaría y copiaría sin que nadie lo pida).
- Copiado, lo avisa la barra de abajo como los otros avisos info ("Copiamos
  lo que falta", "Pegalo en el chat que quieras.", con cierre y 8 s), fuera
  del orden de las escrituras como el de A-2 y el de A-4, y lo lee la región
  `add-announcement`. El botón está arriba, pero las noticias de la lista
  salen abajo; la lista se lo pasa a la barra por un aviso por `QueryClient`
  (como los avisos de membresía), sin props. Toma el lugar del aviso info que
  tapa (que no vuelve al cerrarlo), como un aviso propio de la barra; un
  rechazo le gana y, mientras se ve, el de copiado espera.
- Si tampoco se puede copiar, una hoja desde abajo ("Lo que falta") muestra
  el texto seleccionado (`select-all`), para copiarlo a mano. Al cerrarla el
  foco vuelve al botón.
- El texto (`pendingText` en `src/lib/domain/pending-text.ts`) es solo lo
  pendiente, agrupado en el orden del recorrido, lo sin categoría en "Otros",
  sin precios:

  ```
  Lo que falta:

  *Frutas y verduras:*
  - Tomates 2 kg
  - Bananas ×6

  *Fiambres y lácteos:*
  - Leche ×3 — _descremada_
  ```

  La primera línea y cada categoría terminan en ":" (F-2 las lee como
  títulos) y las categorías van en negrita de WhatsApp; con un solo grupo
  (todo en "Otros", la primera semana) no hay título de categoría. Cada
  producto en su línea con la viñeta de lista de WhatsApp, como se escribiría
  en el campo: la cuenta después de "×" y la cantidad con unidad después del
  nombre (`formatQuantity`). Una unidad sin cantidad no se escribe. Lo que el
  campo leería como otra cosa va con la nota, en la cola en cursiva: una
  unidad escrita en la hoja de edición que el campo no conoce ("Agua ×2 —
  _botella 1L_": vuelve la cuenta, no la unidad, que con un número adentro
  cambiaría la cantidad) y una cuenta sin unidad de más de 999, que el campo
  no toma (vuelve el producto, sin cantidad).
- **Notas.** Van al final, después de una raya y en cursiva de WhatsApp. Era
  la única forma de que no rompieran la vuelta: en otra línea serían un
  producto, entre paréntesis o detrás de una coma quedarían en el nombre o
  partirían la línea. F-2 (`splitPastedList`) aprendió a descartar esa forma
  (" — _…_", al final de la línea o, escrita a mano, antes de una coma o un
  punto y coma) antes de partir la línea por comas, así una nota con comas
  tampoco parte nada. La forma es propia de este texto: una lista escrita a
  mano con raya y sin cursiva se pega como antes.
- Vuelta: pegado en el campo, el texto da los mismos productos con las
  mismas cantidades y unidades (test de ida y vuelta en
  `pending-text.test.ts`; en el e2e, pegarlo en la misma lista marca todo
  como "Ya está en la lista"). Con un solo producto también: F-2 toma como
  lista un pegado de varias líneas con un título y un producto.
- `src/components/share/web-share.ts` reúne lo de la hoja de compartir que
  ahora usan las dos (`useCanShare`, `shareOrCopy`, `selectText`).
- Código: `pending-text.ts`, `paste.ts`, `send-pending.tsx`, `web-share.ts`,
  `list-view.tsx` y la barra en `add-item-bar.tsx`. Pruebas en
  `pending-text.test.ts`, `paste.test.ts`, `send-pending.test.tsx` y
  `e2e/f3-share-text.spec.ts`.
- Revisado por Sonnet (Fable sin cupo); se corrigieron las unidades libres de
  la hoja de edición, las cuentas de más de 999, la nota escrita a mano antes
  de otro producto, el pegado de un solo producto y el aviso tapado que
  volvía al cerrar el de copiado.
- Queda abierto: pegar el texto no trae las notas ni una unidad que el campo
  no conoce (F-2 no tiene dónde ponerlas: se descartan). F-2 limpia los
  nombres como limpia una lista escrita a mano: uno con coma o punto y coma
  ("Aceite de oliva, extra virgen") vuelve partido en dos; uno que empieza
  con un emoji o un signo ("🍞 Pan", "(Marca) Yerba"), o que termina en ":"
  o en una marca de WhatsApp, vuelve recortado o no vuelve; y uno que el
  campo leería con cantidad (escrito desde la hoja de edición, como "Pilas AA
  4") vuelve con esa cantidad. Dos filas pendientes con el mismo nombre
  vuelven como una. No lleva el nombre de la lista ni un enlace a la app.

**Propuesta.** "Mandar pendientes" arma un texto con lo pendiente agrupado
por categoría en el orden del recorrido, con cantidades y notas, pensado
para WhatsApp. Usa `navigator.share` (ya se usa en
`src/components/share/share-sheet.tsx`) y, si no está, copia al
portapapeles.

**Requiere.** Nada fuera del cliente.

### F-4. Historial de compras

**Estado: hecho el 2026-10-21**, a pedido del usuario después de F-3 (rama
`feat/f4-trip-history`). Lo decidido al implementarlo:

- **Modelo.** Una tabla `trips` (`id` generado en el cliente, `list_id`,
  `emptied_at`, `emptied_by`, `created_at`, `updated_at`, `deleted_at`) e
  `items.trip_id`, con una clave foránea compuesta `(list_id, trip_id)` como
  la de `items.category_id`: una fila solo puede apuntar a una compra de su
  lista (migración `20261021171423_trips.sql`). Vaciar el carro crea la
  compra y marca sus filas; borrar un ítem, aunque esté en el carro, nunca la
  crea. Si al correr no queda nada que archivar (se desmarcó todo, o el
  "Deshacer" llegó antes), no se guarda ninguna compra.
- **RPC, no escrituras del cliente.** `empty_cart` archiva las filas y guarda
  la compra en una transacción, y `restore_trip` (el "Deshacer" de A-4)
  devuelve las filas al carro sin `trip_id` y borra la compra (borrado
  lógico): el historial nunca muestra una vaciada deshecha. Dos escrituras
  del cliente en la cola de la lista (crear la compra, marcar las filas) eran
  dos viajes y, si fallaba la segunda, dejaban una compra sin filas. Son
  `SECURITY DEFINER` con `search_path` vacío, así `trips` queda de solo
  lectura para los miembros, como el catálogo: el historial solo puede ser lo
  que hicieron las vaciadas. Cada una comprueba primero la membresía
  (bloqueando la fila de membresía, como `merge_list`) y toca solo filas de
  esa lista. Son idempotentes: el reintento de una respuesta perdida
  encuentra la compra con sus filas y las devuelve, y un "Deshacer" repetido
  no cambia nada. Un trigger (`items_guard_trip_id`) rechaza `trip_id` a las
  peticiones de la API: solo lo cambian esas dos funciones, así nadie agrega
  una fila a una compra, ni la saca, a mano.
- **Una compra es de quien vació.** Solo un reintento de esa misma vaciada
  (el mismo usuario y la misma hora) le suma filas, y solo quien vació la
  deshace (el "Deshacer" está en su momento, no en el de otro). La fila de la
  compra queda bloqueada hasta el final de `empty_cart`, así un reintento
  tardío y un "Deshacer" desde otro dispositivo van uno después del otro, y
  las filas se bloquean en orden de id, como en `move_category`: dos
  vaciadas a la vez no se traban. Una fila de una compra está archivada (el
  check `items_trip_id_archived`): vuelve a la lista solo con `restore_trip`.
  Si quien vacía ya no está en la lista, `empty_cart` dice `list_not_found`
  y la app relee las listas (`isAccessRejection`), como con `move_category`.
- **Permisos.** Los miembros leen las compras de sus listas (policy por
  membresía); nadie las inserta, edita ni borra (sin grants), así que una
  compra no se puede mover a otra lista. Quien sale de la lista deja de
  verlas; `anon` no tiene nada. Pruebas en `e2e/trips-db.spec.ts`.
- **Fusión.** `private.copy_list_into` sigue copiando solo lo vivo: el
  historial se queda en la lista donde se hizo. Unirse a la lista de otro
  hogar no le muestra a nadie lo que uno compró antes.
- **Datos viejos.** Sin relleno: no hay usuarios reales y una vaciada vieja
  no se distingue de un borrado. El historial empieza con la migración.
- **Cuánto.** Se guarda todo; la vista lee las últimas 20 compras
  (`TRIP_LIMIT`, unos cinco meses de compra semanal) y, si hay más, lo dice.
- **Realtime.** `trips` no entra en la publicación: el historial se lee cada
  vez que se abre (`staleTime` 0), y vaciar y deshacer lo marcan para leerlo
  de nuevo; un "Deshacer" además saca la compra al instante de lo leído
  antes. Las filas siguen llegando por Realtime, ahora con su `trip_id`. Se
  lee con un inner join: una compra cuyas filas se borraron del todo (un
  miembro puede) no aparece.
- **Dónde.** En el menú, una sección "Compras anteriores" entre "Cuenta" y
  "Productos guardados", y no en el carro. El historial sirve para planear la
  compra siguiente, que es cuando el carro está vacío; el menú ya tiene lo
  que la lista recuerda (M-5) y está siempre a mano sin sumarle nada a la
  pantalla de todos los días. El momento "Buena compra" ya tiene dos
  acciones.
- **Vista.** Una fila por compra, la más nueva primero: el día ("Martes 20 de
  octubre"; con el año solo si no es el actual, y con la hora si otra compra
  cayó el mismo día), cuántos productos y el estimado por moneda, en mono, con
  los precios que tenían (`tripEstimate`). Tocarla abre la hoja de repaso de
  A-3 y F-2 (`ReviewSheet`): los productos en el orden del recorrido según la
  categoría que tendrían hoy, todo tildado, cada uno con su cantidad, y lo
  pendiente como "Ya está en la lista", que no se agrega. "Agregar N
  productos" los suma en una escritura con la categoría y el precio del
  catálogo, como cualquier alta (un producto olvidado en M-5 vuelve sin
  ellos), y la barra avisa "Agregaste N productos" con "Deshacer".
- **Sin dos modales.** El menú se cierra primero y la hoja de la compra se
  abre cuando el menú ya se fue (su `onCloseAutoFocus`). Al agregar, el foco
  vuelve al botón del menú; al cerrar sin agregar, el menú vuelve con el foco
  en esa compra, para mirar otra.
- **Alta de varios compartida.** El alta de varios con su aviso salió de
  `AddItemBar` a `src/components/list/add-several.ts` (`useAddSeveral`,
  `showAdded`, `useAddedNotice`), con el patrón del aviso de copiado de F-3
  (un store por `QueryClient`): la barra lo muestra venga de su propia hoja o
  de la del menú. Como el de copiado, toma el lugar del aviso info que tapa,
  que no vuelve al cerrarlo.
- Código: la migración `trips`, `useEmptyCart` y `useRestoreCart` en
  `items.ts`, `src/lib/queries/trips.ts`, `src/lib/domain/trips.ts`,
  `add-several.ts`, `trips-section.tsx`, `trip-review.tsx` y `app-menu.tsx`.
  Pruebas en `trips.test.ts`, `trips.test.tsx`, `items.test.tsx`,
  `trips-history.test.tsx`, `add-item-bar-catalog.test.tsx`,
  `e2e/trips-db.spec.ts` y `e2e/f4-history.spec.ts`. Los e2e que vacían el
  carro (`list`, `phase-2a` y `a4-undo`) esperan ahora la RPC.
- Revisado por Sonnet (Fable sin cupo): la migración contra la base local y
  el cliente por separado. Se corrigieron un reintento tardío que podía
  archivar de nuevo en una compra recién deshecha, que cualquier miembro
  podía sumar filas a la compra de otro o deshacerla, una fila de una compra
  que podía volver a la lista sin salir de ella, una compra sin filas en el
  historial, el orden de los bloqueos, `list_not_found` en
  `isAccessRejection`, la compra deshecha que se veía un momento en el
  historial y tests que no podían fallar o que dependían del año.
- Antes de desplegar, la migración tiene que estar en staging (`npx supabase
  db push`): sin ella, vaciar el carro falla (la RPC no existe) y lo vaciado
  vuelve a la lista con el aviso de error. Aplicada en staging el 2026-10-21
  (`migration list --linked` la muestra en local y en remoto).
- Queda abierto: "Agregar de nuevo" no trae las notas ("descremada"); el
  historial de una lista anónima no viaja con el carry-over a una cuenta; dos
  compras del mismo minuto se llaman igual (las distinguen la cuenta y el
  total); una compra no se puede borrar del historial; la fila cuenta filas y
  el repaso, productos (dos filas con el mismo nombre son "2 productos" en la
  fila y uno en el repaso); un segundo toque lento (después de los 320 ms en
  que el menú se va) sobre una compra cae en el velo de la hoja que se abre y
  la cierra, y vuelve el menú. Visto de paso, ya
  pasaba antes de F-4: al agregar un producto frecuente, su píldora aparece
  un instante en la fila de frecuentes antes de que llegue la fila, y con la
  página al final la barra sube y baja la página bajo el dedo.

**Qué existe** (antes de F-4). Vaciar el carro archiva todas las filas con un mismo
`deleted_at` (`useEmptyCart`). Pero borrar un ítem que estaba en el carro
también deja una fila marcada con `deleted_at`, y no se distingue de una
compra de un solo producto.

**Propuesta.** Una vista "Compras anteriores" desde el menú: una entrada por
vaciada con fecha, cantidad de productos y estimado. Al abrirla, sus
productos, con "Agregar de nuevo" para todos o para algunos (la misma hoja
de repaso de A-3). Para distinguir una vaciada de un borrado hace falta
guardarla: una tabla `trips` (lista, fecha, quién vació) con `items.trip_id`,
o un motivo de archivado en `items`.

**Requiere.** Migración, policies y tests de base de datos. Definir cuánto
historial se guarda.

### F-5. "Está comprando"

**Propuesta.** Con el modo compra (F-1) activo, los otros miembros ven
"Ana está comprando" arriba de la lista, para saber que es el momento de
agregar algo. Usa Realtime Presence en el canal de la lista que ya existe
(`useListRealtime`), sin tabla nueva. Sin nombres visibles (M-7), un neutro
"Alguien está comprando".

**Requiere.** Nada en la base. Respetar el ciclo de vida del canal de
`src/lib/queries/realtime.ts` (`setAuth`, reconexiones, StrictMode). Depende
de F-1.

### F-6. Presupuesto por compra

**Propuesta.** Un tope opcional por compra y por moneda. La línea de totales
(M-2) muestra el estimado contra el tope. Prioridad baja.

**Requiere.** Migración si el tope se comparte entre miembros (columna en
`lists`); solo local si no.

---

## Lo que no se propone

- Recetas, despensa, códigos de barras, precios reales de supermercados y
  gamificación: están fuera de alcance en el [roadmap](roadmap.md).
- Varias listas: siguen en la fase futura. Una lista con categorías cubre
  la compra semanal.

## Orden sugerido

Pendiente de decisión del usuario.

- **Antes de la beta** (baratas, definen la primera impresión): A-1, A-2
  (hecha el 2026-10-20), A-4 (hecha el 2026-10-21) y M-6 (hecha el
  2026-10-22). F-3 (hecha el 2026-10-21) cubre "exportar lista como texto"
  de la Fase 4.
- **Con lo que muestre la beta:** A-3 (hecha el 2026-10-20), M-1, M-2, M-3,
  M-8, F-1 y F-2 (hecha el 2026-10-21).
- **Después:** M-4, M-5 (hecha el 2026-10-21), M-7, F-4 (hecha el
  2026-10-21), F-5 y F-6.
