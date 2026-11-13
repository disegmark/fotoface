/*
 * Credenciales de YCloud (API Key, numero de WhatsApp conectado, y el
 * secreto de firma del webhook), cargables desde Dashboard -> Conexiones en
 * vez de solo el .env. DB-first con respaldo en variables de entorno, mismo
 * patron que clavesMetaWhatsapp.js / clavesTwilio.js. La API nunca devuelve
 * la API Key completa.
 */
const db = require("../db");

db.exec(`
  CREATE TABLE IF NOT EXISTS claves_ycloud (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    api_key TEXT,
    numero_whatsapp TEXT,
    webhook_secret TEXT,
    actualizado_por TEXT,
    actualizado_en DATETIME DEFAULT (datetime('now', 'localtime'))
  );
`);
if (!db.prepare("SELECT 1 FROM claves_ycloud WHERE id = 1").get()) {
  db.prepare("INSERT INTO claves_ycloud (id) VALUES (1)").run();
}

function fila() {
  return db.prepare("SELECT * FROM claves_ycloud WHERE id = 1").get();
}

function obtenerApiKey() {
  return fila()?.api_key || process.env.YCLOUD_API_KEY || null;
}

function obtenerNumeroWhatsapp() {
  return fila()?.numero_whatsapp || process.env.YCLOUD_WHATSAPP_NUMBER || null;
}

function obtenerWebhookSecret() {
  return fila()?.webhook_secret || process.env.YCLOUD_WEBHOOK_SECRET || null;
}

function enmascarar(valor) {
  return valor ? `••••${valor.slice(-4)}` : null;
}

function estado() {
  const guardada = fila();
  const apiKey = obtenerApiKey();
  return {
    configurado: Boolean(apiKey && obtenerNumeroWhatsapp()),
    origen: guardada?.api_key ? "dashboard" : apiKey ? "env" : null,
    api_key: enmascarar(apiKey),
    numero_whatsapp: obtenerNumeroWhatsapp(),
    webhook_secret_configurado: Boolean(obtenerWebhookSecret()),
    actualizado_en: guardada?.actualizado_en || null,
    actualizado_por: guardada?.actualizado_por || null,
  };
}

/** Guarda (o borra, con valores vacios) las credenciales. */
function guardar({ api_key, numero_whatsapp, webhook_secret }, usuario) {
  const apiKey = api_key === undefined ? undefined : String(api_key || "").trim() || null;
  const numero = numero_whatsapp === undefined ? undefined : String(numero_whatsapp || "").trim() || null;
  const secret = webhook_secret === undefined ? undefined : String(webhook_secret || "").trim() || null;

  const actual = fila();
  db.prepare(
    `UPDATE claves_ycloud SET api_key = ?, numero_whatsapp = ?, webhook_secret = ?,
       actualizado_por = ?, actualizado_en = datetime('now', 'localtime') WHERE id = 1`
  ).run(
    apiKey === undefined ? actual?.api_key ?? null : apiKey,
    numero === undefined ? actual?.numero_whatsapp ?? null : numero,
    secret === undefined ? actual?.webhook_secret ?? null : secret,
    usuario || null
  );
  return estado();
}

module.exports = { obtenerApiKey, obtenerNumeroWhatsapp, obtenerWebhookSecret, estado, guardar };
