const { google } = require("googleapis");
const db = require("../db");

const REDIRECT_URI = `${process.env.PUBLIC_BASE_URL || ""}/api/integraciones/google/callback`;

// Scopes de un usuario real de Google (no una cuenta de servicio): esta misma
// conexion se reutiliza para todo lo que necesite "actuar como" esa persona:
// - Crear espacios de Google Meet (las cuentas de servicio no pueden hacerlo
//   en cuentas de Gmail personales, solo en Workspace con delegacion).
// - Leer Google Analytics 4 y Search Console (KPIs de "Atraccion" en
//   Marketing) — la cuenta necesita acceso de Lector en esa propiedad.
// - Crear/editar eventos en su Google Calendar (turnos agendados por Lumi).
// - Escribir filas en sus Google Sheets (registro de turnos).
// No hace falta compartir nada con una cuenta de servicio aparte: alcanza con
// que esta misma cuenta tenga acceso (sea dueña, o se lo compartan) al
// calendario/planilla que se configure en Conexiones.
const SCOPES = [
  "https://www.googleapis.com/auth/meetings.space.created",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/spreadsheets",
];

function obtenerConfig() {
  return db
    .prepare(
      "SELECT google_oauth_refresh_token, google_oauth_client_id, google_oauth_client_secret FROM configuracion_agencia LIMIT 1"
    )
    .get();
}

// El Client ID/Secret se pueden cargar desde Dashboard -> Conexiones (tiene
// prioridad) o en el .env, que queda como respaldo/valor inicial.
function obtenerClientId() {
  return obtenerConfig()?.google_oauth_client_id || process.env.GOOGLE_OAUTH_CLIENT_ID || null;
}

function obtenerClientSecret() {
  return obtenerConfig()?.google_oauth_client_secret || process.env.GOOGLE_OAUTH_CLIENT_SECRET || null;
}

function enmascarar(valor) {
  return valor ? `••••${valor.slice(-4)}` : null;
}

function estadoCredenciales() {
  const config = obtenerConfig();
  const clientId = obtenerClientId();
  const clientSecret = obtenerClientSecret();
  return {
    configurado: Boolean(clientId && clientSecret),
    origen: config?.google_oauth_client_id ? "dashboard" : clientId ? "env" : null,
    client_id: clientId || null,
    client_secret: enmascarar(clientSecret),
    public_base_url_configurado: Boolean(process.env.PUBLIC_BASE_URL),
  };
}

/** Guarda (o borra, con valor vacio) el Client ID/Secret cargados desde el dashboard. */
function guardarCredenciales({ client_id, client_secret }) {
  const id = client_id === undefined ? undefined : String(client_id || "").trim() || null;
  const secret = client_secret === undefined ? undefined : String(client_secret || "").trim() || null;
  const actual = obtenerConfig();

  db.prepare(
    "UPDATE configuracion_agencia SET google_oauth_client_id = ?, google_oauth_client_secret = ? WHERE id = (SELECT id FROM configuracion_agencia LIMIT 1)"
  ).run(
    id === undefined ? actual?.google_oauth_client_id ?? null : id,
    secret === undefined ? actual?.google_oauth_client_secret ?? null : secret
  );
  return estadoCredenciales();
}

function estaHabilitado() {
  return Boolean(obtenerClientId() && obtenerClientSecret() && process.env.PUBLIC_BASE_URL);
}

function estaConectado() {
  const config = obtenerConfig();
  return Boolean(config?.google_oauth_refresh_token);
}

function crearClienteOAuth() {
  return new google.auth.OAuth2(obtenerClientId(), obtenerClientSecret(), REDIRECT_URI);
}

function obtenerUrlAutorizacion() {
  const cliente = crearClienteOAuth();
  return cliente.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

async function intercambiarCodigo(code) {
  const cliente = crearClienteOAuth();
  const { tokens } = await cliente.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google no devolvio un refresh_token. Vuelve a intentar la conexion (a veces hace falta revocar el acceso previo en https://myaccount.google.com/permissions y volver a autorizar)."
    );
  }
  db.prepare("UPDATE configuracion_agencia SET google_oauth_refresh_token = ? WHERE id = (SELECT id FROM configuracion_agencia LIMIT 1)").run(
    tokens.refresh_token
  );
}

function desconectar() {
  db.prepare("UPDATE configuracion_agencia SET google_oauth_refresh_token = NULL WHERE id = (SELECT id FROM configuracion_agencia LIMIT 1)").run();
}

/** Devuelve un OAuth2Client listo para usar (con el refresh token cargado), o null si no esta conectado. */
function obtenerClienteAutorizado() {
  const config = obtenerConfig();
  if (!config?.google_oauth_refresh_token) return null;

  const cliente = crearClienteOAuth();
  cliente.setCredentials({ refresh_token: config.google_oauth_refresh_token });
  return cliente;
}

module.exports = {
  estaHabilitado,
  estaConectado,
  estadoCredenciales,
  guardarCredenciales,
  obtenerUrlAutorizacion,
  intercambiarCodigo,
  desconectar,
  obtenerClienteAutorizado,
};
