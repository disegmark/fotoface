/*
 * Canal de WhatsApp via YCloud (api.ycloud.com/v2), un proveedor alternativo
 * a Meta/Twilio con onboarding mas simple. Misma forma de trabajar que
 * metaWhatsapp.js: credenciales en clavesYcloud.js (dashboard o .env), envio
 * por REST con API Key, y un webhook propio para los mensajes entrantes.
 */
const crypto = require("crypto");
const clavesYcloud = require("./clavesYcloud");

const API_BASE = "https://api.ycloud.com/v2";

function estaHabilitado() {
  return Boolean(clavesYcloud.obtenerApiKey() && clavesYcloud.obtenerNumeroWhatsapp());
}

function normalizarNumero(numero) {
  return numero.startsWith("+") ? numero : `+${numero}`;
}

/**
 * Envia un mensaje de texto libre por WhatsApp. Al igual que con Meta, solo
 * funciona dentro de la ventana de 24hs desde el ultimo mensaje del cliente.
 */
async function enviarMensaje(numeroTelefonoDestino, texto) {
  if (!estaHabilitado()) {
    throw new Error(
      "La integracion con YCloud no esta configurada (falta la API Key o el numero de WhatsApp, en Conexiones o en el .env)."
    );
  }

  const respuesta = await fetch(`${API_BASE}/whatsapp/messages`, {
    method: "POST",
    headers: {
      "X-API-Key": clavesYcloud.obtenerApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: clavesYcloud.obtenerNumeroWhatsapp(),
      to: normalizarNumero(numeroTelefonoDestino),
      type: "text",
      text: { body: texto },
    }),
  });

  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    throw new Error(datos?.message || datos?.error?.message || `YCloud respondio ${respuesta.status}.`);
  }
  return datos;
}

/** Valida la API Key contra YCloud (sin enviar ningun mensaje). */
async function probar() {
  const apiKey = clavesYcloud.obtenerApiKey();
  if (!apiKey) {
    return { ok: false, mensaje: "Falta la API Key de YCloud." };
  }
  try {
    const respuesta = await fetch(`${API_BASE}/whatsapp/businessAccounts?limit=1`, {
      headers: { "X-API-Key": apiKey },
    });
    const datos = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      throw new Error(datos?.message || datos?.error?.message || `YCloud respondio ${respuesta.status}.`);
    }
    return { ok: true, mensaje: "Conexion con YCloud verificada." };
  } catch (error) {
    return { ok: false, mensaje: error.message };
  }
}

/**
 * Verifica la firma "YCloud-Signature: t=<timestamp>,s=<firma>" que YCloud
 * agrega a cada webhook (HMAC-SHA256 sobre "{timestamp}.{raw body}" con el
 * secreto de ese endpoint). Si no hay secreto configurado, se omite la
 * verificacion (igual que con META_APP_SECRET).
 */
function verificarFirma(rawBody, firmaHeader) {
  const secret = clavesYcloud.obtenerWebhookSecret();
  if (!secret) return true;
  if (!firmaHeader) return false;

  const partes = Object.fromEntries(
    firmaHeader.split(",").map((parte) => {
      const [clave, valor] = parte.split("=");
      return [clave?.trim(), valor?.trim()];
    })
  );
  const { t: timestamp, s: firma } = partes;
  if (!timestamp || !firma) return false;

  const firmaEsperada = crypto
    .createHmac("sha256", secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]))
    .digest("hex");

  const bufferRecibido = Buffer.from(firma);
  const bufferEsperado = Buffer.from(firmaEsperada);
  if (bufferRecibido.length !== bufferEsperado.length) return false;
  return crypto.timingSafeEqual(bufferRecibido, bufferEsperado);
}

/**
 * Extrae los mensajes de texto entrantes de un evento de webhook de YCloud.
 * Ignora silenciosamente cualquier evento que no sea un mensaje de texto
 * nuevo (whatsapp.message.updated, mensajes de otro tipo, etc.).
 */
function extraerMensajesEntrantes(payload) {
  if (payload?.type !== "whatsapp.inbound_message.received") return [];
  const mensaje = payload.whatsappInboundMessage;
  if (!mensaje || mensaje.type !== "text") return [];
  return [
    {
      wamid: mensaje.wamid || mensaje.id,
      numeroTelefono: normalizarNumero(mensaje.from),
      texto: mensaje.text?.body || "",
      nombre: mensaje.customerProfile?.name || null,
    },
  ];
}

module.exports = { estaHabilitado, enviarMensaje, probar, verificarFirma, extraerMensajesEntrantes };
