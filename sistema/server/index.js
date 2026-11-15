require("dotenv").config();

const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

// La clave de IA puede cargarse desde el dashboard (Conexiones -> Claves de IA);
// sin ella el servidor arranca igual, pero Lumi no responde hasta configurarla.
if (!process.env.CLAUDE_API_KEY) {
  console.warn(
    `[${new Date().toISOString()}] AVISO: sin CLAUDE_API_KEY en el .env. Cargue la clave de IA desde el dashboard.`
  );
}

if (!process.env.JWT_SECRET) {
  console.error(
    `[${new Date().toISOString()}] ERROR: falta la variable de entorno JWT_SECRET. ` +
      "Es obligatoria para poder proteger el dashboard con login. Genera un valor largo y aleatorio y agrégalo a tu .env."
  );
  process.exit(1);
}

require("./db");
const mcpManager = require("./services/mcpManager");
const seguimiento = require("./services/seguimiento");
const socket = require("./services/socket");
const requireAuth = require("./middleware/requireAuth");
const authRouter = require("./routes/auth");
const webhookRouter = require("./routes/webhook");
const webhookMetaRouter = require("./routes/webhookMeta");
const webhookEvolutionRouter = require("./routes/webhookEvolution");
const webhookYcloudRouter = require("./routes/webhookYcloud");
const vozRouter = require("./routes/voz");
const mensajesRouter = require("./routes/mensajes");
const turnosRouter = require("./routes/turnos");
const configuracionRouter = require("./routes/configuracion");
const agentesRouter = require("./routes/agentes");
const conversacionesRouter = require("./routes/conversaciones");
const estadisticasRouter = require("./routes/estadisticas");
const usuariosRouter = require("./routes/usuarios");
const googleIntegracionesRouter = require("./routes/googleIntegraciones");
const ventasRouter = require("./routes/ventas");
const contactosRouter = require("./routes/contactos");
const conocimientoRouter = require("./routes/conocimiento");
const inscripcionesRouter = require("./routes/inscripciones");
const pedidosRouter = require("./routes/pedidos");
const publicoRouter = require("./routes/publico");
const webchatRouter = require("./routes/webchat");
const marketingRouter = require("./routes/marketing");
const cotizacionesRouter = require("./routes/cotizaciones");
const ssoRouter = require("./routes/sso");
const publicidadRouter = require("./routes/publicidad");
const metaWhatsappBusinessRouter = require("./routes/metaWhatsappBusiness");
const twilioCredencialesRouter = require("./routes/twilioCredenciales");
const ycloudCredencialesRouter = require("./routes/ycloudCredenciales");
const tarjetasRutas = require("./routes/tarjetas");
const tarjetaPublica = require("./routes/tarjetaPublica");
const tarjetasService = require("./services/tarjetas");
const tarjetasVitrina = require("./services/tarjetasVitrina");

const app = express();
app.set("trust proxy", 1);
const httpServer = http.createServer(app);
socket.inicializar(httpServer);
const PORT = process.env.PORT || 3001;
const ES_PRODUCCION = process.env.NODE_ENV === "production";

// Tarjetas virtuales: cada una en su subdominio (<slug>.fotoface.pro). Si el
// Host es de una tarjeta, solo se atienden sus rutas publicas.
app.use((req, res, next) => {
  const slug = tarjetasService.slugDeHost(req.headers.host);
  if (!slug) return next();
  req.tarjetaSlug = slug;
  req.tarjetaBase = "";
  tarjetaPublica.router(req, res, () => res.status(404).type("text/plain").send("No encontrado"));
});
// Vitrina publica de tarjetas (tarjetas.fotoface.pro): pagina de muestra sin
// login. La gestion de tarjetas vive en el sistema (seccion Tarjetas digitales).
// En ese host solo se sirven la vitrina y los logos; las rutas del panel
// anterior (/login, /dashboard) redirigen al sistema y la API no esta disponible.
const HOST_VITRINA = tarjetasService.VITRINA_HOST;
const ARCHIVOS_VITRINA = new Set(["/logo-marca.png", "/logo-fotoface.png", "/favicon.png", "/apple-touch-icon.png"]);
app.use((req, res, next) => {
  const host = String(req.headers.host || "").toLowerCase().split(":")[0];
  if (host !== HOST_VITRINA) return next();
  if (req.method === "GET" && req.path === "/") {
    res.set("Cache-Control", "public, max-age=120");
    return res.type("html").send(tarjetasVitrina.renderVitrina());
  }
  if (req.method === "GET" && ARCHIVOS_VITRINA.has(req.path)) return next();
  if (req.method === "GET" && req.path === "/robots.txt") {
    return res.type("text/plain").send(`User-agent: *\nAllow: /\n`);
  }
  if (/^\/(login|dashboard|recuperar)(\/|$)/.test(req.path)) {
    const sistema = (process.env.PUBLIC_BASE_URL || "https://fotoface.ia.nom.pe").replace(/\/$/, "");
    return res.redirect(302, `${sistema}${req.path === "/dashboard" ? "/dashboard" : req.path}`);
  }
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "No disponible en este dominio." });
  return res.redirect(302, "/");
});
// Vista por ruta (/t/<slug>) y verificacion de dominio para el TLS a demanda de Caddy.
app.use("/t/:slug", (req, res, next) => {
  req.tarjetaSlug = String(req.params.slug).toLowerCase();
  req.tarjetaBase = `/t/${encodeURIComponent(req.tarjetaSlug)}`;
  tarjetaPublica.router(req, res, next);
});
app.get("/api/tarjetas-tls/verificar", tarjetaPublica.verificarTls);

// Chat web publico (widget embebido en cualquier sitio via widget.js). Va
// antes del CORS global porque se llama desde otro dominio y no usa
// cookies/sesion de usuario.
const ORIGENES_WEBCHAT = (process.env.WEBCHAT_ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.get("/widget.js", (req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.type("application/javascript").sendFile(path.join(__dirname, "public", "widget.js"));
});
app.use(
  "/api/webchat",
  cors({ origin: ES_PRODUCCION && ORIGENES_WEBCHAT.length ? ORIGENES_WEBCHAT : true }),
  express.json({ limit: "10kb" }),
  webchatRouter
);

// Formulario publico de la web fotoface.pro (CORS propio, sin sesion).
app.use("/api/publico", publicoRouter);

app.use(
  cors({
    origin: ES_PRODUCCION
      ? true
      : ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  })
);
// Base de conocimiento: acepta archivos en base64, por eso tiene su propio limite (va antes del parser global).
app.use("/api/conocimiento", cookieParser(), express.json({ limit: "20mb" }), requireAuth, conocimientoRouter);
// Fotos y musica de las tarjetas (base64): limite propio, antes del parser global.
app.use("/api/tarjetas", cookieParser(), express.json({ limit: "18mb" }), requireAuth, tarjetasRutas.subida);

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Publicas: login, y los webhooks que llaman Twilio/Meta/n8n directamente (no
// hay sesion de usuario en esas llamadas; se validan por firma o secreto
// compartido en su propio router).
app.use("/api/auth", authRouter);
app.use("/api/webhook", webhookRouter);
app.use("/api/webhook/whatsapp-meta", webhookMetaRouter);
app.use("/api/webhook/evolution", webhookEvolutionRouter);
app.use("/api/webhook/ycloud", webhookYcloudRouter);
app.use("/api/voz", vozRouter);

// Todo lo demas del dashboard requiere haber iniciado sesion.
app.use("/api/mensajes", requireAuth, mensajesRouter);
app.use("/api/turnos", requireAuth, turnosRouter);
app.use("/api/configuracion", requireAuth, configuracionRouter);
app.use("/api/agentes", requireAuth, agentesRouter);
app.use("/api/conversaciones", requireAuth, conversacionesRouter);
app.use("/api/estadisticas", requireAuth, estadisticasRouter);
app.use("/api/usuarios", requireAuth, usuariosRouter);
app.use("/api/integraciones/google", requireAuth, googleIntegracionesRouter);
app.use("/api/ventas", requireAuth, ventasRouter);
app.use("/api/contactos", requireAuth, contactosRouter);
app.use("/api/inscripciones", requireAuth, inscripcionesRouter);
app.use("/api/pedidos", requireAuth, pedidosRouter);
app.use("/api/tarjetas", requireAuth, tarjetasRutas.router);
app.use("/api/marketing", requireAuth, marketingRouter);
app.use("/api/cotizaciones", requireAuth, cotizacionesRouter);
app.use("/api/sso", requireAuth, ssoRouter);
app.use("/api/publicidad", requireAuth, publicidadRouter);
app.use("/api/integraciones/whatsapp-meta", requireAuth, metaWhatsappBusinessRouter);
app.use("/api/integraciones/twilio", requireAuth, twilioCredencialesRouter);
app.use("/api/integraciones/ycloud", requireAuth, ycloudCredencialesRouter);

if (ES_PRODUCCION) {
  const clientDist = path.join(__dirname, "..", "client", "dist");
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] Error no manejado:`, err);
  res.status(500).json({ error: "Error interno del servidor.", detalle: err.message });
});

mcpManager
  .inicializar()
  .catch((error) => {
    console.error(`[${new Date().toISOString()}] Error inicializando agentes MCP:`, error.message);
  })
  .finally(() => {
    httpServer.listen(PORT, () => {
      console.log(`[${new Date().toISOString()}] Servidor FotoFace corriendo en el puerto ${PORT}`);
      console.log(`[${new Date().toISOString()}] Base de datos SQLite lista.`);
      seguimiento.iniciar();
    });
  });
