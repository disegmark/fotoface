const express = require("express");
const clavesPublicidad = require("../services/clavesPublicidad");
const metaAds = require("../services/metaAds");
const tiktokAds = require("../services/tiktokAds");
const googleAds = require("../services/googleAds");
const linkedinAds = require("../services/linkedinAds");
const chatgptAds = require("../services/chatgptAds");

const router = express.Router();

const SERVICIOS = { meta: metaAds, tiktok: tiktokAds, google: googleAds, linkedin: linkedinAds, chatgpt: chatgptAds };

router.get("/estado", (req, res) => {
  res.json(clavesPublicidad.estado());
});

// Body: { access_token?, cuenta_id? }. Vacio ("") borra lo guardado (vuelve a usar el .env, si hay).
router.put("/:plataforma", (req, res) => {
  try {
    const resultado = clavesPublicidad.guardar(req.params.plataforma, req.body || {}, req.usuario?.email);
    res.json(resultado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/:plataforma/probar", async (req, res) => {
  try {
    res.json(await clavesPublicidad.probar(req.params.plataforma));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/:plataforma/metricas", async (req, res) => {
  const servicio = SERVICIOS[req.params.plataforma];
  if (!servicio) return res.status(404).json({ error: "Plataforma invalida." });
  const dias = Number(req.query.dias) > 0 ? Number(req.query.dias) : 30;
  try {
    res.json({ metricas: servicio.estaHabilitado() ? await servicio.obtenerMetricas(dias) : null });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error obteniendo metricas de ${req.params.plataforma}:`, error);
    res.status(502).json({ error: "No se pudieron obtener las metricas.", detalle: error.message });
  }
});

module.exports = router;
