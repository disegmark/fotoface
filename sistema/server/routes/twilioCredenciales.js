const express = require("express");
const clavesTwilio = require("../services/clavesTwilio");
const twilioService = require("../services/twilio");

const router = express.Router();

router.get("/estado", (req, res) => {
  res.json(clavesTwilio.estado());
});

// Body: { account_sid?, auth_token?, numero_whatsapp? }. Vacio ("") borra lo guardado (vuelve al .env, si hay).
router.put("/", (req, res) => {
  try {
    res.json(clavesTwilio.guardar(req.body || {}, req.usuario?.email));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/probar", async (req, res) => {
  try {
    res.json(await twilioService.probar());
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
