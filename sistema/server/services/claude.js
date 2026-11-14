const Anthropic = require("@anthropic-ai/sdk");
const db = require("../db");
const { aFecha } = require("../utils/fechas");
const { aTextoWhatsapp } = require("../utils/formatoWhatsapp");
const { format } = require("date-fns");
const googleCalendar = require("./googleCalendar");
const googleMeet = require("./googleMeet");
const googleSheets = require("./googleSheets");
const openrouter = require("./openrouter");
const deepseek = require("./deepseek");
const mcpManager = require("./mcpManager");
const conversacionesService = require("./conversaciones");
const clavesIA = require("./clavesIA");
const conocimiento = require("./conocimiento");
const inscripciones = require("./inscripciones");
const pedidos = require("./pedidos");

const HERRAMIENTAS_DE_SOLO_LECTURA = ["consultar_disponibilidad", "ver_turnos_paciente", "ver_inscripciones", "ver_pedidos"];
const HERRAMIENTAS_MUTANTES = ["agendar_turno", "cancelar_turno", "reprogramar_turno", "registrar_inscripcion", "registrar_pedido"];

// Salvaguarda anti-alucinacion: un modelo puede, bajo presion conversacional
// (el cliente lo corrige, insiste, etc.), "confirmar" en texto que agendo/
// cancelo/reprogramo un turno sin haber llamado realmente la herramienta —
// inventando fechas e IDs de turno que no existen en la base de datos. Este
// patron detecta ese tipo de frase para poder frenarla antes de que llegue al
// cliente (ver `verificarConfirmacionReal` mas abajo).
const VERBOS_CONFIRMACION_ACCION =
  "(confirmad[oa]|agendad[oa]|reprogramad[oa]|cancelad[oa]|reservad[oa]|registrad[oa]|inscrit[oa]|agend[oé]|reprogram[oé]|cancel[oé]|confirm[oé]|reserv[oé]|registr[eé]|inscrib[ií])";
const PATRON_CONFIRMACION_ACCION = new RegExp(
  "\\b(cita|turno|reuni[oó]n|inscripci[oó]n|sesi[oó]n|pedido)\\b[^.!?\\n]{0,40}\\b" +
    VERBOS_CONFIRMACION_ACCION +
    "|\\b" +
    VERBOS_CONFIRMACION_ACCION +
    "[^.!?\\n]{0,40}\\b(cita|turno|reuni[oó]n|inscripci[oó]n|sesi[oó]n|pedido)\\b|id\\s*de\\s*(turno|inscripci[oó]n|pedido)|FF-\\d+|turno\\s*#\\s*\\d+",
  "i"
);

// Herramientas que solo informan el estado de algo existente: si se llamaron
// en el turno, contarle al cliente "tu inscripcion esta confirmada" no es fabricado.
const HERRAMIENTAS_DE_ESTADO = ["ver_turnos_paciente", "ver_inscripciones", "ver_pedidos"];

const MAX_TOKENS = 1024;
const MAX_ITERACIONES_TOOLS = 5;

const DURACION_TURNO_MINUTOS = 30;
const HORA_APERTURA = "09:00";
const HORA_CIERRE = "20:00"; // ultimo turno empieza 30 min antes de esta hora

/** Genera la grilla de horarios disponibles cada DURACION_TURNO_MINUTOS entre apertura y cierre. */
function generarHorariosDisponibles() {
  const [horaApertura, minApertura] = HORA_APERTURA.split(":").map(Number);
  const [horaCierre, minCierre] = HORA_CIERRE.split(":").map(Number);
  const inicioMin = horaApertura * 60 + minApertura;
  const finMin = horaCierre * 60 + minCierre;

  const horarios = [];
  for (let m = inicioMin; m < finMin; m += DURACION_TURNO_MINUTOS) {
    const h = String(Math.floor(m / 60)).padStart(2, "0");
    const min = String(m % 60).padStart(2, "0");
    horarios.push(`${h}:${min}`);
  }
  return horarios;
}

const HORARIOS_DISPONIBLES = generarHorariosDisponibles();

// El cliente se recrea si cambia la clave (se puede cargar desde el dashboard sin reiniciar).
let clienteClaude = null;
let claveClienteClaude = null;
function obtenerClienteClaude() {
  const clave = clavesIA.obtenerClave("claude");
  if (!clave) throw new Error("Claude no esta configurado (falta su API key).");
  if (clave !== claveClienteClaude) {
    clienteClaude = new Anthropic({ apiKey: clave });
    claveClienteClaude = clave;
  }
  return clienteClaude;
}

const TOOLS = [
  {
    name: "consultar_disponibilidad",
    description: `Consulta los horarios ocupados y libres de la agencia para una fecha especifica. Los turnos van de ${HORA_APERTURA} a ${HORA_CIERRE}, cada ${DURACION_TURNO_MINUTOS} minutos.`,
    input_schema: {
      type: "object",
      properties: {
        fecha: {
          type: "string",
          description: "Fecha a consultar, formato YYYY-MM-DD",
        },
      },
      required: ["fecha"],
    },
  },
  {
    name: "ver_turnos_paciente",
    description:
      "Devuelve todos los turnos activos (no cancelados) de un cliente segun su numero de telefono.",
    input_schema: {
      type: "object",
      properties: {
        numero_telefono: {
          type: "string",
          description: "Numero de telefono del cliente",
        },
      },
      required: ["numero_telefono"],
    },
  },
  {
    name: "agendar_turno",
    description:
      "Agenda un nuevo turno/reunion para un cliente, previa verificacion de disponibilidad.",
    input_schema: {
      type: "object",
      properties: {
        numero_telefono: { type: "string", description: "Numero de telefono del cliente" },
        nombre_cliente: { type: "string", description: "Nombre y apellido del cliente" },
        fecha_turno: {
          type: "string",
          description: "Fecha y hora del turno en formato ISO, ej: 2026-08-27T15:00:00",
        },
        tipo_turno: { type: "string", description: "Tipo de consulta o servicio solicitado" },
        modalidad: {
          type: "string",
          enum: ["virtual", "presencial"],
          description:
            "Si el turno es virtual (reunion online) o presencial (en las instalaciones). SIEMPRE hay que preguntarselo al cliente antes de agendar, nunca asumirlo.",
        },
        notas: { type: "string", description: "Notas adicionales (opcional)" },
      },
      required: ["numero_telefono", "nombre_cliente", "fecha_turno", "tipo_turno", "modalidad"],
    },
  },
  {
    name: "cancelar_turno",
    description: "Cancela un turno existente a partir de su ID.",
    input_schema: {
      type: "object",
      properties: {
        id_turno: { type: "integer", description: "ID del turno a cancelar" },
      },
      required: ["id_turno"],
    },
  },
  {
    name: "reprogramar_turno",
    description: "Reprograma un turno existente a una nueva fecha, previa verificacion de disponibilidad.",
    input_schema: {
      type: "object",
      properties: {
        id_turno: { type: "integer", description: "ID del turno a reprogramar" },
        nueva_fecha: {
          type: "string",
          description: "Nueva fecha y hora en formato ISO, ej: 2026-08-28T11:00:00",
        },
      },
      required: ["id_turno", "nueva_fecha"],
    },
  },
  {
    name: "registrar_inscripcion",
    description:
      "Registra la inscripcion de un interesado a un curso, taller, asesoria o programa que ofrezca la agencia. Usala solo cuando el interesado confirme que quiere inscribirse y ya tengas sus datos.",
    input_schema: {
      type: "object",
      properties: {
        numero_telefono: { type: "string", description: "Numero de telefono del contacto (el de esta conversacion)" },
        nombre: { type: "string", description: "Nombres y apellidos completos" },
        email: { type: "string", description: "Correo electronico (si lo dio o si el programa lo requiere)" },
        whatsapp: {
          type: "string",
          description: "Numero de WhatsApp de contacto (solo si se conversa por el chat web; por WhatsApp ya se tiene)",
        },
        programa: { type: "string", description: "Nombre del curso, taller, asesoria o programa al que se inscribe" },
        detalle: { type: "string", description: "Precision del programa: fecha/grupo elegido, plan, modalidad, etc. (opcional)" },
        notas: { type: "string", description: "Notas utiles para el equipo: medio de pago elegido, si ya pago, etc. (opcional)" },
      },
      required: ["numero_telefono", "nombre", "programa"],
    },
  },
  {
    name: "ver_inscripciones",
    description: "Devuelve las inscripciones activas de un contacto (programa y estado: pendiente, pago_reportado, confirmada).",
    input_schema: {
      type: "object",
      properties: {
        numero_telefono: { type: "string", description: "Numero de telefono del contacto" },
      },
      required: ["numero_telefono"],
    },
  },
  {
    name: "registrar_pedido",
    description:
      "Registra un pedido de impresion fotografica (revelado, ampliaciones, posters, cuadros canvas/foam, fotolibros, restauracion). Usala solo cuando el cliente confirme que quiere hacer el pedido y ya tengas: nombre, detalle de productos (tamano, acabado, cantidad) y forma de entrega (y direccion si es a domicilio).",
    input_schema: {
      type: "object",
      properties: {
        numero_telefono: { type: "string", description: "Numero de telefono del contacto (el de esta conversacion)" },
        nombre: { type: "string", description: "Nombres y apellidos completos" },
        whatsapp: { type: "string", description: "WhatsApp de contacto (solo si se conversa por el chat web)" },
        email: { type: "string", description: "Correo (opcional)" },
        productos: {
          type: "string",
          description: "Detalle del pedido, un item por linea: producto, tamano, acabado (mate/brillo), cantidad. Ej: '30 fotos 10x15 brillo; 1 canvas 40x60'",
        },
        entrega: { type: "string", enum: ["tienda", "domicilio"], description: "Recojo en tienda o envio a domicilio" },
        direccion: { type: "string", description: "Direccion completa con distrito y referencia (obligatoria si es a domicilio)" },
        fecha_deseada: { type: "string", description: "Fecha en que lo necesita (opcional)" },
        fotos_enlace: { type: "string", description: "Enlace a las fotos (Drive, WeTransfer, etc.) si lo dio (opcional)" },
        notas: { type: "string", description: "Notas para el equipo (opcional)" },
      },
      required: ["numero_telefono", "nombre", "productos", "entrega"],
    },
  },
  {
    name: "ver_pedidos",
    description: "Devuelve los pedidos de impresion de un contacto con su codigo (FF-0001) y estado: nuevo, cotizado, en_produccion, listo, en_reparto, entregado.",
    input_schema: {
      type: "object",
      properties: { numero_telefono: { type: "string", description: "Numero de telefono del contacto" } },
      required: ["numero_telefono"],
    },
  },
];

const ZONA_HORARIA = "America/Lima";

/** Fecha/hora actual en la zona horaria de la agencia, en formato humano e ISO (YYYY-MM-DD). */
function obtenerFechaHoraActual() {
  const ahora = new Date();
  const humana = new Intl.DateTimeFormat("es-PE", {
    timeZone: ZONA_HORARIA,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(ahora);
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA }).format(ahora); // en-CA => YYYY-MM-DD
  return { humana, iso };
}

function construirSystemPrompt(config, numeroTelefono, esContactoNuevo = false, consulta = "") {
  let servicios = [];
  try {
    servicios = JSON.parse(config.servicios || "[]");
  } catch (error) {
    servicios = [];
  }

  const telefonoHumano = config.telefono_humano || config.telefono || "";
  const { humana: fechaHumana, iso: fechaISO } = obtenerFechaHoraActual();

  return `Eres Lumi, asistente virtual de ${config.nombre_agencia}, estudio de fotografia e impresion fotografica. Eres muy amable, profesional y eficiente.

FECHA Y HORA ACTUAL (usala SIEMPRE como referencia para "hoy", "mañana", "la proxima semana", etc. — nunca asumas otra fecha ni uses una fecha de otro año):
- ${fechaHumana} (hora de Peru, UTC-5)
- En formato ISO: ${fechaISO}

Tu rol es:
- Responder preguntas sobre el estudio, sus servicios de fotografia e impresion, tamanos, acabados y tiempos de entrega.
- Agendar, consultar, cancelar o reprogramar sesiones de fotos (en estudio o exteriores), fotos para documentos y coberturas de eventos, usando las herramientas de turnos (cada "turno" es una sesion o cita).
- Tomar pedidos de impresion con la herramienta registrar_pedido y dar el estado de un pedido con ver_pedidos. Para imprimir, el cliente envia sus fotos por este chat de WhatsApp en la mayor calidad posible (como documento/archivo, no como foto comprimida) o un enlace de Drive/WeTransfer.
- No confirmar precios que no esten en la base de conocimiento: el equipo confirma el precio final al revisar las fotos.
- Inscribir a talleres o cursos de fotografia (si el estudio los ofrece) con registrar_inscripcion.
- Ser calida y concisa en tus respuestas.
- Usar español latino neutro, formal pero cercano (tratar de "usted"). NUNCA usar modismos ni regionalismos de ningun pais en particular (evitar palabras como "acá", "vos", "che", "boludo", "pibe", "plata", "genial", y cualquier conjugacion de voseo como "tenés", "podés", "querés", "sos", "vení", "fijate", "avisale"; usar siempre las formas neutras: "aquí", "usted", "tiene", "puede", "quiere", "es", "venga", "fíjese", "avísele").
- Usar (a veces) emojis de forma moderada para ser cercano.
- Formato: estas escribiendo por WHATSAPP, no en Markdown de GitHub. Para negrita usa UN SOLO asterisco (*asi*), nunca dobles asteriscos (**asi**). No uses encabezados con #, ni lineas divisorias con ---. Para listas, usa un emoji o "•" al inicio de cada linea en vez de "-" o numeros con formato markdown. Cuando presentes varios servicios o datos (por ejemplo, una lista de servicios o los datos de un turno), separalos en lineas cortas con saltos de linea y un emoji distinto por item, para que se lea ordenado y no como un bloque de texto corrido.

Informacion de la agencia:
- Nombre: ${config.nombre_agencia}
- Direccion: ${config.direccion || "No especificada"}
- Numero de WhatsApp de este chat (el tuyo, no lo des como contacto alternativo): ${config.telefono || "No especificado"}
- Email: ${config.email || "No especificado"}
- Horarios: ${config.horarios || "No especificados"}
- Servicios disponibles: ${servicios.join(", ") || "No especificados"}
- Sobre nosotros: ${config.sobre_agencia || ""}

BASE DE CONOCIMIENTO (informacion oficial cargada por el equipo). Responde con ella y no inventes datos que no esten aqui ni en lo anterior; si algo no consta, dilo con naturalidad y ofrece que el equipo lo confirme:
${conocimiento.paraPrompt(consulta) || "(sin documentos cargados)"}

Contexto de la conversacion:
${
  numeroTelefono.startsWith("web:")
    ? `- Estas conversando por el CHAT WEB del sitio de ${config.nombre_agencia} (no por WhatsApp), con un visitante identificado internamente como "${numeroTelefono}". Ese es el "numero_telefono" que debes usar en las herramientas; NO es un telefono real ni debes mencionarlo al visitante.
- Como no tienes su telefono, antes de agendar o inscribirlo pidele su nombre completo, un numero de WhatsApp y su email, y pásalos en los campos "whatsapp"/"email" de agendar_turno (en notas) o registrar_inscripcion.
- El chat web solo muestra texto: usa *un asterisco* para negrita y evita tablas, encabezados o enlaces en formato markdown (pega las URLs tal cual).`
    : `- Estas conversando por WhatsApp con el numero ${numeroTelefono}. Ese es el "numero_telefono" que debes usar en las herramientas (consultar_disponibilidad, ver_turnos_paciente, agendar_turno, etc.) sin volver a pedirselo al cliente.`
}
${
  esContactoNuevo
    ? `- IMPORTANTE: este es el PRIMER mensaje de este cliente, pero el sistema YA le mando automaticamente un mensaje de bienvenida completo (se presento como Lumi de ${config.nombre_agencia} y pregunto en que puede ayudar) justo ANTES de que vieras este mensaje. El cliente ya leyo esa bienvenida. Por lo tanto, en tu respuesta:
  - NO empieces con "Hola", "¡Hola!" ni ningun saludo inicial.
  - NO digas tu nombre (Lumi) ni el nombre de la agencia a modo de presentacion, como si fuera la primera vez.
  - NO preguntes "¿en que puedo ayudarle?" si el cliente ya escribio algo especifico (eso ya se le pregunto en la bienvenida).
  - Si el mensaje del cliente es solo un saludo corto sin pedido concreto (ej: "Hola", "Buenas", "Hey", "Qué tal"), responder con algo muy breve invitandolo a contar que necesita, SIN repetir la presentacion. Ejemplo correcto: "Cuénteme, ¿en qué le puedo ayudar?" o "Quedo atenta, ¿qué necesita?". Ejemplo INCORRECTO (no usar esta forma): "¡Hola! Soy Lumi de ${config.nombre_agencia}, ¿en qué puedo ayudarle?".
  - Si el mensaje del cliente ya trae una pregunta o pedido concreto, responder directo a eso, sin ningun preambulo de saludo o presentacion.`
    : `- Ya tuviste conversacion previa con este cliente; no hace falta volver a presentarte ni saludar como si fuera la primera vez.`
}

Reglas importantes:
- Si el cliente quiere una sesion o cita, pedir nombre y apellido, fecha/hora preferida y el tipo de sesion (retrato, familia, documentos, producto, evento, etc.). Las sesiones son PRESENCIALES (modalidad "presencial"); solo una asesoria previa para eventos puede ser VIRTUAL si el cliente lo pide. Si es en exteriores o un evento, anotar el lugar en las notas.
- Si la cita es virtual, avisarle al cliente que va a recibir un link de la reunion (Google Meet) al confirmarse.
- Para pedidos a domicilio, avisar que le llegara un enlace para compartir su ubicacion exacta de entrega.
- Si no hay disponibilidad, sugerir alternativas.
- Nunca inventar informacion que no se tenga.
- CRITICO: nunca decir que un turno quedo agendado, cancelado o reprogramado (ni inventar un ID de turno) a menos que se haya llamado a la herramienta correspondiente EN ESTE MISMO turno y el resultado haya sido exitoso. Si falta un dato (nombre, modalidad, horario, etc.), pedirlo; no fabricar una confirmacion para sonar mas resolutivo. Si el cliente corrige o insiste, volver a llamar la herramienta con los datos correctos en vez de simplemente repetir una confirmacion en texto.
- Si no se puede resolver algo, o el cliente pide hablar con una persona real, pasarle este numero de contacto humano (es distinto al numero de este chat, no dar el propio): ${telefonoHumano}`;
}

/** Mensaje fijo enviado una unica vez, la primera vez que un numero nuevo le escribe a Lumi. */
function construirMensajeBienvenida(config) {
  return `¡Hola! 👋 Soy *Lumi*, la asistente virtual de *${config.nombre_agencia}*.

Puedo ayudarle a reservar una sesión de fotos 📸, tomar su pedido de impresiones 🖼️ o darle el estado de un pedido.

¿En qué le puedo ayudar hoy?`;
}

function extraerHora(fechaTurno) {
  const fecha = aFecha(fechaTurno);
  if (!fecha) return null;
  return format(fecha, "HH:mm");
}

/**
 * Disponibilidad de un dia: cruza los turnos ya agendados en la DB con los
 * eventos que existan en Google Calendar para ese dia (incluye bloqueos que
 * la agencia haya puesto manualmente ahi, no solo turnos generados por el bot).
 */
async function obtenerDisponibilidad(fechaEntrada) {
  const fechaObj = aFecha(fechaEntrada);
  const fechaISO = fechaObj ? format(fechaObj, "yyyy-MM-dd") : fechaEntrada;

  const turnosDelDia = db
    .prepare(
      `SELECT fecha_turno FROM turnos
       WHERE date(fecha_turno) = date(?) AND estado != 'cancelado'`
    )
    .all(fechaEntrada);

  const horariosOcupadosDB = turnosDelDia.map((t) => extraerHora(t.fecha_turno)).filter(Boolean);

  const eventosCalendar = await googleCalendar.obtenerEventosOcupados(fechaISO);
  const horariosOcupadosCalendar = HORARIOS_DISPONIBLES.filter((hora) => {
    const inicioSlot = new Date(`${fechaISO}T${hora}:00-05:00`);
    const finSlot = new Date(inicioSlot.getTime() + DURACION_TURNO_MINUTOS * 60 * 1000);
    return eventosCalendar.some((evento) => inicioSlot < evento.fin && finSlot > evento.inicio);
  });

  const horariosOcupados = Array.from(new Set([...horariosOcupadosDB, ...horariosOcupadosCalendar]));
  const horariosLibres = HORARIOS_DISPONIBLES.filter((hora) => !horariosOcupados.includes(hora));

  return { fecha: fechaISO, horarios_ocupados: horariosOcupados, horarios_libres: horariosLibres };
}

function verTurnosPaciente({ numero_telefono }) {
  const turnos = db
    .prepare(
      `SELECT id, nombre_paciente, fecha_turno, tipo_turno, estado, notas, modalidad
       FROM turnos WHERE numero_telefono = ? AND estado != 'cancelado'
       ORDER BY fecha_turno ASC`
    )
    .all(numero_telefono);
  return { turnos };
}

async function agendarTurno({ numero_telefono, nombre_cliente, fecha_turno, tipo_turno, modalidad, notas }) {
  const hora = extraerHora(fecha_turno);
  if (!hora) {
    return { exito: false, mensaje: "La fecha del turno no tiene un formato valido." };
  }

  if (!["virtual", "presencial"].includes(modalidad)) {
    return { exito: false, mensaje: 'El campo modalidad debe ser "virtual" o "presencial". Pregúntale al cliente cual prefiere.' };
  }

  const { horarios_libres } = await obtenerDisponibilidad(fecha_turno);
  if (!horarios_libres.includes(hora)) {
    return {
      exito: false,
      mensaje: "El horario solicitado no esta disponible.",
      horarios_libres,
    };
  }

  let meetLink = null;
  if (modalidad === "virtual") {
    const espacio = await googleMeet.crearEspacioReunion();
    if (espacio.exito) meetLink = espacio.meetingUri;
  }

  const { id: googleEventId } = await googleCalendar.crearEvento({
    nombre_cliente,
    numero_telefono,
    fecha_turno,
    tipo_turno,
    modalidad,
    notas,
    meetLink,
  });

  const resultado = db
    .prepare(
      `INSERT INTO turnos (numero_telefono, nombre_paciente, fecha_turno, tipo_turno, estado, notas, google_event_id, modalidad)
       VALUES (?, ?, ?, ?, 'confirmado', ?, ?, ?)`
    )
    .run(numero_telefono, nombre_cliente, fecha_turno, tipo_turno, notas || null, googleEventId, modalidad);

  conversacionesService.actualizarNombreContacto(numero_telefono, nombre_cliente);
  googleSheets.agregarFilaTurno({ nombre_cliente, numero_telefono, fecha_turno, tipo_turno, modalidad, notas });

  return {
    exito: true,
    id_turno: resultado.lastInsertRowid,
    modalidad,
    link_reunion: meetLink || undefined,
    mensaje:
      modalidad === "virtual" && meetLink
        ? `Turno virtual agendado y confirmado. Link de la reunion: ${meetLink}`
        : modalidad === "virtual"
          ? "Turno virtual agendado y confirmado. El equipo te va a enviar el link de la reunion antes de la hora acordada."
          : "Turno agendado y confirmado correctamente.",
  };
}

async function cancelarTurno({ id_turno }) {
  const turno = db.prepare("SELECT id, google_event_id FROM turnos WHERE id = ?").get(id_turno);
  if (!turno) {
    return { exito: false, mensaje: "No se encontro un turno con ese ID." };
  }
  db.prepare("UPDATE turnos SET estado = 'cancelado' WHERE id = ?").run(id_turno);
  await googleCalendar.eliminarEvento(turno.google_event_id);
  return { exito: true, mensaje: "Turno cancelado correctamente." };
}

async function reprogramarTurno({ id_turno, nueva_fecha }) {
  const turno = db
    .prepare("SELECT id, numero_telefono, nombre_paciente, tipo_turno, notas, google_event_id, modalidad FROM turnos WHERE id = ?")
    .get(id_turno);
  if (!turno) {
    return { exito: false, mensaje: "No se encontro un turno con ese ID." };
  }

  const hora = extraerHora(nueva_fecha);
  if (!hora) {
    return { exito: false, mensaje: "La nueva fecha no tiene un formato valido." };
  }

  const { horarios_libres } = await obtenerDisponibilidad(nueva_fecha);
  if (!horarios_libres.includes(hora)) {
    return {
      exito: false,
      mensaje: "El nuevo horario no esta disponible.",
      horarios_libres,
    };
  }

  db.prepare("UPDATE turnos SET fecha_turno = ? WHERE id = ?").run(nueva_fecha, id_turno);
  await googleCalendar.actualizarEvento(turno.google_event_id, {
    nombre_cliente: turno.nombre_paciente,
    numero_telefono: turno.numero_telefono,
    fecha_turno: nueva_fecha,
    tipo_turno: turno.tipo_turno,
    modalidad: turno.modalidad,
    notas: turno.notas,
  });
  return { exito: true, mensaje: "Turno reprogramado correctamente." };
}

const EJECUTORES_TOOLS = {
  consultar_disponibilidad: ({ fecha }) => obtenerDisponibilidad(fecha),
  ver_turnos_paciente: verTurnosPaciente,
  agendar_turno: agendarTurno,
  cancelar_turno: cancelarTurno,
  reprogramar_turno: reprogramarTurno,
  registrar_inscripcion: inscripciones.registrar,
  ver_inscripciones: ({ numero_telefono }) => inscripciones.verDeContacto(numero_telefono),
  registrar_pedido: (input) => pedidos.registrar(input, "chat"),
  ver_pedidos: ({ numero_telefono }) => pedidos.verDeContacto(numero_telefono),
};

async function ejecutarTool(nombre, input) {
  if (mcpManager.esToolMCP(nombre)) {
    try {
      return await mcpManager.ejecutarTool(nombre, input);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error ejecutando tool MCP ${nombre}:`, error);
      return { exito: false, mensaje: "Ocurrio un error interno al ejecutar la accion en el agente externo." };
    }
  }

  const ejecutor = EJECUTORES_TOOLS[nombre];
  if (!ejecutor) {
    return { exito: false, mensaje: `Herramienta desconocida: ${nombre}` };
  }
  try {
    return await ejecutor(input);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error ejecutando tool ${nombre}:`, error);
    return { exito: false, mensaje: "Ocurrio un error interno al ejecutar la accion." };
  }
}

/** Tools locales de turnos + las que exponen los agentes MCP conectados. */
function toolsDisponibles() {
  return [...TOOLS, ...mcpManager.obtenerToolsParaClaude()];
}

function historialAMensajes(historial) {
  return historial.map((mensaje) => ({
    role: mensaje.remitente === "usuario" ? "user" : "assistant",
    content: mensaje.contenido_mensaje,
  }));
}

const MENSAJE_CORRECTIVO_CONFIRMACION_SIN_TOOL =
  "[Sistema] Tu respuesta anterior da a entender que se agendo, cancelo o reprogramo un turno, pero no se detecto ninguna llamada real a esa herramienta en este turno. Si el cliente pidio una accion nueva sobre la agenda (agendar, cancelar o reprogramar), DEBES llamar ahora mismo la herramienta correspondiente antes de confirmar nada; nunca repitas una confirmacion sin haberla ejecutado, ni inventes un ID de turno. Si en realidad solo estabas informando sobre turnos ya existentes (por ejemplo, resultado de consultar_disponibilidad o ver_turnos_paciente), volve a responder de forma normal.";

/**
 * Procesa la conversacion con Claude usando function calling.
 * `messages` ya debe incluir el mensaje actual del usuario como ultima entrada.
 *
 * Incluye una salvaguarda anti-alucinacion: si el modelo responde con texto
 * que suena a una confirmacion de agendar/cancelar/reprogramar sin haber
 * llamado realmente esa herramienta en este turno, se le da UNA oportunidad
 * de corregirse. Si insiste en fabricar la confirmacion, se descarta esa
 * respuesta y se deriva la conversacion a un humano (nunca se le manda al
 * cliente una confirmacion que no existe en la base de datos).
 */
async function procesarMensajeClaude(system, messages, numeroTelefono) {
  let huboMutacionExitosa = false;
  let intentosCorrectivos = 0;

  const ejecutarToolConTracking = async (nombre, input) => {
    const resultado = await ejecutarTool(nombre, input);
    if (HERRAMIENTAS_MUTANTES.includes(nombre) && resultado?.exito !== false) {
      huboMutacionExitosa = true;
    }
    return resultado;
  };

  const client = obtenerClienteClaude();

  for (let iteracion = 0; iteracion < MAX_ITERACIONES_TOOLS; iteracion++) {
    const response = await client.messages.create({
      model: clavesIA.obtenerModelo("claude"),
      max_tokens: MAX_TOKENS,
      system,
      tools: toolsDisponibles(),
      messages,
    });

    if (response.stop_reason !== "tool_use") {
      const bloqueTexto = response.content.find((bloque) => bloque.type === "text");
      const texto = bloqueTexto ? bloqueTexto.text : "";

      if (!huboMutacionExitosa && PATRON_CONFIRMACION_ACCION.test(texto)) {
        if (intentosCorrectivos === 0) {
          intentosCorrectivos++;
          console.warn(
            `[${new Date().toISOString()}] Posible confirmacion fabricada de Claude para ${numeroTelefono}, pidiendo correccion:`,
            texto
          );
          messages.push({ role: "assistant", content: response.content });
          messages.push({ role: "user", content: MENSAJE_CORRECTIVO_CONFIRMACION_SIN_TOOL });
          continue;
        }

        console.error(
          `[${new Date().toISOString()}] Claude insistio con una confirmacion sin ejecutar la herramienta real para ${numeroTelefono}. Se descarta y se deriva a un humano.`
        );
        if (numeroTelefono) {
          conversacionesService.cambiarModo(numeroTelefono, "humano");
        }
        return "Disculpe, necesito que el equipo confirme ese cambio manualmente antes de decirle algo en firme — en breve le escriben por aquí para confirmarlo.";
      }

      return texto;
    }

    messages.push({ role: "assistant", content: response.content });

    const bloquesToolUse = response.content.filter((bloque) => bloque.type === "tool_use");
    const resultadosTools = await Promise.all(
      bloquesToolUse.map(async (bloque) => ({
        type: "tool_result",
        tool_use_id: bloque.id,
        content: JSON.stringify(await ejecutarToolConTracking(bloque.name, bloque.input)),
      }))
    );

    messages.push({ role: "user", content: resultadosTools });
  }

  throw new Error("Se alcanzo el limite de iteraciones de herramientas sin una respuesta final.");
}

/**
 * Procesa un mensaje con una estrategia de niveles (cada uno solo si su API
 * key esta configurada; si falta uno, se salta al siguiente disponible):
 * 1. DeepSeek — primera instancia, barata: preguntas generales, disponibilidad
 *    y estado, con herramientas de solo lectura. Si hay que ejecutar algo
 *    escala a "accion"; si el caso es delicado, a "complejo".
 * 2. ChatGPT — mayor razonamiento: resuelve las acciones (agenda, inscripciones)
 *    con todas las herramientas.
 * 3. Claude — escalamiento mayor: casos complejos y respaldo si ChatGPT falla.
 * OpenRouter queda como ultimo respaldo. Si DeepSeek es el unico proveedor
 * configurado, trabaja con todas las herramientas (y la misma salvaguarda).
 */
async function procesarMensaje(numeroTelefono, config, historial, esContactoNuevo = false) {
  const respuesta = await procesarMensajeInterno(numeroTelefono, config, historial, esContactoNuevo);
  // Punto unico de salida: sea cual sea el proveedor que respondio (DeepSeek,
  // Claude, ChatGPT, OpenRouter, o el mensaje de respaldo anti-alucinacion), el
  // markdown que escriben los modelos (**negrita**, encabezados #, etc.) se
  // normaliza aca al formato que WhatsApp realmente interpreta.
  return aTextoWhatsapp(respuesta);
}

const CADENAS_ESCALAMIENTO = {
  accion: ["openai", "claude", "openrouter"],
  complejo: ["claude", "openai", "openrouter"],
};

async function resolverConProveedor(proveedor, system, historial, numeroTelefono) {
  if (proveedor === "claude") {
    return procesarMensajeClaude(system, historialAMensajes(historial), numeroTelefono);
  }
  return openrouter.procesarMensaje(
    system,
    historialAMensajes(historial),
    toolsDisponibles(),
    ejecutarTool,
    numeroTelefono,
    proveedor
  );
}

async function procesarMensajeInterno(numeroTelefono, config, historial, esContactoNuevo = false) {
  const consulta = String([...historial].reverse().find((m) => m.remitente === "usuario")?.contenido_mensaje || "");
  const system = construirSystemPrompt(config, numeroTelefono, esContactoNuevo, consulta);
  const configurado = (p) => Boolean(clavesIA.obtenerClave(p));
  const haySuperior = ["openai", "claude", "openrouter"].some(configurado);

  // Solo DeepSeek: no hay a quien escalar, asi que trabaja con todas las herramientas.
  if (!haySuperior) {
    if (!deepseek.estaHabilitado()) {
      throw new Error("No hay ninguna API key de IA configurada (Dashboard -> Conexiones -> Claves de IA).");
    }
    return resolverConProveedor("deepseek", system, historial, numeroTelefono);
  }

  let nivel = "accion";
  if (deepseek.estaHabilitado()) {
    try {
      const toolsSeguras = TOOLS.filter((tool) => HERRAMIENTAS_DE_SOLO_LECTURA.includes(tool.name));
      const capacidadesExternas = mcpManager
        .obtenerToolsParaClaude()
        .map((tool) => `${tool.name}: ${tool.description}`);
      const resultado = await deepseek.procesarMensaje(
        system,
        historialAMensajes(historial),
        toolsSeguras,
        ejecutarTool,
        capacidadesExternas
      );
      if (resultado.texto !== undefined) {
        // DeepSeek NUNCA tiene acceso a las tools que modifican datos (solo
        // recibe `toolsSeguras`). Si su respuesta igual suena a una
        // confirmacion de agendar/inscribir, es fabricada: se descarta y se
        // escala en vez de mandarsela al cliente.
        if (!PATRON_CONFIRMACION_ACCION.test(resultado.texto)) {
          return resultado.texto;
        }
        console.warn(
          `[${new Date().toISOString()}] DeepSeek devolvio una posible confirmacion fabricada para ${numeroTelefono} (no tiene tools de escritura), escalando:`,
          resultado.texto
        );
      } else {
        nivel = resultado.escalar;
        console.log(`[${new Date().toISOString()}] DeepSeek escalo a nivel "${nivel}" para ${numeroTelefono}.`);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Fallo DeepSeek para ${numeroTelefono}, escalando:`, error.message);
    }
  }

  let ultimoError = null;
  for (const proveedor of CADENAS_ESCALAMIENTO[nivel].filter(configurado)) {
    try {
      return await resolverConProveedor(proveedor, system, historial, numeroTelefono);
    } catch (error) {
      ultimoError = error;
      console.error(`[${new Date().toISOString()}] Fallo ${proveedor} para ${numeroTelefono}, probando el siguiente nivel:`, error.message);
    }
  }
  // Ultimo recurso: DeepSeek con todas las herramientas antes que dejar al cliente sin respuesta.
  if (deepseek.estaHabilitado()) {
    return resolverConProveedor("deepseek", system, historial, numeroTelefono);
  }
  throw ultimoError || new Error("Ningun proveedor de IA pudo responder.");
}

module.exports = {
  procesarMensaje,
  TOOLS,
  ejecutarTool,
  construirSystemPrompt,
  construirMensajeBienvenida,
  historialAMensajes,
  cancelarTurno,
};
