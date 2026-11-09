# Prueba en dispositivo real

Checklist para cerrar la Fase 3 (y lo que quedó de la Fase 1: la instalación
de la PWA). Se hace a mano, en un iPhone y en un Android, con la app instalada
como PWA y contra la URL de producción de Vercel (o la del preview del último
PR). Cada punto se marca en los dos teléfonos; lo que falle se anota abajo
con el modelo, la versión del sistema y qué se vio.

Para los puntos de tiempo real hacen falta los dos teléfonos en la misma lista
(uno invita al otro desde "Compartir lista").

## Preparación

- [ ] El proyecto de Supabase al que apunta la URL (staging) tiene todas las
      migraciones de `supabase/migrations/`: `npx supabase migration list
      --linked` no muestra ninguna sin aplicar en remoto. Si falta alguna,
      `npx supabase db push`. Al 2026-10-20 staging las tiene todas (se
      aplicaron ese día); sin ellas no funcionan el tiempo real fino (2b),
      compartir (2c), el recorrido (3a) ni el precio recordado con su unidad
      (3d).
- [x] iPhone con iOS al día, Safari. Modelo y versión: iPhone 17 Pro Max,
      iOS ______
- [ ] Android con Chrome al día. Modelo y versión: ______
- [ ] En los dos, la app abierta desde cero (sin datos del sitio: en iOS,
      Ajustes › Safari › Avanzado › Datos de sitios web; en Android, Chrome ›
      Configuración del sitio › Borrar datos).
- [ ] Un correo al que tengas acceso para convertir la cuenta (el enlace y el
      código llegan ahí). En staging los manda una cuenta de Gmail: si no
      aparecen, revisá spam.

## 1. Instalación de la PWA (pendiente de la Fase 1)

iPhone (Safari):
- [ ] Compartir › "Agregar a pantalla de inicio" ofrece el nombre "Lista" y el
      ícono (círculo lima con el check sobre tinta), sin bordes blancos.
- [ ] Abierta desde el ícono: sin la barra de Safari, la barra de estado
      legible en claro y en oscuro, sin franjas en el notch ni abajo.
- [ ] Al cerrarla del todo y volver a abrirla, carga en menos de dos segundos
      y conserva la lista.

Android (Chrome):
- [ ] Chrome ofrece "Instalar app" (menú o aviso) con el nombre y el ícono.
- [ ] El ícono en el cajón de apps es el de la marca (no una captura), y en
      el selector de tareas la app tiene su color.
- [ ] Abierta desde el ícono: pantalla completa, sin la barra de Chrome.

Los dos:
- [ ] Modo avión con la app abierta: aparece el aviso "sin conexión", lo que
      estaba escrito en el campo de añadir no se pierde, y al volver la red
      lo pendiente se guarda solo.
- [ ] Modo avión y abrir la app desde el ícono: se ve la página de sin
      conexión, no un error del navegador.

## 2. Primer uso y añadir rápido

- [ ] La bienvenida aparece una sola vez y termina sola o con un toque; el
      foco queda en el campo de añadir.
- [ ] Con el teléfono en una mano: abrir la app y agregar "Leche" toma menos
      de dos segundos.
- [ ] "2 kg de tomates" y "Leche x3" entran con su cantidad y unidad.
- [ ] Agregar cinco productos seguidos: el teclado no se cierra entre uno y
      otro, y el campo queda vacío cada vez.
- [ ] La barra de añadir no tapa el final de la lista: con una lista más larga
      que la pantalla (unos 15 productos), al bajar hasta el final el último
      producto se ve entero por encima de la barra. Lo mismo con el teclado
      abierto, cuando la barra sube encima del teclado.

## 3. Autocompletado, frecuentes y "lo de siempre"

- [ ] Al escribir "lec" aparecen sugerencias arriba del campo; tocar una la
      agrega en el acto, con su categoría y su último precio, y el teclado
      sigue abierto.
- [ ] "2 kg tom" + tocar "Tomates" agrega 2 kg de tomates.
- [ ] Con el campo vacío, la fila "Frecuentes" se desplaza con el dedo y un
      toque agrega; lo agregado sale de la fila.
- [ ] "Lo de siempre" es el primer botón de la fila de frecuentes y aparece
      cuando al menos dos productos se agregaron tres veces o más en los
      últimos 60 días y no están pendientes. Una lista nueva no lo tiene: para
      prepararlo, agregar "Leche" y "Pan", marcarlos y vaciar el carro, tres
      veces (un producto pendiente no se puede agregar de nuevo). Tocarlo abre
      la hoja "Lo de siempre", todo tildado y con la última cantidad;
      "Agregar N productos" los suma sin repetir lo que ya estaba pendiente,
      la barra dice "Agregaste N productos" y "Deshacer" (8 segundos) los
      saca. Un doble toque no los agrega dos veces.
- [ ] En una lista recién creada (sin historial) no aparece la fila de
      frecuentes.

## 4. Categorías y recorrido

- [ ] En "Editar producto", elegir otra "Categoría" lo lleva a ese grupo
      de Pendientes; al volver a agregarlo otro día entra en esa categoría.
- [ ] El botón "Ordenar el recorrido" de la cabecera de Pendientes abre
      "Recorrido"; "Subir" y "Bajar" mueven la categoría un lugar, se ve el deslizamiento, y Pendientes sigue el
      orden nuevo.
- [ ] En los extremos (primera y última) la flecha está atenuada y no hace
      nada.

## 5. Precio y totales

- [ ] El teclado del campo de precio es numérico con decimales; "89,50",
      "3.99" y "1.200" (mil doscientos) se entienden, y "abc" muestra "Escribí
      un precio como 120, 49,90 o 1.200."
- [ ] Con 2 kg el rótulo dice "Precio por kg" (con litros, "Precio por
      litro"; sin unidad, "Precio por unidad") y debajo aparece "Total: $ …".
- [ ] En "Moneda", elegir "US$" en un producto con precio da dos montos en
      "Estimado", al pie de Pendientes ("$ … · US$ …").
- [ ] Marcar un producto con precio pasa su monto al "Estimado" de "En el
      carro".
- [ ] Si a algún producto le falta el precio, el total dice "N de M con
      precio"; sin ningún precio, no hay total.
- [ ] Al volver a agregar un producto con la misma unidad, entra con su último
      precio y moneda; sin unidad (o con otra base, kg frente a unidad) entra
      sin precio.
- [ ] En "Editar producto", "Guardar" siempre se ve abajo, también con el
      teclado abierto.

## 6. Notas

- [ ] En el campo "Nota" de "Editar producto", "La de vidrio" se ve bajo el
      nombre en la fila y en el otro teléfono; borrarla la saca.

## 7. Tiempo real con dos teléfonos

Con los dos teléfonos en la misma lista, cada cambio debe verse en el otro en
menos de un segundo, con un pulso cítrico suave en la fila (nunca en el
teléfono que hizo el cambio):
- [ ] Agregar, marcar, editar una nota, borrar.
- [ ] Cambiar el precio o la moneda de un producto: el otro ve el total nuevo.
- [ ] Mover una categoría en "Recorrido": en el otro, los grupos de
      Pendientes se reacomodan deslizándose y se lee "Cambiaron el orden del
      recorrido".
- [ ] Mover categorías en los dos a la vez: los dos terminan con el mismo
      orden.
- [ ] "Lo de siempre" en uno: el otro ve llegar todos los productos.
- [ ] Vaciar el carro en uno: en el otro desaparece lo marcado.

## 8. Compartir y miembros (Fase 2c, en dispositivo real)

- [ ] Compartir pide la cuenta (correo y código) y después muestra la
      invitación; "Compartir enlace" abre la hoja del sistema.
- [ ] El otro teléfono abre el enlace, se une y ve la lista.
- [ ] El dueño saca al otro: en el otro teléfono la lista desaparece en el
      acto con el aviso "Ya no estás en esa lista".

## 9. Accesibilidad y preferencias del sistema

- [ ] VoiceOver (iOS) y TalkBack (Android): el campo de añadir se anuncia como
      cuadro combinado; las sugerencias se recorren y se eligen; cada fila
      dice el nombre y si está marcada; "Subir “Bebidas”" mueve y anuncia la
      posición; un cambio del otro teléfono se anuncia ("Agregaron “Leche”").
- [ ] Texto grande del sistema: nada se corta ni se pisa en la lista, la hoja
      de edición y "Recorrido".
- [ ] Modo oscuro del sistema: la app lo sigue al abrirla.
- [ ] Reducir movimiento activado: nada se desliza (las filas y los grupos
      cambian de lugar sin animación), los fundidos siguen.

## 10. Modo compra (F-1, agregado el 2026-11-04)

Con la app instalada como PWA y abierta desde el ícono: es lo que hay que
comprobar en el teléfono. El soporte de Screen Wake Lock en las apps web
agregadas a la pantalla de inicio de iOS llegó tarde (los e2e la simulan), y
si el sistema no la da la app sigue sin ella, sin avisar.

- [ ] "Empezar a comprar" (arriba, con una lista con algo pendiente): la
      cabecera pasa a "Comprando" con "0 de N", la barra de abajo queda en
      "+" y "Terminé" y, si algo tiene precio, la línea "Carro … · Falta ~…".
- [ ] La pantalla no se apaga: con el bloqueo automático del sistema en 30
      segundos, la lista sigue a la vista después de un par de minutos sin
      tocarla. Con "Salir" vuelve a apagarse sola.
- [ ] Pasar a otra app y volver (o bloquear y desbloquear con el botón):
      la pantalla sigue sin apagarse después de volver.
- [ ] Cerrar la app del todo y abrirla de nuevo: sigue en modo compra, y la
      pantalla tampoco se apaga (si no, probar tocando la lista una vez).
- [ ] "+" abre el campo con el teclado en el mismo toque; al cerrar el
      teclado con el campo vacío vuelve el botón.
- [ ] "Terminé" muestra "Buena compra" con el resumen (cuántos productos,
      el estimado y lo que falta) y la pantalla de siempre; "Deshacer" vuelve
      al carro y al modo compra.

## 11. Invitar a instalar la app (F-8, agregado el 2026-11-09)

Lo que el navegador de un teléfono real decide y los e2e no pueden: ahí el
evento `beforeinstallprompt` se simula. Con la app **sin instalar** y
habiendo terminado una compra antes (o con `lista:install` en el
almacenamiento del navegador en `{"trips":1,"dismissals":0,"dismissedAt":0}`).

Android (Chrome):
- [ ] En la visita siguiente a una compra terminada aparece el aviso "Tené
      Lista en el inicio" arriba de la lista, nunca en la primera visita ni
      encima de "Buena compra".
- [ ] "Instalar" abre el diálogo de instalación de Chrome con el nombre y el
      ícono; al aceptar, la app queda en el cajón de apps y el aviso se va.
- [ ] Abierta desde el ícono, el aviso y "Instalar la app" del menú no
      aparecen.
- [ ] Cancelar el diálogo de Chrome cuenta como "Ahora no": el aviso no
      vuelve en la visita siguiente.
- [ ] "Ahora no" lo calla; "Instalar la app" sigue en el menú y funciona.

iPhone (Safari):
- [ ] El aviso dice "Cómo instalarla" y abre la hoja con los tres pasos; los
      pasos coinciden con Safari de verdad (dónde está Compartir, cómo se
      llama "Agregar a inicio") y los iconos se entienden.
- [ ] Siguiendo los pasos, la app queda en el inicio y abierta desde ahí no
      muestra el aviso ni la entrada del menú.
- [ ] En el menú, "Instalar la app" › "Ver cómo" despliega los pasos en el
      lugar, sin abrir otra hoja.
- [ ] En Chrome de iPhone no aparece ninguna invitación.

Los dos:
- [ ] En modo compra no aparece el aviso, ni al volver de otra app.

## Resultado

| Punto | iPhone | Android | Notas |
| ----- | ------ | ------- | ----- |
| 1. PWA | OK | | |
| 2. Añadir | OK | | |
| 3. Autocompletado | OK | | |
| 4. Categorías | OK | | |
| 5. Precio | OK | | |
| 6. Notas | OK | | |
| 7. Tiempo real | | | |
| 8. Compartir | | | |
| 9. Accesibilidad | | | |
| 10. Modo compra | | | |
| 11. Instalar la app | | | |

Fecha y quién lo hizo: iPhone, puntos 1 a 6, Martin Zuro, informado el
2026-11-03. Pendientes: 7 a 10 en iPhone y todo en Android.
