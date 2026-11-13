const express = require("express");
const clavesYcloud = require("../services/clavesYcloud");
const ycloud = require("../services/ycloud");

const router = express.Router();

router.get("/estado", (req, res) => {
  res.json(clavesYcloud.estado());
});

// Body: { api_key?, numero_whatsapp?, webhook_secret? }. Vacio ("") borra lo guardado (vuelve al .env, si hay).
router.put("/", (req, res) => {
  try {
    res.json(clavesYcloud.guardar(req.body || {}, req.usuario?.email));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/probar", async (req, res) => {
  try {
    res.json(await ycloud.probar());
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
