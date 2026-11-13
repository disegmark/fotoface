const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const DB_PATH = path.join(__dirname, "data", "fotoface.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS mensajes_whatsapp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_telefono TEXT NOT NULL,
    contenido_mensaje TEXT NOT NULL,
    remitente TEXT NOT NULL CHECK(remitente IN ('usuario', 'asistente', 'humano')),
    tipo_mensaje TEXT NOT NULL DEFAULT 'texto',
    respuesta_ia TEXT,
    procesado INTEGER DEFAULT 0,
    recibido_en DATETIME DEFAULT (datetime('now', 'localtime'))
  );
`);

// Migracion: bases creadas antes de admitir remitente = 'humano' tienen un CHECK
// mas viejo grabado en la tabla; hay que reconstruirla para ampliarlo.
const sqlTablaMensajes = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'mensajes_whatsapp'")
  .get();
if (sqlTablaMensajes && !sqlTablaMensajes.sql.includes("'humano'")) {
  db.exec(`
    ALTER TABLE mensajes_whatsapp RENAME TO mensajes_whatsapp_old;
    CREATE TABLE mensajes_whatsapp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero_telefono TEXT NOT NULL,
      contenido_mensaje TEXT NOT NULL,
      remitente TEXT NOT NULL CHECK(remitente IN ('usuario', 'asistente', 'humano')),
      tipo_mensaje TEXT NOT NULL DEFAULT 'texto',
      respuesta_ia TEXT,
      procesado INTEGER DEFAULT 0,
      recibido_en DATETIME DEFAULT (datetime('now', 'localtime'))
    );
    INSERT INTO mensajes_whatsapp SELECT * FROM mensajes_whatsapp_old;
    DROP TABLE mensajes_whatsapp_old;
  `);
  console.log(`[${new Date().toISOString()}] Migracion: mensajes_whatsapp ahora admite remitente 'humano'.`);
}

const columnasMensajes = db.prepare("PRAGMA table_info(mensajes_whatsapp)").all().map((c) => c.name);
if (!columnasMensajes.includes("wamid")) {
  db.exec("ALTER TABLE mensajes_whatsapp ADD COLUMN wamid TEXT");
}
db.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_mensajes_wamid ON mensajes_whatsapp(wamid) WHERE wamid IS NOT NULL"
);

db.exec(`
  CREATE TABLE IF NOT EXISTS contactos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_telefono TEXT NOT NULL UNIQUE,
    nombre TEXT,
    creado_en DATETIME DEFAULT (datetime('now', 'localtime')),
    actualizado_en DATETIME DEFAULT (datetime('now', 'localtime'))
  );
`);

const columnasContactos = db.prepare("PRAGMA table_info(contactos)").all().map((c) => c.name);
if (!columnasContactos.includes("email")) {
  db.exec("ALTER TABLE contactos ADD COLUMN email TEXT");
}
if (!columnasContactos.includes("origen")) {
  // Codigo de campaña/plataforma de origen (ej: "TT" de TikTok, "LI" de
  // LinkedIn), detectado en el primer mensaje via un link de WhatsApp con
  // texto pre-cargado terminado en "#CODIGO". Null = contacto organico/directo.
  db.exec("ALTER TABLE contactos ADD COLUMN origen TEXT");
}
if (!columnasContactos.includes("etapa_embudo")) {
  // Etapa manual del pipeline de ventas (CRM), independiente de la
  // clasificacion automatica frio/tibio/caliente de clasificacionVentas.js.
  // Valores validos: nuevo, contactado, propuesta, negociacion, ganado, perdido.
  db.exec("ALTER TABLE contactos ADD COLUMN etapa_embudo TEXT NOT NULL DEFAULT 'nuevo'");
}
if (!columnasContactos.includes("asignado_a")) {
  // Id del usuario del dashboard (tabla usuarios) responsable del contacto. Sin FK
  // explicita en el esquema (igual que el resto de las tablas): se valida en la app.
  db.exec("ALTER TABLE contactos ADD COLUMN asignado_a INTEGER");
}
if (!columnasContactos.includes("valor_potencial")) {
  db.exec("ALTER TABLE contactos ADD COLUMN valor_potencial REAL");
}
if (!columnasContactos.includes("tags")) {
  // Tags separados por coma (ej: "urgente,web"): texto plano en vez de tabla
  // aparte, no se justifica esa infraestructura al volumen actual.
  db.exec("ALTER TABLE contactos ADD COLUMN tags TEXT");
}
if (!columnasContactos.includes("notas")) {
  db.exec("ALTER TABLE contactos ADD COLUMN notas TEXT");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS conversaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_telefono TEXT NOT NULL UNIQUE,
    modo TEXT NOT NULL DEFAULT 'ia' CHECK(modo IN ('ia', 'humano')),
    estado TEXT NOT NULL DEFAULT 'activa' CHECK(estado IN ('activa', 'spam', 'resuelta')),
    canal TEXT NOT NULL DEFAULT 'twilio' CHECK(canal IN ('twilio', 'meta', 'evolution')),
    ultimo_mensaje_en DATETIME DEFAULT (datetime('now', 'localtime')),
    creado_en DATETIME DEFAULT (datetime('now', 'localtime'))
  );
`);

const sqlTablaConversaciones = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'conversaciones'")
  .get();
if (sqlTablaConversaciones && !sqlTablaConversaciones.sql.includes("canal")) {
  db.exec("ALTER TABLE conversaciones ADD COLUMN canal TEXT NOT NULL DEFAULT 'twilio'");
  console.log(`[${new Date().toISOString()}] Migracion: conversaciones ahora registra el canal (twilio/meta).`);
}

const columnasConversaciones = db.prepare("PRAGMA table_info(conversaciones)").all().map((c) => c.name);
if (!columnasConversaciones.includes("etapa_seguimiento")) {
  // 0 = sin seguimiento enviado, 1 = seguimiento de 12hs enviado, 2 = de 24hs, 3 = de 48hs.
  // Se reinicia a 0 cada vez que el cliente vuelve a escribir (ver conversaciones.js).
  db.exec("ALTER TABLE conversaciones ADD COLUMN etapa_seguimiento INTEGER NOT NULL DEFAULT 0");
  console.log(`[${new Date().toISOString()}] Migracion: conversaciones ahora registra la etapa de seguimiento (12h/24h/48h).`);
}

// Migracion: bases creadas antes de admitir canal = 'evolution' (numero
// operativo via Evolution API + n8n, ver webhookEvolution.js) tienen un CHECK
// mas viejo grabado en la tabla; hay que reconstruirla para ampliarlo.
const sqlTablaConversacionesActual = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'conversaciones'")
  .get();
if (sqlTablaConversacionesActual && !sqlTablaConversacionesActual.sql.includes("'evolution'")) {
  db.exec(`
    ALTER TABLE conversaciones RENAME TO conversaciones_old;
    CREATE TABLE conversaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero_telefono TEXT NOT NULL UNIQUE,
      modo TEXT NOT NULL DEFAULT 'ia' CHECK(modo IN ('ia', 'humano')),
      estado TEXT NOT NULL DEFAULT 'activa' CHECK(estado IN ('activa', 'spam', 'resuelta')),
      canal TEXT NOT NULL DEFAULT 'twilio' CHECK(canal IN ('twilio', 'meta', 'evolution')),
      ultimo_mensaje_en DATETIME DEFAULT (datetime('now', 'localtime')),
      creado_en DATETIME DEFAULT (datetime('now', 'localtime')),
      etapa_seguimiento INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO conversaciones SELECT * FROM conversaciones_old;
    DROP TABLE conversaciones_old;
  `);
  console.log(`[${new Date().toISOString()}] Migracion: conversaciones ahora admite canal 'evolution'.`);
}

// Migracion: admite canal 'web' (chat embebido via widget.js, ver webchat.js).
const sqlTablaConversacionesCanalWeb = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'conversaciones'")
  .get();
if (sqlTablaConversacionesCanalWeb && !sqlTablaConversacionesCanalWeb.sql.includes("'web'")) {
  db.exec(`
    ALTER TABLE conversaciones RENAME TO conversaciones_old;
    CREATE TABLE conversaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero_telefono TEXT NOT NULL UNIQUE,
      modo TEXT NOT NULL DEFAULT 'ia' CHECK(modo IN ('ia', 'humano')),
      estado TEXT NOT NULL DEFAULT 'activa' CHECK(estado IN ('activa', 'spam', 'resuelta')),
      canal TEXT NOT NULL DEFAULT 'twilio' CHECK(canal IN ('twilio', 'meta', 'evolution', 'web')),
      ultimo_mensaje_en DATETIME DEFAULT (datetime('now', 'localtime')),
      creado_en DATETIME DEFAULT (datetime('now', 'localtime')),
      etapa_seguimiento INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO conversaciones SELECT * FROM conversaciones_old;
    DROP TABLE conversaciones_old;
  `);
  console.log(`[${new Date().toISOString()}] Migracion: conversaciones ahora admite canal 'web' (chat embebido).`);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS turnos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_telefono TEXT NOT NULL,
    nombre_paciente TEXT,
    fecha_turno DATETIME,
    tipo_turno TEXT,
    estado TEXT DEFAULT 'pendiente' CHECK(estado IN ('pendiente', 'confirmado', 'cancelado', 'completado')),
    notas TEXT,
    google_event_id TEXT,
    modalidad TEXT CHECK(modalidad IN ('virtual', 'presencial')),
    creado_en DATETIME DEFAULT (datetime('now', 'localtime')),
    actualizado_en DATETIME DEFAULT (datetime('now', 'localtime'))
  );
`);

const columnasTurnos = db.prepare("PRAGMA table_info(turnos)").all().map((c) => c.name);
if (!columnasTurnos.includes("google_event_id")) {
  db.exec("ALTER TABLE turnos ADD COLUMN google_event_id TEXT");
}
if (!columnasTurnos.includes("modalidad")) {
  db.exec("ALTER TABLE turnos ADD COLUMN modalidad TEXT");
}

db.exec(`
  CREATE TRIGGER IF NOT EXISTS trg_turnos_actualizado_en
  AFTER UPDATE ON turnos
  FOR EACH ROW
  BEGIN
    UPDATE turnos SET actualizado_en = datetime('now', 'localtime') WHERE id = OLD.id;
  END;
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS configuracion_agencia (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_agencia TEXT DEFAULT 'FotoFace',
    direccion TEXT,
    telefono TEXT,
    telefono_humano TEXT,
    email TEXT,
    horarios TEXT,
    servicios TEXT,
    sobre_agencia TEXT,
    webhook_url TEXT,
    creado_en DATETIME DEFAULT (datetime('now', 'localtime')),
    actualizado_en DATETIME DEFAULT (datetime('now', 'localtime'))
  );
`);

const columnasConfig = db.prepare("PRAGMA table_info(configuracion_agencia)").all().map((c) => c.name);
if (!columnasConfig.includes("telefono_humano")) {
  // "telefono" es el numero de WhatsApp del propio bot; este campo es el
  // numero real de una persona, para cuando Lumi deriva a un humano (no debe
  // recomendar el mismo numero del bot, seria circular).
  db.exec("ALTER TABLE configuracion_agencia ADD COLUMN telefono_humano TEXT");
}
if (!columnasConfig.includes("google_oauth_refresh_token")) {
  // Refresh token OAuth de un usuario real de Google (no la cuenta de
  // servicio). Hace falta para crear espacios de Google Meet, ya que la API
  // de Meet no admite cuentas de servicio en cuentas de Gmail personales.
  db.exec("ALTER TABLE configuracion_agencia ADD COLUMN google_oauth_refresh_token TEXT");
}
if (!columnasConfig.includes("google_sheets_id")) {
  db.exec("ALTER TABLE configuracion_agencia ADD COLUMN google_sheets_id TEXT");
}
if (!columnasConfig.includes("google_oauth_client_id")) {
  // Client ID / Secret de la app de OAuth de Google (Google Cloud Console).
  // Se pueden cargar aca desde el dashboard (Conexiones) o en el .env como
  // GOOGLE_OAUTH_CLIENT_ID/SECRET; lo guardado aca tiene prioridad.
  db.exec("ALTER TABLE configuracion_agencia ADD COLUMN google_oauth_client_id TEXT");
  db.exec("ALTER TABLE configuracion_agencia ADD COLUMN google_oauth_client_secret TEXT");
}
if (!columnasConfig.includes("google_calendar_id")) {
  // ID del Google Calendar a sincronizar (el email del calendario, o
  // "primary"). Se completa desde el dashboard; usa la misma conexion de
  // Google ya autorizada (OAuth), no una cuenta de servicio aparte.
  db.exec("ALTER TABLE configuracion_agencia ADD COLUMN google_calendar_id TEXT");
}
if (!columnasConfig.includes("ga4_property_id")) {
  // Propiedad de Google Analytics 4 y sitio de Search Console a medir
  // (KPIs de Atraccion en Marketing): se completan desde el dashboard.
  db.exec("ALTER TABLE configuracion_agencia ADD COLUMN ga4_property_id TEXT");
  db.exec("ALTER TABLE configuracion_agencia ADD COLUMN ga4_measurement_id TEXT");
  db.exec("ALTER TABLE configuracion_agencia ADD COLUMN search_console_site TEXT");
}

db.exec(`
  CREATE TRIGGER IF NOT EXISTS trg_configuracion_actualizado_en
  AFTER UPDATE ON configuracion_agencia
  FOR EACH ROW
  BEGIN
    UPDATE configuracion_agencia SET actualizado_en = datetime('now', 'localtime') WHERE id = OLD.id;
  END;
`);

const configuracionExistente = db
  .prepare("SELECT COUNT(*) AS total FROM configuracion_agencia")
  .get();

if (configuracionExistente.total === 0) {
  db.prepare(
    `INSERT INTO configuracion_agencia
      (nombre_agencia, direccion, telefono, email, horarios, servicios, sobre_agencia)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "FotoFace",
    "Por definir (completar en Configuracion)",
    "",
    "",
    "Lunes a Sabado de 9:00 am a 8:00 pm",
    JSON.stringify([
      "Sesiones de fotos en estudio (retratos, familia, bebes, mascotas)",
      "Fotos para documentos (DNI, pasaporte, visa, carnet)",
      "Cobertura de eventos (bodas, quinceaneros, bautizos, graduaciones, corporativos)",
      "Fotografia de producto y corporativa",
      "Impresion fotografica (revelado digital, ampliaciones, posters)",
      "Cuadros (canvas, foam/trovicel, enmarcado) y fotolibros",
      "Restauracion y retoque de fotos antiguas",
      "Envio a domicilio de pedidos impresos",
    ]),
    "FotoFace (fotoface.pro) es un estudio de fotografia e impresion fotografica: sesiones en estudio y en exteriores, cobertura de eventos e impresion profesional de fotos, ampliaciones, cuadros y fotolibros, con entrega en tienda o envio a domicilio."
  );
  console.log(`[${new Date().toISOString()}] Configuracion inicial de la agencia creada.`);
}

// Inscripciones a cursos, talleres, asesorias o programas que ofrezca la
// agencia. Lumi las registra desde el chat (herramienta registrar_inscripcion)
// y el equipo les da seguimiento desde Dashboard -> Inscripciones (pago, confirmacion).
db.exec(`
  CREATE TABLE IF NOT EXISTS inscripciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_telefono TEXT NOT NULL,
    nombre TEXT NOT NULL,
    email TEXT,
    whatsapp TEXT,
    programa TEXT NOT NULL,
    detalle TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente', 'pago_reportado', 'confirmada', 'cancelada')),
    notas TEXT,
    creado_en DATETIME DEFAULT (datetime('now', 'localtime')),
    actualizado_en DATETIME DEFAULT (datetime('now', 'localtime'))
  );
`);
db.exec("CREATE INDEX IF NOT EXISTS idx_inscripciones_telefono ON inscripciones(numero_telefono)");
db.exec(`
  CREATE TRIGGER IF NOT EXISTS trg_inscripciones_actualizado_en
  AFTER UPDATE ON inscripciones
  FOR EACH ROW
  BEGIN
    UPDATE inscripciones SET actualizado_en = datetime('now', 'localtime') WHERE id = OLD.id;
  END;
`);

// Pedidos de impresion fotografica (ver server/services/pedidos.js).
db.exec(`
  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_telefono TEXT NOT NULL,
    nombre TEXT NOT NULL,
    whatsapp TEXT,
    email TEXT,
    productos TEXT NOT NULL,
    entrega TEXT NOT NULL DEFAULT 'tienda' CHECK(entrega IN ('tienda', 'domicilio')),
    direccion TEXT,
    fecha_deseada TEXT,
    fotos_enlace TEXT,
    notas TEXT,
    origen TEXT NOT NULL DEFAULT 'chat',
    estado TEXT NOT NULL DEFAULT 'nuevo' CHECK(estado IN ('nuevo', 'cotizado', 'en_produccion', 'listo', 'en_reparto', 'entregado', 'cancelado')),
    monto REAL,
    reparto_id INTEGER,
    reparto_enlace TEXT,
    creado_en DATETIME DEFAULT (datetime('now', 'localtime')),
    actualizado_en DATETIME DEFAULT (datetime('now', 'localtime'))
  );
`);
db.exec("CREATE INDEX IF NOT EXISTS idx_pedidos_telefono ON pedidos(numero_telefono)");
db.exec(`
  CREATE TRIGGER IF NOT EXISTS trg_pedidos_actualizado_en
  AFTER UPDATE ON pedidos
  FOR EACH ROW
  BEGIN
    UPDATE pedidos SET actualizado_en = datetime('now', 'localtime') WHERE id = OLD.id;
  END;
`);

// Base de conocimiento de Lumi: documentos de texto (o importados de un
// archivo/URL) que el equipo gestiona desde Dashboard -> Conocimiento y que
// Lumi usa para responder (ver server/services/conocimiento.js).
db.exec(`
  CREATE TABLE IF NOT EXISTS conocimiento_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    texto TEXT NOT NULL,
    origen TEXT DEFAULT 'texto',
    activo INTEGER DEFAULT 1,
    creado_en DATETIME DEFAULT (datetime('now', 'localtime')),
    actualizado_en DATETIME DEFAULT (datetime('now', 'localtime'))
  );
`);
if (db.prepare("SELECT COUNT(*) AS total FROM conocimiento_docs").get().total === 0) {
  const seed = path.join(__dirname, "seed", "conocimiento-base.md");
  if (fs.existsSync(seed)) {
    db.prepare("INSERT INTO conocimiento_docs (titulo, texto, origen) VALUES (?, ?, 'web')").run(
      "Informacion oficial de FotoFace (servicios, pedidos, entregas, contacto)",
      fs.readFileSync(seed, "utf8")
    );
    console.log(`[${new Date().toISOString()}] Base de conocimiento sembrada con la informacion inicial de FotoFace.`);
  }
}

// Cotizaciones generadas por el equipo (panel "Oficina"), con seguimiento de
// estado y la opcion de agendar una reunion ligada a la agenda de turnos.
db.exec(`
  CREATE TABLE IF NOT EXISTS cotizaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_telefono TEXT,
    nombre_cliente TEXT NOT NULL,
    email TEXT,
    servicio TEXT NOT NULL,
    monto REAL,
    moneda TEXT DEFAULT 'PEN',
    estado TEXT NOT NULL DEFAULT 'enviada' CHECK(estado IN ('pendiente', 'enviada', 'en_revision', 'reunion_agendada', 'aceptada', 'rechazada')),
    notas TEXT,
    validez_hasta DATETIME,
    turno_id INTEGER REFERENCES turnos(id),
    creado_en DATETIME DEFAULT (datetime('now', 'localtime')),
    actualizado_en DATETIME DEFAULT (datetime('now', 'localtime'))
  );
`);
db.exec(`
  CREATE TRIGGER IF NOT EXISTS trg_cotizaciones_actualizado_en
  AFTER UPDATE ON cotizaciones
  FOR EACH ROW
  BEGIN
    UPDATE cotizaciones SET actualizado_en = datetime('now', 'localtime') WHERE id = OLD.id;
  END;
`);

// Campañas de marketing (panel "Marketing"): cada una tiene un codigo de
// origen unico que se agrega al link de WhatsApp (ver GeneradorLinkOrigen);
// clics/leads se calculan al vuelo a partir de los contactos que llegaron con
// ese codigo (columna contactos.origen), no se guardan como contador aparte.
db.exec(`
  CREATE TABLE IF NOT EXISTS campanas_marketing (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    canal TEXT NOT NULL CHECK(canal IN ('tiktok', 'meta', 'linkedin', 'google', 'email', 'otro')),
    codigo_origen TEXT NOT NULL UNIQUE,
    mensaje_precargado TEXT,
    inversion REAL,
    estado TEXT NOT NULL DEFAULT 'activa' CHECK(estado IN ('activa', 'pausada', 'finalizada')),
    creado_en DATETIME DEFAULT (datetime('now', 'localtime')),
    actualizado_en DATETIME DEFAULT (datetime('now', 'localtime'))
  );
`);
db.exec(`
  CREATE TRIGGER IF NOT EXISTS trg_campanas_actualizado_en
  AFTER UPDATE ON campanas_marketing
  FOR EACH ROW
  BEGIN
    UPDATE campanas_marketing SET actualizado_en = datetime('now', 'localtime') WHERE id = OLD.id;
  END;
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    nombre TEXT,
    creado_en DATETIME DEFAULT (datetime('now', 'localtime'))
  );
`);

const columnasUsuarios = db.prepare("PRAGMA table_info(usuarios)").all().map((c) => c.name);
if (!columnasUsuarios.includes("telefono")) {
  // Numero de WhatsApp propio del usuario del dashboard (no el del bot): se
  // usa para recuperar la contraseña, mandandole un codigo por WhatsApp
  // cuando escribe "recuperar" al numero de la agencia.
  db.exec("ALTER TABLE usuarios ADD COLUMN telefono TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_telefono ON usuarios(telefono) WHERE telefono IS NOT NULL");
}
if (!columnasUsuarios.includes("reset_codigo_hash")) {
  db.exec("ALTER TABLE usuarios ADD COLUMN reset_codigo_hash TEXT");
  db.exec("ALTER TABLE usuarios ADD COLUMN reset_codigo_expira DATETIME");
}

// Bootstrap: si no hay ningun usuario todavia, crear el primero a partir de
// ADMIN_EMAIL/ADMIN_PASSWORD en .env. Sin esto, nadie podria entrar nunca al
// dashboard (el login es la unica puerta de entrada, no hay endpoint de
// "crear cuenta" publico a proposito).
const usuariosExistentes = db.prepare("SELECT COUNT(*) AS total FROM usuarios").get();
if (usuariosExistentes.total === 0) {
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);
    db.prepare(`INSERT INTO usuarios (email, password_hash, nombre) VALUES (?, ?, ?)`).run(
      process.env.ADMIN_EMAIL,
      hash,
      "Administrador"
    );
    console.log(`[${new Date().toISOString()}] Usuario administrador creado: ${process.env.ADMIN_EMAIL}`);
  } else {
    console.warn(
      `[${new Date().toISOString()}] ADVERTENCIA: no hay usuarios y faltan ADMIN_EMAIL/ADMIN_PASSWORD en .env. ` +
        "Nadie va a poder iniciar sesion en el dashboard hasta configurarlos y reiniciar el servidor."
    );
  }
}

module.exports = db;
