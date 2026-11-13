const express = require("express");
const rateLimit = require("express-rate-limit");
const auth = require("../services/auth");
const emailService = require("../services/email");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

const ES_PRODUCCION = process.env.NODE_ENV === "production";
const OPCIONES_COOKIE = {
  httpOnly: true,
  secure: ES_PRODUCCION,
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos de inicio de sesion. Espera unos minutos e intenta de nuevo." },
});

const limitadorRecuperar = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Espera unos minutos e intenta de nuevo." },
});

router.post("/login", limitadorLogin, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email y contraseña son requeridos." });
  }

  try {
    const usuario = await auth.verificarCredenciales(email, password);
    if (!usuario) {
      return res.status(401).json({ error: "Email o contraseña incorrectos." });
    }

    const token = auth.generarToken(usuario);
    res.cookie(auth.NOMBRE_COOKIE, token, OPCIONES_COOKIE);
    res.json({ usuario });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error en login:`, error);
    res.status(500).json({ error: "No se pudo iniciar sesion.", detalle: error.message });
  }
});

router.post("/recuperar/solicitar-email", limitadorRecuperar, async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email es requerido." });
  }
  if (!emailService.estaHabilitado()) {
    return res.status(503).json({
      error: "El envio de emails no esta configurado. Completa EMAIL_USER y EMAIL_APP_PASSWORD en el .env.",
    });
  }

  try {
    const resultado = await auth.generarCodigoRecuperacionPorEmail(email);
    if (resultado) {
      await emailService.enviarCodigoRecuperacion(
        resultado.usuario.email,
        resultado.codigo,
        auth.DURACION_CODIGO_RECUPERACION_MIN
      );
    }
    // Respuesta generica siempre, exista o no ese email, para no filtrar informacion.
    res.json({ exito: true, mensaje: "Si el email existe, te llega un código en unos minutos." });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error mandando codigo de recuperacion por email:`, error);
    res.status(500).json({ error: "No se pudo enviar el email.", detalle: error.message });
  }
});

router.post("/recuperar/restablecer", limitadorRecuperar, async (req, res) => {
  const { email, codigo, nueva_password } = req.body;

  if (!email || !codigo || !nueva_password) {
    return res.status(400).json({ error: "Email, codigo y nueva contraseña son requeridos." });
  }
  if (nueva_password.length < 8) {
    return res.status(400).json({ error: "La nueva contraseña debe tener al menos 8 caracteres." });
  }

  try {
    await auth.restablecerPassword(email, codigo, nueva_password);
    res.json({ exito: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie(auth.NOMBRE_COOKIE, { httpOnly: true, sameSite: "lax", secure: ES_PRODUCCION });
  res.json({ exito: true });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ usuario: req.usuario });
});

module.exports = router;
