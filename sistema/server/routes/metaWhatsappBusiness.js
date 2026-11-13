const express = require("express");
const clavesMetaWhatsapp = require("../services/clavesMetaWhatsapp");
const metaWhatsappBusiness = require("../services/metaWhatsappBusiness");

const router = express.Router();

router.get("/estado", (req, res) => {
  res.json(clavesMetaWhatsapp.estado());
});

// Body: { access_token?, phone_number_id?, waba_id? }. Vacio ("") borra lo guardado (vuelve al .env, si hay).
router.put("/", (req, res) => {
  try {
    res.json(clavesMetaWhatsapp.guardar(req.body || {}, req.usuario?.email));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/probar", async (req, res) => {
  try {
    res.json(await metaWhatsappBusiness.probar());
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/cuenta", async (req, res) => {
  try {
    res.json(await metaWhatsappBusiness.obtenerInfoCuenta());
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

router.get("/plantillas", async (req, res) => {
  try {
    res.json({ plantillas: await metaWhatsappBusiness.listarPlantillas() });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

router.post("/plantillas", async (req, res) => {
  try {
    res.status(201).json(await metaWhatsappBusiness.crearPlantilla(req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete("/plantillas/:nombre", async (req, res) => {
  try {
    res.json(await metaWhatsappBusiness.eliminarPlantilla(req.params.nombre));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
