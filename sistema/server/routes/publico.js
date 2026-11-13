const express = require("express");
const rateLimit = require("express-rate-limit");
const pedidos = require("../services/pedidos");

// Formulario publico de la web (fotoface.pro): pedido de impresiones o
// solicitud de sesion/cotizacion. Sin login; protegido con limite por IP, un
// campo trampa para bots y CORS solo para los origenes de la web.
const router = express.Router();

const ORIGENES = (process.env.WEB_ORIGINS || "https://fotoface.pro,https://www.fotoface.pro")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

router.use((req, res, next) => {
  const origen = req.headers.origin;
  if (origen && ORIGENES.includes(origen)) {
    res.set("Access-Control-Allow-Origin", origen);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const limitador = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Intente más tarde o escríbanos por WhatsApp." },
});

router.post("/pedido", limitador, express.json({ limit: "32kb" }), (req, res) => {
  const b = req.body || {};
  if (b.sitio_web) return res.status(201).json({ ok: true }); // campo trampa: bots
  const tipo = b.tipo === "sesion" ? "sesion" : "impresion";
  const productos =
    tipo === "sesion"
      ? `Solicitud de SESIÓN/COBERTURA: ${String(b.servicio || "").slice(0, 200)}${b.productos ? ` — ${b.productos}` : ""}`
      : b.productos;
  const resultado = pedidos.registrar(
    {
      nombre: b.nombre,
      whatsapp: b.whatsapp,
      email: b.email,
      productos,
      entrega: tipo === "sesion" ? "tienda" : b.entrega,
      direccion: b.direccion,
      fecha_deseada: b.fecha_deseada,
      fotos_enlace: b.fotos_enlace,
      notas: b.notas,
    },
    tipo === "sesion" ? "web-sesion" : "web"
  );
  if (!resultado.exito) {
    return res.status(400).json({ error: resultado.mensaje.replace("Pidele al cliente que lo revise.", "Revíselo, por favor.") });
  }
  res.status(201).json({ ok: true, codigo: resultado.codigo });
});

module.exports = router;
