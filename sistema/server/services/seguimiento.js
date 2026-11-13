const db = require("../db");
const metaWhatsapp = require("./metaWhatsapp");
const twilioService = require("./twilio");
const conversacionesService = require("./conversaciones");
const socket = require("./socket");

const HORAS_ETAPA_1 = 12;
const HORAS_ETAPA_2 = 24;
const HORAS_ETAPA_3 = 48;
const INTERVALO_CHEQUEO_MS = 15 * 60 * 1000; // cada 15 minutos

const MENSAJE_ETAPA_1 =
  "¡Hola! 😊 Veo que quedamos pendientes con su consulta en *FotoFace*. ¿Sigue interesado/a en coordinar, o tiene alguna otra pregunta? Quedo atenta.";

// Fuera de la ventana de 24hs desde el ultimo mensaje del cliente, WhatsApp
// (Meta y Twilio) NO permite mandar texto libre: hay que usar una plantilla
// (HSM) previamente aprobada en Meta Business Manager. Sin esto configurado,
// las etapas de 24h/48h quedan "armadas" pero no se envian todavia (ver
// README, seccion de seguimiento automatico).
const PLANTILLA_ETAPA_2 = process.env.WHATSAPP_TEMPLATE_SEGUIMIENTO_24H || null;
const PLANTILLA_ETAPA_3 = process.env.WHATSAPP_TEMPLATE_SEGUIMIENTO_48H || null;

function horasDesde(fechaTexto) {
  const fecha = new Date(fechaTexto.replace(" ", "T"));
  return (Date.now() - fecha.getTime()) / (1000 * 60 * 60);
}

/** Registra el seguimiento enviado en el historial de mensajes, para que quede visible en el dashboard. */
function registrarEnHistorial(numeroTelefono, canal, contenido) {
  const resultado = db
    .prepare(
      `INSERT INTO mensajes_whatsapp (numero_telefono, contenido_mensaje, remitente, procesado, respuesta_ia)
       VALUES (?, ?, 'asistente', 1, ?)`
    )
    .run(numeroTelefono, contenido, contenido);
  conversacionesService.tocarUltimoMensaje(numeroTelefono, canal);
  socket.emitir(
    "mensaje:nuevo",
    db.prepare("SELECT * FROM mensajes_whatsapp WHERE id = ?").get(resultado.lastInsertRowid)
  );
}

async function enviarSegunCanal(numeroTelefono, canal, nombrePlantilla) {
  if (canal === "meta") {
    if (nombrePlantilla) {
      await metaWhatsapp.enviarPlantilla(numeroTelefono, nombrePlantilla);
    } else {
      await metaWhatsapp.enviarMensaje(numeroTelefono, MENSAJE_ETAPA_1);
    }
    return;
  }

  // Canal Twilio: las plantillas (Twilio Content API) todavia no estan
  // implementadas, asi que las etapas 24h/48h no se pueden enviar por este canal.
  if (nombrePlantilla) {
    throw new Error("Las plantillas de seguimiento (24h/48h) no estan implementadas para el canal Twilio.");
  }
  if (!twilioService.estaHabilitadoEnvioSaliente()) {
    throw new Error("El envio saliente de Twilio no esta configurado.");
  }
  await twilioService.enviarMensaje(numeroTelefono, MENSAJE_ETAPA_1);
}

/**
 * Revisa todas las conversaciones activas en modo IA y, si el cliente dejo a
 * Lumi "hablando sola" (el ultimo mensaje es de la asistente) por 12/24/48
 * horas, manda un mensaje de seguimiento. Cada etapa se manda una sola vez;
 * si el cliente vuelve a escribir, `conversaciones.reiniciarSeguimiento`
 * reinicia el contador para el proximo silencio.
 */
async function ejecutarChequeoDeSeguimiento() {
  const conversaciones = db
    .prepare(
      "SELECT numero_telefono, canal, etapa_seguimiento FROM conversaciones WHERE modo = 'ia' AND estado = 'activa'"
    )
    .all();

  for (const conversacion of conversaciones) {
    if (conversacion.etapa_seguimiento >= 3) continue;

    const ultimoMensaje = db
      .prepare(
        "SELECT remitente, recibido_en FROM mensajes_whatsapp WHERE numero_telefono = ? ORDER BY id DESC LIMIT 1"
      )
      .get(conversacion.numero_telefono);

    if (!ultimoMensaje || ultimoMensaje.remitente !== "asistente") continue;

    const horas = horasDesde(ultimoMensaje.recibido_en);

    // Se apunta a la etapa MAS ALTA que ya corresponda segun las horas
    // transcurridas (no a la siguiente secuencial): una conversacion que ya
    // esta a 30hs de silencio debe apuntar directo a la etapa de 24hs (que
    // necesita plantilla), no intentar primero un texto libre de 12hs que a
    // esa altura ya esta fuera de la ventana permitida y fallaria igual.
    let etapaObjetivo = 0;
    if (horas >= HORAS_ETAPA_3) etapaObjetivo = 3;
    else if (horas >= HORAS_ETAPA_2) etapaObjetivo = 2;
    else if (horas >= HORAS_ETAPA_1) etapaObjetivo = 1;

    if (etapaObjetivo <= conversacion.etapa_seguimiento) continue;
    const etapaAEnviar = etapaObjetivo;

    const nombrePlantilla =
      etapaAEnviar === 2 ? PLANTILLA_ETAPA_2 : etapaAEnviar === 3 ? PLANTILLA_ETAPA_3 : null;

    if (etapaAEnviar > 1 && !nombrePlantilla) {
      console.warn(
        `[${new Date().toISOString()}] Seguimiento etapa ${etapaAEnviar} pendiente para ${conversacion.numero_telefono}, pero falta configurar la plantilla de WhatsApp aprobada por Meta (WHATSAPP_TEMPLATE_SEGUIMIENTO_${etapaAEnviar === 2 ? "24H" : "48H"} en .env). Se reintenta en el proximo chequeo.`
      );
      continue;
    }

    try {
      await enviarSegunCanal(conversacion.numero_telefono, conversacion.canal, nombrePlantilla);

      db.prepare("UPDATE conversaciones SET etapa_seguimiento = ? WHERE numero_telefono = ?").run(
        etapaAEnviar,
        conversacion.numero_telefono
      );

      registrarEnHistorial(
        conversacion.numero_telefono,
        conversacion.canal,
        nombrePlantilla ? `[Plantilla de WhatsApp enviada: ${nombrePlantilla}]` : MENSAJE_ETAPA_1
      );

      console.log(
        `[${new Date().toISOString()}] Seguimiento etapa ${etapaAEnviar} enviado a ${conversacion.numero_telefono}.`
      );
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] Error enviando seguimiento etapa ${etapaAEnviar} a ${conversacion.numero_telefono}:`,
        error.message
      );
    }
  }
}

let intervalo = null;

function iniciar() {
  if (intervalo) return;
  intervalo = setInterval(() => {
    ejecutarChequeoDeSeguimiento().catch((error) => {
      console.error(`[${new Date().toISOString()}] Error en el chequeo de seguimiento:`, error.message);
    });
  }, INTERVALO_CHEQUEO_MS);
  console.log(`[${new Date().toISOString()}] Chequeo automatico de seguimiento (12h/24h/48h) iniciado.`);
}

module.exports = { iniciar, ejecutarChequeoDeSeguimiento };
