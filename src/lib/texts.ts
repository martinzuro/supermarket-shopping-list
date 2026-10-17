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
} as const;

export type Texts = typeof texts;
