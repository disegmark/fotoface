const crypto = require("crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");
const tarjetas = require("../services/tarjetas");
const pagina = require("../services/tarjetaPagina");

/*
 * Pagina publica de una tarjeta. Se usa de dos formas:
 *  - en su subdominio (<slug>.fotoface.pro): index.js pone req.tarjetaSlug a
 *    partir del Host y req.tarjetaBase = "";
 *  - por ruta (/t/<slug>), con req.tarjetaBase = "/t/<slug>".
 * Solo se muestran las tarjetas publicadas.
 */
const router = express.Router();

function cargar(req, res, next) {
  const t = tarjetas.obtenerPorSlug(req.tarjetaSlug);
  if (!t || t.estado !== "publicada") {
    return res.status(404).type("html").send(pagina.renderNoDisponible());
  }
  req.tarjeta = t;
  next();
}

const limiteEnvios = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados envíos seguidos. Intenta de nuevo en unos minutos." },
});

router.get("/", cargar, (req, res) => {
  const t = req.tarjeta;
  const invitado = req.query.i ? tarjetas.invitadoPorToken(t.id, req.query.i) : null;
  tarjetas.registrarVisita(t, invitado);
  res.set("Cache-Control", "no-store");
  res.set("X-Robots-Tag", "noindex, nofollow");
  res.type("html").send(pagina.renderTarjeta(t, { base: req.tarjetaBase, invitado, firmas: tarjetas.listarFirmas(t.id, true) }));
});

router.get("/media/:archivo", cargar, (req, res) => {
  const ruta = tarjetas.rutaArchivo(req.tarjeta.id, req.params.archivo);
  if (!ruta) return res.sendStatus(404);
  res.set("Cache-Control", "public, max-age=604800, immutable");
  res.sendFile(ruta);
});

router.get("/evento.ics", cargar, (req, res) => {
  const contenido = pagina.ics(req.tarjeta);
  if (!contenido) return res.sendStatus(404);
  res.type("text/calendar").attachment(`${req.tarjeta.slug}.ics`).send(contenido);
});

router.post("/api/rsvp", cargar, limiteEnvios, express.json({ limit: "16kb" }), (req, res) => {
  if (req.body?.sitio_web) return res.status(201).json({ asiste: true }); // campo trampa: bots
  try {
    res.status(201).json(tarjetas.responder(req.tarjeta, req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/api/firmas", cargar, limiteEnvios, express.json({ limit: "16kb" }), (req, res) => {
  if (req.body?.sitio_web) return res.status(201).json({ aprobada: false });
  try {
    res.status(201).json(tarjetas.firmar(req.tarjeta, req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Vista del anfitrion (el cliente): enlace secreto que el equipo le entrega.
// Funciona aunque la tarjeta este en borrador o archivada.
router.get("/anfitrion/:clave", (req, res) => {
  const t = tarjetas.obtenerPorSlug(req.tarjetaSlug);
  const a = Buffer.from(String(req.params.clave || ""));
  const b = Buffer.from(t?.clave_anfitrion || "");
  if (!t || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(404).type("html").send(pagina.renderNoDisponible("Enlace no válido."));
  }
  res.set("Cache-Control", "no-store");
  res.set("X-Robots-Tag", "noindex, nofollow");
  res.type("html").send(
    pagina.renderAnfitrion(t, {
      respuestas: tarjetas.listarRespuestas(t.id),
      invitados: tarjetas.listarInvitados(t.id),
      firmas: tarjetas.listarFirmas(t.id, true),
    })
  );
});

/*
 * Caddy (TLS a demanda) consulta aqui antes de emitir un certificado para
 * <slug>.fotoface.pro: 200 solo si la tarjeta existe y esta publicada. Como el
 * bloque comodin *.fotoface.pro tambien cubre el panel (tarjetas.) y www., esos
 * dos se aprueban siempre. Solo responde a llamadas locales directas (Caddy en
 * el mismo VPS).
 */
function verificarTls(req, res) {
  const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress) && !req.headers["x-forwarded-for"];
  if (!local) return res.sendStatus(403);
  const dominio = String(req.query.domain || "").toLowerCase();
  if (dominio === tarjetas.PANEL_HOST || dominio === `www.${tarjetas.DOMINIO}`) return res.sendStatus(200);
  const slug = tarjetas.slugDeHost(dominio);
  const t = slug && tarjetas.obtenerPorSlug(slug);
  res.sendStatus(t && t.estado === "publicada" ? 200 : 404);
}

module.exports = { router, verificarTls };
