const auth = require("../services/auth");

function requireAuth(req, res, next) {
  const token = req.cookies?.[auth.NOMBRE_COOKIE];
  const payload = token ? auth.verificarToken(token) : null;

  if (!payload) {
    return res.status(401).json({ error: "No autenticado. Inicia sesion para continuar." });
  }

  const usuario = auth.buscarUsuarioPorId(payload.sub);
  if (!usuario) {
    return res.status(401).json({ error: "No autenticado. Inicia sesion para continuar." });
  }

  req.usuario = usuario;
  next();
}

module.exports = requireAuth;
