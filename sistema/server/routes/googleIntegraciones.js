const express = require("express");
const googleOAuth = require("../services/googleOAuth");
const googleSheets = require("../services/googleSheets");
const googleCalendar = require("../services/googleCalendar");
const googleAnalytics = require("../services/googleAnalytics");
const googleSearchConsole = require("../services/googleSearchConsole");

const router = express.Router();

router.get("/estado", (req, res) => {
  res.json({
    oauth_habilitado: googleOAuth.estaHabilitado(),
    google_conectado: googleOAuth.estaConectado(),
    sheets_habilitado: googleSheets.estaHabilitado(),
    calendar_habilitado: googleCalendar.estaHabilitado(),
    analytics_habilitado: googleAnalytics.estaHabilitado(),
    search_console_habilitado: googleSearchConsole.estaHabilitado(),
  });
});

// KPIs de "Atraccion" (trafico, visitas, impresiones, CTR, palabras clave) de
// los ultimos `dias` (30 por defecto), combinando GA4 + Search Console.
router.get("/analytics", async (req, res) => {
  const dias = Number(req.query.dias) > 0 ? Number(req.query.dias) : 30;
  try {
    const [atraccion, busqueda] = await Promise.all([
      googleAnalytics.estaHabilitado() ? googleAnalytics.obtenerMetricasAtraccion(dias) : null,
      googleSearchConsole.estaHabilitado() ? googleSearchConsole.obtenerMetricasBusqueda(dias) : null,
    ]);
    res.json({ atraccion, busqueda });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error obteniendo metricas de Analytics/Search Console:`, error);
    res.status(502).json({ error: "No se pudieron obtener las metricas de Google.", detalle: error.message });
  }
});

// Client ID/Secret de la app de OAuth (Google Cloud Console), cargables desde
// el dashboard. El secreto nunca se devuelve completo: solo enmascarado.
router.get("/oauth-config", (req, res) => {
  res.json(googleOAuth.estadoCredenciales());
});

router.put("/oauth-config", (req, res) => {
  try {
    res.json(googleOAuth.guardarCredenciales(req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/iniciar", (req, res) => {
  if (!googleOAuth.estaHabilitado()) {
    return res.status(503).json({
      error:
        "Falta configurar GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET y PUBLIC_BASE_URL en el .env para poder conectar con Google.",
    });
  }
  res.redirect(googleOAuth.obtenerUrlAutorizacion());
});

router.get("/callback", async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.redirect("/dashboard?google_error=" + encodeURIComponent(error));
  }
  if (!code) {
    return res.redirect("/dashboard?google_error=sin_codigo");
  }

  try {
    await googleOAuth.intercambiarCodigo(code);
    res.redirect("/dashboard?google_conectado=1");
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error en callback de Google OAuth:`, err);
    res.redirect("/dashboard?google_error=" + encodeURIComponent(err.message));
  }
});

router.post("/desconectar", (req, res) => {
  googleOAuth.desconectar();
  res.json({ exito: true });
});

module.exports = router;
