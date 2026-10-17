/**
 * Todos los textos visibles de la interfaz (ADR 0007). Ningún componente
 * debe contener cadenas literales de interfaz: se leen de este objeto.
 */
export const texts = {
  app: {
    name: "Lista",
    description: "Lista de compras para el supermercado.",
  },
  header: {
    menu: "Abrir menú",
  },
  list: {
    pending: {
      title: "Pendientes",
      empty: "Nada pendiente. Lo que agregues aparece acá.",
    },
    cart: {
      title: "En el carro",
      empty: "Lo que marques como comprado baja acá.",
    },
  },
  addItem: {
    label: "Producto para agregar",
    placeholder: "Leche, pan, tomates…",
    submit: "Agregar",
  },
} as const;

export type Texts = typeof texts;
