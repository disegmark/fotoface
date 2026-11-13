/*
 * Claves de los proveedores de IA (DeepSeek, ChatGPT/OpenAI, Claude, OpenRouter).
 *
 * Se cargan desde Dashboard -> Conexiones (tabla claves_ia) y tienen prioridad
 * sobre el .env, que queda como respaldo. Los servicios de IA las leen en cada
 * llamada, asi que un cambio aplica al instante, sin reiniciar el servidor.
 * La API nunca devuelve una clave completa: solo los ultimos 4 caracteres.
 */
const db = require("../db");

const PROVEEDORES = {
  deepseek: { env: "DEEPSEEK_API_KEY", envModelo: "DEEPSEEK_MODEL", modeloPorDefecto: "deepseek-chat" },
  openai: { env: "OPENAI_API_KEY", envModelo: "OPENAI_MODEL", modeloPorDefecto: "gpt-5-mini" },
  claude: { env: "CLAUDE_API_KEY", envModelo: "CLAUDE_MODEL", modeloPorDefecto: "claude-haiku-5-5" },
  openrouter: { env: "OPENROUTER_API_KEY", envModelo: "OPENROUTER_MODEL", modeloPorDefecto: "openai/gpt-4o-mini" },
};

db.exec(`
  CREATE TABLE IF NOT EXISTS claves_ia (
    proveedor TEXT PRIMARY KEY CHECK(proveedor IN ('deepseek', 'openai', 'claude', 'openrouter')),
    api_key TEXT,
    modelo TEXT,
    actualizado_por TEXT,
    actualizado_en DATETIME DEFAULT (datetime('now', 'localtime'))
  );
`);

function fila(proveedor) {
  return db.prepare("SELECT * FROM claves_ia WHERE proveedor = ?").get(proveedor);
}

function obtenerClave(proveedor) {
  const info = PROVEEDORES[proveedor];
  if (!info) return null;
  return fila(proveedor)?.api_key || process.env[info.env] || null;
}

function obtenerModelo(proveedor) {
  const info = PROVEEDORES[proveedor];
  if (!info) return null;
  return fila(proveedor)?.modelo || (info.envModelo && process.env[info.envModelo]) || info.modeloPorDefecto;
}

function enmascarar(clave) {
  return clave ? `••••${clave.slice(-4)}` : null;
}

function estado() {
  return Object.keys(PROVEEDORES).map((proveedor) => {
    const guardada = fila(proveedor);
    const clave = obtenerClave(proveedor);
    return {
      proveedor,
      configurada: Boolean(clave),
      origen: guardada?.api_key ? "dashboard" : clave ? "env" : null,
      clave: enmascarar(clave),
      modelo: obtenerModelo(proveedor),
      actualizado_en: guardada?.actualizado_en || null,
      actualizado_por: guardada?.actualizado_por || null,
    };
  });
}

/** Guarda (o borra, con api_key vacia) la clave de un proveedor. */
function guardar(proveedor, { api_key, modelo }, usuario) {
  if (!PROVEEDORES[proveedor]) throw new Error("Proveedor invalido. Usa deepseek, openai, claude u openrouter.");
  const clave = api_key === undefined ? undefined : String(api_key || "").trim();
  if (clave && (clave.length < 20 || /\s/.test(clave))) throw new Error("La API key no tiene un formato valido.");
  const mod = modelo === undefined ? undefined : String(modelo || "").trim() || null;

  const actual = fila(proveedor);
  db.prepare(
    `INSERT INTO claves_ia (proveedor, api_key, modelo, actualizado_por, actualizado_en)
     VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
     ON CONFLICT(proveedor) DO UPDATE SET api_key = excluded.api_key, modelo = excluded.modelo,
       actualizado_por = excluded.actualizado_por, actualizado_en = excluded.actualizado_en`
  ).run(
    proveedor,
    clave === undefined ? actual?.api_key ?? null : clave || null,
    mod === undefined ? actual?.modelo ?? null : mod,
    usuario || null
  );
  return estado().find((e) => e.proveedor === proveedor);
}

/** Verifica la clave contra el proveedor con una llamada liviana (lista de modelos / datos de la key). */
async function probar(proveedor, claveExplicita) {
  if (!PROVEEDORES[proveedor]) throw new Error("Proveedor invalido.");
  const clave = String(claveExplicita || "").trim() || obtenerClave(proveedor);
  if (!clave) return { ok: false, mensaje: "No hay una clave configurada para este proveedor." };

  const peticiones = {
    deepseek: () => fetch("https://api.deepseek.com/models", { headers: { Authorization: `Bearer ${clave}` } }),
    openai: () => fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${clave}` } }),
    openrouter: () => fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${clave}` } }),
    claude: () =>
      fetch("https://api.anthropic.com/v1/models?limit=1", {
        headers: { "x-api-key": clave, "anthropic-version": "2023-06-01" },
      }),
  };
  try {
    const respuesta = await peticiones[proveedor]();
    if (respuesta.ok) return { ok: true, mensaje: "La clave es valida." };
    if ([401, 403].includes(respuesta.status)) return { ok: false, mensaje: "El proveedor rechazo la clave (invalida o revocada)." };
    return { ok: false, mensaje: `El proveedor respondio ${respuesta.status}.` };
  } catch (error) {
    return { ok: false, mensaje: `No se pudo contactar al proveedor: ${error.message}` };
  }
}

const hayAlguna = () => Object.keys(PROVEEDORES).some((p) => obtenerClave(p));

module.exports = { PROVEEDORES, obtenerClave, obtenerModelo, estado, guardar, probar, hayAlguna };
