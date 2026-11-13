const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../db");

const JWT_SECRET = process.env.JWT_SECRET;
const NOMBRE_COOKIE = "fotoface_sesion";
const DURACION_TOKEN = "7d";
const DURACION_CODIGO_RECUPERACION_MIN = 10;

function verificarConfiguracion() {
  if (!JWT_SECRET) {
    throw new Error(
      "Falta la variable de entorno JWT_SECRET. Es obligatoria para poder firmar las sesiones del dashboard de forma segura."
    );
  }
}

function buscarUsuarioPorEmail(email) {
  return db.prepare("SELECT * FROM usuarios WHERE email = ?").get(email);
}

function buscarUsuarioPorId(id) {
  return db.prepare("SELECT id, email, nombre FROM usuarios WHERE id = ?").get(id);
}

function buscarUsuarioPorTelefono(telefono) {
  return db.prepare("SELECT * FROM usuarios WHERE telefono = ?").get(telefono);
}

async function verificarCredenciales(email, password) {
  const usuario = buscarUsuarioPorEmail(email);
  if (!usuario) return null;
  const coincide = await bcrypt.compare(password, usuario.password_hash);
  return coincide ? { id: usuario.id, email: usuario.email, nombre: usuario.nombre } : null;
}

function generarToken(usuario) {
  verificarConfiguracion();
  return jwt.sign({ sub: usuario.id, email: usuario.email }, JWT_SECRET, { expiresIn: DURACION_TOKEN });
}

function verificarToken(token) {
  verificarConfiguracion();
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

function listarUsuarios() {
  return db.prepare("SELECT id, email, nombre, telefono, creado_en FROM usuarios ORDER BY creado_en ASC").all();
}

async function crearUsuario({ email, password, nombre, telefono }) {
  if (buscarUsuarioPorEmail(email)) {
    throw new Error("Ya existe un usuario con ese email.");
  }
  if (telefono && buscarUsuarioPorTelefono(telefono)) {
    throw new Error("Ya existe un usuario con ese numero de telefono.");
  }
  const hash = await bcrypt.hash(password, 12);
  const resultado = db
    .prepare(`INSERT INTO usuarios (email, password_hash, nombre, telefono) VALUES (?, ?, ?, ?)`)
    .run(email, hash, nombre || null, telefono || null);
  return buscarUsuarioPorId(resultado.lastInsertRowid);
}

/** Actualiza el numero de WhatsApp propio de un usuario (para poder recuperar la contraseña). */
function actualizarTelefono(id, telefono) {
  if (telefono && buscarUsuarioPorTelefono(telefono)) {
    throw new Error("Ya existe un usuario con ese numero de telefono.");
  }
  db.prepare("UPDATE usuarios SET telefono = ? WHERE id = ?").run(telefono || null, id);
  return buscarUsuarioPorId(id);
}

function generarCodigoNumerico() {
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * Genera un codigo de recuperacion de 6 digitos para el usuario dueño de
 * `telefono` y lo guarda (hasheado) con vencimiento. Devuelve `null` si ese
 * telefono no pertenece a ningun usuario del dashboard (para no filtrar
 * informacion ni mandar codigos a cualquiera que escriba "recuperar").
 */
async function generarCodigoParaUsuario(usuario) {
  const codigo = generarCodigoNumerico();
  const hash = await bcrypt.hash(codigo, 10);
  const expira = new Date(Date.now() + DURACION_CODIGO_RECUPERACION_MIN * 60 * 1000).toISOString();

  db.prepare("UPDATE usuarios SET reset_codigo_hash = ?, reset_codigo_expira = ? WHERE id = ?").run(
    hash,
    expira,
    usuario.id
  );

  return codigo;
}

async function generarCodigoRecuperacion(telefono) {
  const usuario = buscarUsuarioPorTelefono(telefono);
  if (!usuario) return null;
  const codigo = await generarCodigoParaUsuario(usuario);
  return { usuario, codigo };
}

/** Igual que `generarCodigoRecuperacion`, pero buscando al usuario por email (para el flujo de recuperacion por email). */
async function generarCodigoRecuperacionPorEmail(email) {
  const usuario = buscarUsuarioPorEmail(email);
  if (!usuario) return null;
  const codigo = await generarCodigoParaUsuario(usuario);
  return { usuario, codigo };
}

/**
 * Si el texto de un mensaje entrante de WhatsApp parece un pedido de
 * recuperacion ("recuperar") y el numero que escribe es de un usuario real
 * del dashboard, genera el codigo y devuelve el mensaje de respuesta listo
 * para mandar. Devuelve `null` si no aplica (para que el mensaje siga su
 * flujo normal hacia Lumi).
 */
async function intentarRecuperacionPorWhatsapp(numeroTelefono, texto) {
  if (!/recuperar/i.test(texto || "")) return null;

  const resultado = await generarCodigoRecuperacion(numeroTelefono);
  if (!resultado) return null;

  return {
    mensaje: `🔐 Tu código para recuperar la contraseña del dashboard es: *${resultado.codigo}*\n\nEs válido por ${DURACION_CODIGO_RECUPERACION_MIN} minutos. Ingrésalo en la pantalla "Recuperar contraseña" del dashboard junto con tu email (${resultado.usuario.email}) y tu nueva contraseña.`,
  };
}

/** Valida el codigo de recuperacion y, si es correcto, actualiza la contraseña. */
async function restablecerPassword(email, codigo, nuevaPassword) {
  const usuario = buscarUsuarioPorEmail(email);
  if (!usuario || !usuario.reset_codigo_hash || !usuario.reset_codigo_expira) {
    throw new Error('Código inválido o vencido. Vuelve a pedir uno escribiendo "recuperar" por WhatsApp.');
  }
  if (new Date(usuario.reset_codigo_expira).getTime() < Date.now()) {
    throw new Error('El código venció. Vuelve a pedir uno nuevo escribiendo "recuperar" por WhatsApp.');
  }

  const coincide = await bcrypt.compare(codigo, usuario.reset_codigo_hash);
  if (!coincide) {
    throw new Error("Código incorrecto.");
  }

  const hash = await bcrypt.hash(nuevaPassword, 12);
  db.prepare(
    "UPDATE usuarios SET password_hash = ?, reset_codigo_hash = NULL, reset_codigo_expira = NULL WHERE id = ?"
  ).run(hash, usuario.id);
}

function eliminarUsuario(id) {
  const total = db.prepare("SELECT COUNT(*) AS total FROM usuarios").get().total;
  if (total <= 1) {
    throw new Error("No se puede eliminar el ultimo usuario: nadie podria volver a entrar al dashboard.");
  }
  db.prepare("DELETE FROM usuarios WHERE id = ?").run(id);
}

module.exports = {
  NOMBRE_COOKIE,
  buscarUsuarioPorId,
  buscarUsuarioPorEmail,
  buscarUsuarioPorTelefono,
  verificarCredenciales,
  generarToken,
  verificarToken,
  listarUsuarios,
  crearUsuario,
  actualizarTelefono,
  eliminarUsuario,
  generarCodigoRecuperacion,
  generarCodigoRecuperacionPorEmail,
  intentarRecuperacionPorWhatsapp,
  restablecerPassword,
  DURACION_CODIGO_RECUPERACION_MIN,
};
