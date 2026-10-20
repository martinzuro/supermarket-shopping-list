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
      /** Título del grupo de lo que no tiene categoría (la lista no tiene "Otros"). */
      uncategorized: "Otros",
    },
    cart: {
      title: "En el carro",
      empty: "Lo que marques como comprado baja acá.",
      emptyAction: "Vaciar el carro",
    },
    /**
     * Lo que se estima gastar en una sección: el total por moneda y, si a
     * algún producto le falta el precio, a cuántos cubre.
     */
    estimate: {
      label: "Estimado",
      covered: (priced: number, count: number) =>
        `${priced} de ${count} con precio`,
    },
    loadError: {
      title: "No pudimos cargar tu lista",
      body: "Revisá tu conexión y probá de nuevo.",
      retry: "Reintentar",
    },
  },
  addItem: {
    label: "Producto para agregar",
    placeholder: "Leche, pan, tomates…",
    submit: "Agregar",
  },
  editItem: {
    title: "Editar producto",
    name: "Nombre",
    quantity: "Cantidad",
    unit: "Unidad",
    unitPlaceholder: "kg, L, paquete",
    note: "Nota",
    noteHelp: "Marca, tamaño o lo que quieras recordar.",
    category: "Categoría",
    /** La etiqueta sigue a la unidad escrita: el precio es el de góndola. */
    price: {
      kg: "Precio por kg",
      L: "Precio por litro",
      unit: "Precio por unidad",
    },
    pricePlaceholder: "Sin precio",
    /** El monto va aparte, en mono: "Total: $ 135". */
    lineTotal: "Total:",
    currency: {
      label: "Moneda",
      /** Lo que se ve es el símbolo; el nombre es el de lector de pantalla. */
      uyu: { symbol: "$", name: "pesos uruguayos" },
      usd: { symbol: "US$", name: "dólares" },
    },
    save: "Guardar",
    remove: "Borrar",
    confirmRemove: "Tocá otra vez para borrar",
    errors: {
      name: "Escribí el nombre del producto.",
      quantity: "Usá un número mayor que 0, como 2, 1,5 o 500.",
      price: "Escribí un precio como 120, 49,90 o 1.200.",
    },
  },
  /**
   * El recorrido: el orden de las categorías, que es el orden de los grupos
   * de Pendientes. Se edita en una hoja que abre la cabecera de Pendientes.
   */
  route: {
    /** Nombre accesible del botón de la cabecera de Pendientes. */
    open: "Ordenar el recorrido",
    title: "Recorrido",
    description:
      "Ordená las categorías como recorrés el súper. Pendientes sigue este orden.",
    listLabel: "Categorías, en el orden del recorrido",
    up: (name: string) => `Subir “${name}”`,
    down: (name: string) => `Bajar “${name}”`,
    /** Lo que lee la región cortés tras mover una categoría. */
    position: (name: string, place: number, total: number) =>
      `“${name}”, ${place} de ${total}`,
    /** Solo para lectores de pantalla: el número de la fila va visible. */
    pendingCount: (count: number) =>
      count === 1 ? "1 pendiente" : `${count} pendientes`,
    /** El servidor rechazó el movimiento y la categoría volvió a su lugar. */
    error: {
      title: (name: string) => `No se movió “${name}”`,
      body: "Volvió a donde estaba. Probá de nuevo.",
    },
  },
  /** Aviso cuando el servidor rechaza un cambio que ya se veía aplicado. */
  itemErrors: {
    add: (name: string) => `No se guardó “${name}”`,
    addRestored: "Lo escrito volvió al campo para que pruebes de nuevo.",
    addLost: "Probá agregarlo de nuevo.",
    check: (name: string) => `No se marcó “${name}”`,
    uncheck: (name: string) => `No se desmarcó “${name}”`,
    toggleBody: "Volvió a donde estaba. Probá de nuevo.",
    edit: (name: string) => `No se guardaron los cambios de “${name}”`,
    editBody: "Quedó como estaba. Probá de nuevo.",
    remove: (name: string) => `No se borró “${name}”`,
    removeBody: "Volvió a la lista. Probá de nuevo.",
    emptyCart: "No se vació el carro",
    emptyCartBody: "Lo que estaba en el carro volvió. Probá de nuevo.",
    dismiss: "Cerrar aviso",
  },
  /**
   * Lo que otro miembro hizo en la lista, para lectores de pantalla (el
   * pulso de la fila es solo color). Sin autor: todavía no hay perfiles.
   */
  remoteChanges: {
    one: {
      added: (name: string) => `Agregaron “${name}”`,
      checked: (name: string) => `Pasaron “${name}” al carro`,
      unchecked: (name: string) => `Devolvieron “${name}” a pendientes`,
      edited: (name: string) => `Cambiaron “${name}”`,
      removed: (name: string) => `Sacaron “${name}” de la lista`,
    },
    many: {
      added: (count: number) => `Agregaron ${count} productos`,
      checked: (count: number) => `Pasaron ${count} productos al carro`,
      unchecked: (count: number) =>
        `Devolvieron ${count} productos a pendientes`,
      edited: (count: number) => `Cambiaron ${count} productos`,
      removed: (count: number) => `Sacaron ${count} productos de la lista`,
    },
    mixed: (count: number) => `Hubo cambios en ${count} productos`,
    /** Otro miembro movió una categoría en la hoja del recorrido. */
    reordered: "Cambiaron el orden del recorrido",
  },
  sheet: {
    close: "Cerrar",
  },
  menu: {
    title: "Menú",
  },
  /**
   * Compartir (dueño): la hoja de la cabecera. Un invitado sin cuenta
   * convierte primero la suya (account.*); con cuenta ve la invitación.
   */
  share: {
    open: "Compartir lista",
    title: "Compartir lista",
    description:
      "Mandá un enlace y la otra persona ve la misma lista que vos, con los cambios al instante.",
    descriptionShared:
      "Quiénes ven esta lista, y un enlace para sumar a alguien más.",
    inviteHeading: "Sumar a alguien más",
    loading: "Cargando tu lista…",
    offline:
      "Sin conexión. Cuando vuelva la red vas a poder armar el enlace para compartir.",
    guest: {
      why: "Para compartir, tu lista tiene que quedar guardada en una cuenta: así no se pierde y la otra persona sigue viéndola.",
      intro:
        "Ingresá tu correo y te mandamos un código de 6 dígitos. Después seguís acá y armás el enlace.",
    },
    converted: "Listo, tu lista quedó guardada. Acá está tu enlace.",
    card: {
      eyebrow: "Invitación",
      linkLabel: "Enlace de invitación",
      preparing: "Preparando tu enlace…",
      note: "Sirve para una persona y vence en 7 días.",
    },
    actions: {
      share: "Compartir enlace",
      copy: "Copiar enlace",
      copied: "Enlace copiado",
      another: "Armar otro enlace",
      anotherHint: "Cada enlace es para una sola persona.",
    },
    copyFailed:
      "No pudimos copiarlo solo. Dejamos el enlace seleccionado: copialo a mano.",
    message: {
      title: "Sumate a mi lista",
      text: "Te invito a compartir mi lista de compras en Lista.",
    },
    errors: {
      network:
        "No pudimos armar el enlace. Revisá tu conexión y probá de nuevo.",
      notAuthenticated:
        "Se perdió tu sesión. Recargá la página y probá de nuevo.",
      unknown: "Algo salió mal al armar el enlace. Probá de nuevo en un rato.",
      retry: "Reintentar",
    },
  },
  /**
   * Quiénes comparten la lista (hoja de la cabecera, para todos los
   * miembros): el dueño saca a alguien, cada miembro puede salir. No hay
   * perfiles: a cada persona se la reconoce por su correo.
   */
  members: {
    /** Acción de la cabecera para quien no es el dueño (no puede invitar). */
    open: "Ver quién comparte la lista",
    title: "Lista compartida",
    description: "Las personas que ven esta lista y la cambian con vos.",
    heading: "Quiénes comparten",
    loading: "Cargando…",
    you: "Vos",
    owner: "Dueño",
    noAccount: "Sin cuenta",
    /** Nombre de una persona sin cuenta, para el lector de pantalla. */
    noAccountSpoken: "una persona sin cuenta",
    remove: {
      action: "Sacar",
      confirm: "Tocá otra vez",
      label: (name: string) => `Sacar a ${name}`,
      confirmLabel: (name: string) => `Tocá otra vez para sacar a ${name}`,
      consequence: "Va a dejar de ver la lista.",
    },
    leave: {
      hint: "Si salís, dejás de ver esta lista. Para volver necesitás una invitación nueva.",
      action: "Salir de la lista",
      confirm: "Tocá otra vez para salir",
    },
    errors: {
      load: "No pudimos cargar quiénes comparten la lista.",
      remove:
        "No pudimos sacar a esa persona. Sigue en la lista: probá de nuevo.",
      retry: "Reintentar",
    },
  },
  /**
   * Avisos de la pantalla de la lista cuando la lista que se veía se fue:
   * saliste, ya no estás (te sacaron, saliste desde otro dispositivo o la
   * lista ya no existe: por eso es neutro) o salir falló.
   */
  membershipNotice: {
    left: {
      title: "Saliste de la lista",
      body: "Ya no la ves. Para volver necesitás una invitación nueva.",
    },
    removed: {
      title: "Ya no estás en esa lista",
      body: "Acá está tu lista.",
    },
    leaveFailed: {
      title: "No pudimos sacarte de la lista",
      body: "Seguís en ella. Probá de nuevo.",
    },
    dismiss: "Cerrar aviso",
  },
  /**
   * Traer lo de otra lista a la actual: lo que quedó atrás al unirte a una
   * lista compartida, o lo que anotaste sin cuenta en este dispositivo antes
   * de entrar a tu cuenta.
   */
  bringOver: {
    count: (count: number) => (count === 1 ? "1 cosa" : `${count} cosas`),
    leftover: {
      title: (text: string) => `${text} en tu lista anterior`,
      body: "Las anotaste antes de unirte a esta lista. ¿Las traés acá o las descartás?",
      bring: "Traerlas acá",
      bringing: "Trayendo…",
      drop: "Descartarlas",
      dropping: "Descartando…",
      empty: {
        title: "Seguís en otra lista",
        body: "No la ves ahora y no tiene nada anotado. ¿Salís de ella?",
      },
      shared: {
        title: (text: string) => `${text} en otra lista que compartís`,
        body: "Es una lista de otra persona. Podés copiar lo que tiene a esta, o salir de ella.",
        bring: "Copiarlas acá",
        drop: "Salir de esa lista",
        dropping: "Saliendo…",
      },
    },
    carryOver: {
      title: (text: string) =>
        `${text} que anotaste en este dispositivo sin cuenta`,
      body: "Las anotaste antes de entrar a tu cuenta. ¿Las traés a esta lista?",
      bring: "Traerlas",
      bringing: "Trayendo…",
      leave: "Dejarlas afuera",
      hint: "Si las dejás afuera, no van a aparecer en tu cuenta.",
    },
    errors: {
      network: "No pudimos conectarnos. Revisá tu conexión y probá de nuevo.",
      list_shared:
        "Alguien se unió a esa lista mientras tanto, así que no se puede descartar. Quedó donde estaba.",
      gone: "Eso ya no está disponible. No hay nada más para traer.",
      unknown: "Algo salió mal. Probá de nuevo en un rato.",
    },
  },
  /** Pantalla de la invitación (/invite/<enlace>): el momento editorial de quien recibe. */
  invite: {
    eyebrow: "Invitación",
    from: "Te invita",
    unknownInviter: "Una persona que usa Lista",
    loading: {
      lead: "Abriendo la",
      em: "invitación",
      tail: "…",
      body: "Un momento.",
    },
    offline: {
      eyebrow: "Sin conexión",
      lead: "Sin",
      em: "conexión",
      tail: "",
      body: "Necesitamos internet para abrir la invitación. Revisá tu conexión y probá de nuevo.",
    },
    loadError: {
      eyebrow: "Algo falló",
      lead: "No pudimos abrir la",
      em: "invitación",
      tail: ".",
      body: "Revisá tu conexión y probá de nuevo.",
    },
    valid: {
      lead: "Te invitaron a",
      em: "compartir",
      tail: " una lista.",
      body: "Van a ver la misma lista, y cada cambio de uno le aparece al otro al instante.",
    },
    member: {
      eyebrow: "Ya estás adentro",
      lead: "Ya estás en",
      em: "esta lista",
      tail: ".",
      body: "Esta invitación es de una lista que ya compartís. No hace falta usarla de nuevo.",
    },
    own: {
      eyebrow: "Tu invitación",
      lead: "Este enlace es",
      em: "tuyo",
      tail: ".",
      body: "Mandáselo a quien quieras que compre con vos. Cada enlace sirve para una sola persona.",
    },
    used: {
      eyebrow: "Invitación usada",
      lead: "Esta invitación ya",
      em: "se usó",
      tail: ".",
      body: "Cada enlace sirve para una sola persona. Pedile a quien te invitó que te mande uno nuevo.",
    },
    expired: {
      eyebrow: "Invitación vencida",
      lead: "Esta invitación",
      em: "venció",
      tail: ".",
      body: "Los enlaces duran 7 días. Pedile a quien te invitó que te mande uno nuevo.",
    },
    notFound: {
      eyebrow: "Invitación no encontrada",
      lead: "No encontramos",
      em: "esa invitación",
      tail: ".",
      body: "Puede que el enlace esté cortado o incompleto. Revisalo, o pedile a quien te invitó que te mande uno nuevo.",
    },
    actions: {
      join: "Unirme a la lista",
      joining: "Uniéndote…",
      later: "Ahora no",
      joinAnyway: "Unirme igual",
      goToList: "Ir a la lista",
      goToMyList: "Ir a mi lista",
      retry: "Reintentar",
      retryJoin: "Probar de nuevo",
    },
    /**
     * Quien invita ya tiene una lista propia que otras personas usan: unirse
     * a otra la deja atrás, sin verla (la v1 muestra una sola lista).
     */
    guard: {
      eyebrow: "Antes de unirte",
      title: (others: number) =>
        others === 1
          ? "Hay 1 persona más en tu lista."
          : `Hay ${others} personas más en tu lista.`,
      body: (others: number) =>
        others === 1
          ? "Si te unís a esta, esa persona sigue con tu lista y vos dejás de verla. Además, nadie más va a poder sumarse a esa lista."
          : "Si te unís a esta, esas personas siguen con tu lista y vos dejás de verla. Además, nadie más va a poder sumarse a esa lista.",
    },
    joining: "Uniéndote a la lista…",
    errors: {
      invite_not_found: "Esa invitación ya no existe. Pedí un enlace nuevo.",
      invite_already_used:
        "Alguien acaba de usar esta invitación. Pedí un enlace nuevo.",
      invite_expired: "La invitación venció. Pedí un enlace nuevo.",
      not_authenticated:
        "Se perdió tu sesión. Recargá la página y probá de nuevo.",
      network: "No pudimos conectarnos. Revisá tu conexión y probá de nuevo.",
      unknown: "Algo salió mal. Probá de nuevo en un rato.",
    },
  },
  moments: {
    cartEmptied: {
      eyebrow: "Compra terminada",
      lead: "Buena",
      em: "compra",
      body: "El carro quedó vacío. Lo que faltó sigue en tu lista.",
      action: "Volver a la lista",
    },
  },
  welcome: {
    label: "Bienvenida",
    headline: { lead: "Lo de", em: "siempre", tail: "sin pensarlo." },
    body: "Agregá lo que falta, marcá lo que ya está en el carro y compartí la lista con quien compre con vos.",
    items: ["Tomates perita", "Pan de campo", "Café molido"],
    cta: "Empezar",
  },
  offline: {
    title: "Sin conexión",
    body: "Lista necesita internet para mostrar y guardar tus listas. Revisá tu conexión y probá de nuevo.",
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
        "Ese correo ya tiene una cuenta: al entrar vas a ver sus listas. Lo que agregaste sin cuenta en este dispositivo no se pierde: cuando entres te preguntamos si querés traerlo a tu lista.",
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
      illustration: {
        eyebrow: "Ilustración",
        title: "Monolínea, papel y tinta",
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
      icons: "Iconos propios · monolínea 1.5px · 48, 20 y 14px",
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
    illustration: {
      emptyBag: "Bolsa vacía · nada pendiente",
      cart: "Changuito · nada en el carro",
      fullBag: "Bolsa llena · compra terminada, con el único relleno en lima",
      invitation: "Dos hojas · la misma lista, de dos personas",
      note: "Grilla de 120, trazo fijo de 1.5px, tinta secundaria en los estados vacíos y tinta inversa en los momentos editoriales.",
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
      moment: "Momento editorial · entra escalonado · se usa pocas veces",
      sheet: "Hoja · la única sombra del sistema",
      invitation:
        "Invitación · el objeto de compartir: pistacho, línea de corte, enlace legible. Listo y preparando",
      invitationList: "Mi lista",
      invitationLink: "https://lista.app/invite/9f3k2m7x4c8d1b6a5e0h2j9q",
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
      empty: "Estados vacíos",
      rows: "Filas de la lista",
      rowItems: [
        {
          name: "Tomates perita",
          quantity: "1,5 kg",
          total: "$ 135",
          note: "",
          checked: false,
        },
        {
          name: "Yogur natural",
          quantity: "2",
          total: "US$ 4",
          note: "El de vidrio, no el de plástico",
          checked: false,
        },
        {
          name: "Pan de campo",
          quantity: "",
          total: "",
          note: "",
          checked: true,
        },
      ],
      rowHighlight: "Simular cambio de otro miembro",
      sections: "Sección",
      section: {
        title: "Frutas y verduras",
        count: 3,
        eyebrow: "Pasillo 1",
        empty: "Nada pendiente en esta categoría.",
        emptyTitle: "Congelados",
        groupNote: "Grupo de categoría dentro de Pendientes · h3",
        groupTitle: "Fiambres y lácteos",
        groupCount: 1,
        groupItem: "Yogur natural",
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
        footer: {
          title: "3 cosas en tu lista anterior",
          body: "Las anotaste antes de unirte a esta lista. ¿Las traés acá o las descartás?",
          primary: "Traerlas acá",
          secondary: "Descartarlas",
        },
      },
    },
  },
} as const;

export type Texts = typeof texts;
