/*
 * Administracion de la cuenta de WhatsApp Business de Meta, directo contra
 * la Graph API (mismo token que ya usa metaWhatsapp.js para enviar/recibir
 * mensajes). Cubre lo mas util de lo que hubiera dado el MCP oficial de
 * Meta ("WhatsApp Business Tools") sin depender de el: ese servidor MCP
 * esta en beta y por ahora solo acepta clientes pre-aprobados por Meta
 * (Claude Code/Desktop, ChatGPT, Codex) — una app propia no puede
 * registrarse (responde "Dynamic registration is not available for this
 * client"), asi que esto reimplementa directamente lo que se necesita:
 * ver el numero conectado, listar/crear/borrar plantillas de mensajes.
 */
const clavesMetaWhatsapp = require("./clavesMetaWhatsapp");

const API_VERSION = "v21.0";

function requerirCredenciales() {
  const token = clavesMetaWhatsapp.obtenerToken();
  if (!token) {
    throw new Error("Falta el access token de WhatsApp Business (Meta). Cargalo en Conexiones.");
  }
  return token;
}

function requerirWabaId() {
  const wabaId = clavesMetaWhatsapp.obtenerWabaId();
  if (!wabaId) {
    throw new Error("Falta el WhatsApp Business Account ID (WABA ID). Cargalo en Conexiones.");
  }
  return wabaId;
}

async function llamarGraphApi(ruta, opciones = {}) {
  const token = requerirCredenciales();
  const url = `https://graph.facebook.com/${API_VERSION}/${ruta}`;
  const respuesta = await fetch(url, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opciones.body ? { "Content-Type": "application/json" } : {}),
      ...opciones.headers,
    },
  });
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    throw new Error(datos?.error?.message || `Meta respondio ${respuesta.status}.`);
  }
  return datos;
}

/** Info del numero conectado (nombre verificado, calidad) + lista de numeros del WABA si hay uno configurado. */
async function obtenerInfoCuenta() {
  const phoneNumberId = clavesMetaWhatsapp.obtenerPhoneNumberId();
  if (!phoneNumberId) {
    throw new Error("Falta el Phone Number ID. Cargalo en Conexiones.");
  }

  const numeroActual = await llamarGraphApi(
    `${phoneNumberId}?fields=verified_name,display_phone_number,quality_rating`
  );

  let numerosDelWaba = null;
  const wabaId = clavesMetaWhatsapp.obtenerWabaId();
  if (wabaId) {
    const respuesta = await llamarGraphApi(
      `${wabaId}/phone_numbers?fields=verified_name,display_phone_number,quality_rating,status`
    );
    numerosDelWaba = respuesta.data || [];
  }

  return { numeroActual, numerosDelWaba };
}

async function probar() {
  try {
    const { numeroActual } = await obtenerInfoCuenta();
    return { ok: true, mensaje: `Conectado a "${numeroActual.verified_name || numeroActual.display_phone_number}".` };
  } catch (error) {
    return { ok: false, mensaje: error.message };
  }
}

/** Plantillas de mensajes (HSM) del WABA configurado, con su estado de aprobacion. */
async function listarPlantillas() {
  const wabaId = requerirWabaId();
  const respuesta = await llamarGraphApi(
    `${wabaId}/message_templates?fields=name,status,category,language,components&limit=100`
  );
  return respuesta.data || [];
}

/** Crea una plantilla simple (un solo componente BODY), a quedar "pendiente" hasta que Meta la apruebe. */
async function crearPlantilla({ nombre, categoria, idioma, cuerpo }) {
  const wabaId = requerirWabaId();
  if (!nombre || !categoria || !idioma || !cuerpo) {
    throw new Error("Faltan datos: nombre, categoria, idioma y cuerpo son requeridos.");
  }
  return llamarGraphApi(`${wabaId}/message_templates`, {
    method: "POST",
    body: JSON.stringify({
      name: nombre,
      category: categoria,
      language: idioma,
      components: [{ type: "BODY", text: cuerpo }],
    }),
  });
}

async function eliminarPlantilla(nombre) {
  const wabaId = requerirWabaId();
  return llamarGraphApi(`${wabaId}/message_templates?name=${encodeURIComponent(nombre)}`, { method: "DELETE" });
}

module.exports = { obtenerInfoCuenta, probar, listarPlantillas, crearPlantilla, eliminarPlantilla };
