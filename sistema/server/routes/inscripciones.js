const express = require("express");
const inscripciones = require("../services/inscripciones");

const router = express.Router();

router.get("/", (req, res) => {
  try {
    res.json({ estados: inscripciones.ESTADOS, inscripciones: inscripciones.listar() });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error obteniendo inscripciones:`, error);
    res.status(500).json({ error: "No se pudieron obtener las inscripciones.", detalle: error.message });
  }
});

router.patch("/:id", (req, res) => {
  try {
    const actualizada = inscripciones.actualizar(Number(req.params.id), req.body || {});
    if (!actualizada) return res.status(404).json({ error: "No se encontro la inscripcion." });
    res.json(actualizada);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
