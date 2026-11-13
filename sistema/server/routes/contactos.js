const express = require("express");
const db = require("../db");
const { nombreLegible } = require("../utils/origen");

const router = express.Router();

router.get("/", (req, res) => {
  try {
    const contactos = db
      .prepare(
        `SELECT
           cont.numero_telefono,
           cont.nombre,
           cont.email,
           cont.origen,
           cont.creado_en,
           conv.canal,
           (SELECT contenido_mensaje FROM mensajes_whatsapp m
              WHERE m.numero_telefono = cont.numero_telefono
              ORDER BY m.id DESC LIMIT 1) AS ultimo_mensaje
         FROM contactos cont
         LEFT JOIN conversaciones conv ON conv.numero_telefono = cont.numero_telefono
         ORDER BY cont.creado_en DESC`
      )
      .all()
      .map((contacto) => ({ ...contacto, origen_legible: nombreLegible(contacto.origen) }));
    res.json(contactos);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error obteniendo contactos:`, error);
    res.status(500).json({ error: "No se pudieron obtener los contactos.", detalle: error.message });
  }
});

module.exports = router;
