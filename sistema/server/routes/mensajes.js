const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/", (req, res) => {
  try {
    const mensajes = db
      .prepare(
        `SELECT * FROM mensajes_whatsapp ORDER BY recibido_en DESC, id DESC LIMIT 50`
      )
      .all();
    res.json(mensajes);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error obteniendo mensajes:`, error);
    res.status(500).json({ error: "No se pudieron obtener los mensajes.", detalle: error.message });
  }
});

module.exports = router;
