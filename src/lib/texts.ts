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
    defaultName: "Mi lista",
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
  sheet: {
    close: "Cerrar",
  },
  menu: {
    title: "Menú",
  },
  connection: {
    title: "Sin conexión",
    body: "Volvemos a intentar solos en unos segundos.",
    retry: "Reintentar",
    retrying: "Conectando…",
  },
  account: {
    title: "Cuenta",
    loading: "Cargando tu cuenta…",
    offline:
      "Sin conexión. Cuando vuelva la red vas a poder guardar tu lista con tu correo.",
    anonymous: {
      intro:
        "Estás usando Lista sin cuenta. Guardá tu lista con tu correo para no perderla y abrirla en otro dispositivo.",
      emailLabel: "Tu correo",
      emailPlaceholder: "nombre@correo.com",
      submit: "Enviar código",
      submitting: "Enviando…",
    },
    code: {
      sentTo: "Te mandamos un correo a",
      instructions:
        "Tocá el enlace del correo o ingresá acá el código de 6 dígitos. Si no te llega en un par de minutos, revisá la carpeta de spam.",
      existingAccount:
        "Ese correo ya tiene una cuenta: al entrar vas a ver sus listas. Lo que agregaste sin cuenta en este dispositivo queda afuera.",
      label: "Código de 6 dígitos",
      submit: "Confirmar",
      submitting: "Confirmando…",
      resend: "Reenviar código",
      resendIn: (seconds: number) => `Reenviar en ${seconds} s`,
      resent: "Te mandamos un código nuevo. Usá el del último correo.",
      changeEmail: "Usar otro correo",
    },
    signedIn: {
      label: "Tu lista está guardada en",
      description:
        "Entrá con este correo en otro dispositivo para ver tus listas.",
      signOut: "Cerrar sesión",
      signingOut: "Cerrando sesión…",
      signOutHint:
        "Al cerrar sesión, este dispositivo empieza una lista nueva sin cuenta.",
    },
    notices: {
      confirmed: "Listo, tu correo quedó confirmado.",
      signedIn: "Listo, entraste a tu cuenta.",
      signedOut: "Cerraste sesión. Este dispositivo sigue sin cuenta.",
      linkExpired: "El enlace venció o ya se usó.",
      linkInvalid: "No pudimos usar ese enlace.",
      requestNewCode: "Pedí un código nuevo desde acá.",
      otherBrowser:
        "Abriste el enlace en un navegador distinto al que usaste para pedirlo. Volvé a Lista en ese navegador: si no se actualizó sola, pedí un código nuevo e ingresalo ahí.",
    },
    errors: {
      invalidEmail: "Revisá el correo: parece que no es válido.",
      wrongCode:
        "El código no es correcto. Revisá que sea el del último correo que te mandamos.",
      expiredCode: "El código venció. Pedí uno nuevo.",
      rateLimited:
        "Hiciste muchos intentos seguidos. Esperá un minuto y probá de nuevo.",
      network: "No pudimos conectarnos. Revisá tu conexión y probá de nuevo.",
      unknown: "Algo salió mal. Probá de nuevo en un rato.",
    },
  },
  design: {
    title: "Sistema de diseño",
    eyebrow: "Sistema de diseño · página interna",
    heading: { lead: "Fresh", em: "Editorial" },
    intro:
      "Tokens, tipografía, espaciado, superficies, motion y estados del sistema. Es la referencia viva: lo que no está acá no existe en la interfaz.",
    sections: {
      brand: { eyebrow: "Marca", title: "Wordmark provisional" },
      type: { eyebrow: "Tipografía", title: "Tres roles, siete tamaños" },
      color: { eyebrow: "Color", title: "Papel, tinta y un acento" },
      categories: {
        eyebrow: "Categorías",
        title: "Diez tintes, una saturación",
      },
      spacing: {
        eyebrow: "Espaciado y radios",
        title: "Dos variables fluidas",
      },
      surfaces: { eyebrow: "Superficies", title: "Papel, pistacho, tinta" },
      motion: { eyebrow: "Motion", title: "Rápido en lo frecuente" },
      states: { eyebrow: "Estados", title: "Acción, campo, fila" },
    },
    brand: {
      note: "Instrument Serif, pensado para reemplazarse sin tocar el sistema.",
      headerSample: "Como se ve en la cabecera",
    },
    type: {
      display: {
        sample: "Lo de",
        em: "siempre",
        meta: "Display · Instrument Serif · text-display",
      },
      title: {
        sample: "Tu lista está lista",
        meta: "Título · Instrument Serif · text-title",
      },
      heading: {
        sample: "Pendientes",
        meta: "Encabezado · Geist 500 · text-heading",
      },
      row: {
        sample: "Tomates perita",
        qty: "1 kg",
        meta: "Fila · Geist 400 · text-row",
      },
      body: {
        sample:
          "Lo que marques como comprado baja al carro. Al terminar, vaciá el carro y queda en tu historial.",
        meta: "Cuerpo · Geist 400 · text-body",
      },
      label: { sample: "Agregar", meta: "Etiqueta · Geist 500 · text-label" },
      eyebrow: {
        sample: "Agregado por Ana · hace 2 min",
        meta: "Eyebrow · Geist 500 · mayúsculas · text-eyebrow",
      },
      data: { sample: "$ 1.240", meta: "Dato · Geist Mono · tabular" },
    },
    color: {
      light: "Claro",
      dark: "Oscuro",
      pairs: "Pares de uso y contraste",
      pair: "Par",
      ratio: "Ratio",
      minimum: "Mínimo",
      pass: "Cumple",
      fail: "No cumple",
      actionSample: "Acción primaria",
      doneSample: "Hecho",
    },
    categories: {
      thread: "Hilo de 2px junto a la agrupación",
      names: {
        verduras: "Frutas y verduras",
        carnes: "Carnes y pescados",
        lacteos: "Fiambres y lácteos",
        panaderia: "Panadería",
        almacen: "Almacén",
        bebidas: "Bebidas",
        congelados: "Congelados",
        limpieza: "Limpieza",
        higiene: "Higiene",
        otros: "Otros",
      },
    },
    spacing: {
      margin: "Margen · clamp(16px, 4vw, 40px)",
      gap: "Gap · clamp(12px, 1.5vw, 24px)",
      steps: "Interior · pasos de 4px",
      radii: {
        none: "0 · reglas y agrupaciones",
        field: "6px · campos y chips",
        sheet: "12px · hojas y tarjetas-objeto",
        pill: "Píldora · acciones principales",
      },
    },
    surfaces: {
      paper: "Papel · base",
      paper2: "Pistacho · carro, hojas, agrupaciones",
      inverse: "Tinta · momentos editoriales",
      inverseSample: {
        lead: "Carro",
        em: "vacío",
        body: "Buena compra. Lo de hoy quedó en tu historial.",
      },
      sheet: "Hoja · la única sombra del sistema",
      sheetTitle: "Compartir lista",
      sheetBody: "Quien abra el enlace puede agregar y marcar ítems.",
    },
    motion: {
      token: "Token",
      value: "Valor",
      use: "Uso",
      tokens: [
        {
          token: "--motion-ease-out",
          value: "cubic-bezier(0.19, 1, 0.22, 1)",
          use: "Entradas, hover, cambios de estado",
        },
        {
          token: "--motion-ease-in-out",
          value: "cubic-bezier(0.65, 0.05, 0, 1)",
          use: "Movimientos largos y cinematográficos",
        },
        {
          token: "--motion-dur-instant",
          value: "120 ms",
          use: "Pressed, toggles, foco",
        },
        {
          token: "--motion-dur-fast",
          value: "200 ms",
          use: "Hover, elementos pequeños",
        },
        {
          token: "--motion-dur-base",
          value: "320 ms",
          use: "Marcar ítem, reordenar, hojas",
        },
        {
          token: "--motion-dur-slow",
          value: "600 ms",
          use: "Transiciones de vista",
        },
        {
          token: "--motion-dur-cinematic",
          value: "900 ms",
          use: "Momentos editoriales, una vez por sesión",
        },
        {
          token: "--motion-stagger",
          value: "35 ms",
          use: "Entre elementos de una lista que entra",
        },
      ],
      replay: "Reproducir entrada",
      check: "Marcar y desmarcar",
      pulse: "Cambio de otro miembro",
      reducedNote:
        "Con movimiento reducido activado, las entradas pierden el desplazamiento y el escalonado; los fundidos se mantienen.",
      demoItems: [
        "Tomates perita",
        "Pan de campo",
        "Yogur natural",
        "Papel de cocina",
        "Café molido",
      ],
    },
    states: {
      buttons: "Botones",
      buttonVariants: {
        default: "Agregar",
        secondary: "Compartir",
        outline: "Reintentar",
        ghost: "Cancelar",
        danger: "Salir de la lista",
        link: "Usar otro correo",
        disabled: "Guardando…",
        icon: "Agregar producto",
        iconLarge: "Agregar",
      },
      sizes: "Tamaños",
      sizeLabels: { sm: "Compacto", touch: "Táctil", touchLg: "Principal" },
      fields: "Campos",
      field: {
        label: "Producto",
        placeholder: "Leche, pan, tomates…",
        help: "Solo el nombre es obligatorio.",
        invalidLabel: "Tu correo",
        invalidValue: "nombre@correo",
        invalidHelp: "Revisá el correo: parece que no es válido.",
        disabledLabel: "Lista",
        disabledValue: "Mi lista",
      },
      chips: "Chips de categoría",
      chipsInteractive: "Selector: tocá para elegir",
      eyebrows: "Eyebrow",
      eyebrowSamples: [
        "Agregado por Ana · hace 2 min",
        "Frutas y verduras",
        "Hoy",
      ],
      rows: "Filas de la lista",
      rowItems: [
        { name: "Tomates perita", quantity: "1 kg", note: "", checked: false },
        {
          name: "Yogur natural",
          quantity: "2",
          note: "El de vidrio, no el de plástico",
          checked: false,
        },
        { name: "Pan de campo", quantity: "", note: "", checked: true },
      ],
      rowToggle: (name: string) => `Marcar ${name} como comprado`,
      rowHighlight: "Simular cambio de otro miembro",
      sections: "Sección",
      section: {
        title: "Frutas y verduras",
        count: 3,
        eyebrow: "Pasillo 1",
        empty: "Nada pendiente en esta categoría.",
        emptyTitle: "Congelados",
      },
      sheets: "Hoja",
      sheet: {
        open: "Abrir hoja",
        openBottom: "Abrir desde abajo",
        title: "Compartir lista",
        description: "Quien abra el enlace puede agregar y marcar ítems.",
        fieldLabel: "Enlace",
        fieldValue: "lista.app/i/7f3k2",
        confirm: "Copiar enlace",
        cancel: "Cancelar",
      },
      banners: "Avisos",
      banner: {
        info: {
          title: "Sin conexión",
          body: "Volvemos a intentar solos en unos segundos.",
          action: "Reintentar",
        },
        attention: {
          title: "Ana agregó 3 productos",
          body: "Hace un momento.",
        },
        error: {
          title: "No se guardó el cambio",
          body: "Revisá tu conexión y probá de nuevo.",
          action: "Reintentar",
        },
      },
    },
  },
} as const;

export type Texts = typeof texts;
