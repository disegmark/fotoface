const crypto = require("crypto");
const clavesMetaWhatsapp = require("./clavesMetaWhatsapp");

const API_VERSION = "v21.0";
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
const APP_SECRET = process.env.META_APP_SECRET;

function estaHabilitado() {
  return Boolean(clavesMetaWhatsapp.obtenerToken() && clavesMetaWhatsapp.obtenerPhoneNumberId());
}

function verificarWebhookToken(token) {
  return Boolean(VERIFY_TOKEN) && token === VERIFY_TOKEN;
}

/**
 * Verifica la firma X-Hub-Signature-256 que Meta agrega a cada webhook, para
 * confirmar que el request viene realmente de Meta y no de un tercero.
 * Si META_APP_SECRET no esta configurado, se omite la verificacion (no bloquea
 * el uso basico, pero se recomienda configurarlo en producción).
 */
function verificarFirma(rawBody, firmaHeader) {
  if (!APP_SECRET) return true;
  if (!firmaHeader) return false;

  const firmaEsperada =
    "sha256=" + crypto.createHmac("sha256", APP_SECRET).update(rawBody).digest("hex");

  const bufferRecibido = Buffer.from(firmaHeader);
  const bufferEsperado = Buffer.from(firmaEsperada);
  if (bufferRecibido.length !== bufferEsperado.length) return false;
  return crypto.timingSafeEqual(bufferRecibido, bufferEsperado);
}

function normalizarNumero(numero) {
  return numero.replace(/[^\d]/g, "");
}

/**
 * Envia un mensaje de texto libre por WhatsApp Cloud API. Solo funciona
 * dentro de la ventana de 24hs desde el ultimo mensaje del cliente; fuera de
 * esa ventana, Meta rechaza el envio y exige usar una plantilla aprobada.
 */
async function enviarMensaje(numeroTelefonoDestino, texto) {
  if (!estaHabilitado()) {
    throw new Error(
      "La integracion con WhatsApp Cloud API (Meta) no esta configurada (falta el access token o el Phone Number ID, en Conexiones o en el .env)."
    );
  }

  const respuesta = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${clavesMetaWhatsapp.obtenerPhoneNumberId()}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clavesMetaWhatsapp.obtenerToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizarNumero(numeroTelefonoDestino),
        type: "text",
        text: { body: texto },
      }),
    }
  );

  const datos = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    const mensajeError = datos?.error?.message || `Meta respondio ${respuesta.status}`;
    throw new Error(mensajeError);
  }

  return datos;
}

/**
 * Envia un mensaje de PLANTILLA (HSM) aprobada por Meta, la unica forma
 * permitida de escribirle a un cliente fuera de la ventana de 24hs. La
 * plantilla debe existir y estar aprobada en Meta Business Manager
 * (WhatsApp Manager > Plantillas de mensajes) antes de poder usarla aca; si
 * no existe o no esta aprobada, Meta responde con un error.
 */
async function enviarPlantilla(numeroTelefonoDestino, nombrePlantilla, codigoIdioma = "es") {
  if (!estaHabilitado()) {
    throw new Error(
      "La integracion con WhatsApp Cloud API (Meta) no esta configurada (falta el access token o el Phone Number ID, en Conexiones o en el .env)."
    );
  }

  const respuesta = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${clavesMetaWhatsapp.obtenerPhoneNumberId()}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clavesMetaWhatsapp.obtenerToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizarNumero(numeroTelefonoDestino),
        type: "template",
        template: {
          name: nombrePlantilla,
          language: { code: codigoIdioma },
        },
      }),
    }
  );

  const datos = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    const mensajeError = datos?.error?.message || `Meta respondio ${respuesta.status}`;
    throw new Error(mensajeError);
  }

  return datos;
}

/**
 * Extrae los mensajes de texto entrantes de un payload de webhook de Meta.
 * Ignora silenciosamente notificaciones que no son mensajes de texto nuevos
 * (confirmaciones de entrega/lectura, mensajes de otro tipo, etc.).
 */
function extraerMensajesEntrantes(payload) {
  const mensajes = [];
  for (const entry of payload.entry || []) {
    for (const cambio of entry.changes || []) {
      const valor = cambio.value || {};
      const contactos = valor.contacts || [];
      for (const mensaje of valor.messages || []) {
        if (mensaje.type !== "text") continue;
        const contacto = contactos.find((c) => c.wa_id === mensaje.from);
        mensajes.push({
          wamid: mensaje.id,
          numeroTelefono: `+${normalizarNumero(mensaje.from)}`,
          texto: mensaje.text.body,
          nombre: contacto?.profile?.name || null,
        });
      }
    }
  }
  return mensajes;
}

module.exports = {
  estaHabilitado,
  verificarWebhookToken,
  verificarFirma,
  enviarMensaje,
  enviarPlantilla,
  extraerMensajesEntrantes,
};
