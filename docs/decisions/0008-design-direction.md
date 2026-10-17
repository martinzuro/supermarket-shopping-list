# 0008. Dirección de diseño Fresh Editorial

Fecha: 2026-10-17
Estado: Aceptado

## Contexto

La calidad visual al nivel de los mejores sitios reconocidos por Awwwards
es un requisito fundamental del proyecto. Antes de diseñar interfaz se
analizaron cinco referencias (`docs/DESIGN_REFERENCES.md`) y se propuso
una dirección creativa (`docs/DESIGN_DIRECTION.md`). La interfaz
provisional que existe en `main` (tokens y primitivas con la apariencia
por defecto de shadcn) se hizo antes de que existiera la dirección y no la
cumple.

## Decisión

Se adopta la dirección **Fresh Editorial** tal como está documentada en
`docs/DESIGN_DIRECTION.md`, con estas resoluciones:

1. Paleta "A con la disciplina de B": papel crema, tinta verde casi negra,
   pistacho como superficie secundaria, lima y naranja solo en acción
   primaria y estado hecho. Tokens candidatos como punto de partida,
   validados por contraste al implementar.
2. Tipografía: Geist (interfaz), Instrument Serif (display, solo por encima
   de 28px), Geist Mono (precios y totales).
3. Mezcla de direcciones: estructura de "Papel y tinta", paleta de
   "Frescura cítrica", ilustración de "Mercado de barrio" con moderación.
4. Ilustración SVG monolínea producida en el proyecto; primero los diez
   iconos de categoría.
5. Tokens para modo claro y oscuro desde el inicio; pulido primero en
   claro.
6. Nombre provisional "Lista" con wordmark tipográfico reemplazable.
7. Bienvenida coreografiada de una pantalla en el primer uso.
8. Lista aireada por defecto.
9. Diez tintes de categoría, solo en etiqueta e hilo lateral.
10. Voseo rioplatense (ADR 0007).

## Alternativas consideradas

Documentadas en `docs/DESIGN_DIRECTION.md`, secciones 4, 5, 9 y 10:
paleta "Papel y tinta" pura, color expresivo por capítulo, una sola
familia tipográfica, bocetar las tres direcciones por separado, encargo
externo de ilustración, solo modo claro, entrada directa sin bienvenida,
lista compacta, categorías monocromas.

## Consecuencias

- El sistema de diseño (tokens, tipografía, espaciado, radios,
  superficies, motion, estados) se construye antes que cualquier
  pantalla, y reemplaza los tokens y primitivas provisionales de
  `src/app/globals.css` y `src/components/ui/` en lugar de extenderlos.
- Las primitivas accesibles pueden seguir viniendo de shadcn o Base UI,
  pero su apariencia es siempre propia y sale de los tokens nuevos.
- Toda sesión que toque interfaz lee `docs/DESIGN_DIRECTION.md` y
  `docs/DESIGN_REFERENCES.md` antes, según CLAUDE.md.
- Los iconos de categoría y el wordmark son activos propios del proyecto
  y se versionan en el repo como SVG.
