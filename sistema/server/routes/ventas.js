const express = require("express");
const db = require("../db");
const { clasificarNivel } = require("../services/clasificacionVentas");

const router = express.Router();

const ETAPAS_EMBUDO = ["nuevo", "contactado", "propuesta", "negociacion", "ganado", "perdido"];

router.get("/", (req, res) => {
  try {
    const conversaciones = db
      .prepare(
        `SELECT
           conv.numero_telefono,
           conv.canal,
           conv.etapa_seguimiento,
           conv.ultimo_mensaje_en,
           cont.nombre,
           cont.etapa_embudo,
           cont.asignado_a,
           usr.nombre AS asignado_nombre,
           cont.valor_potencial,
           cont.tags,
           cont.notas,
           (SELECT contenido_mensaje FROM mensajes_whatsapp m
              WHERE m.numero_telefono = conv.numero_telefono
              ORDER BY m.id DESC LIMIT 1) AS ultimo_mensaje
         FROM conversaciones conv
         LEFT JOIN contactos cont ON cont.numero_telefono = conv.numero_telefono
         LEFT JOIN usuarios usr ON usr.id = cont.asignado_a
         ORDER BY conv.ultimo_mensaje_en DESC`
      )
      .all();

    const conNivel = conversaciones.map((conversacion) => ({
      ...conversacion,
      etapa_embudo: conversacion.etapa_embudo || "nuevo",
      nivel: clasificarNivel(conversacion.numero_telefono),
    }));

    res.json(conNivel);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error obteniendo clasificacion de ventas:`, error);
    res.status(500).json({ error: "No se pudo obtener la clasificacion de ventas.", detalle: error.message });
  }
});

router.patch("/:numeroTelefono", (req, res) => {
  const { numeroTelefono } = req.params;
  const { etapa_embudo, asignado_a, valor_potencial, tags, notas } = req.body;

  if (etapa_embudo !== undefined && !ETAPAS_EMBUDO.includes(etapa_embudo)) {
    return res.status(400).json({ error: `etapa_embudo invalida. Valores permitidos: ${ETAPAS_EMBUDO.join(", ")}.` });
  }
  if (asignado_a !== undefined && asignado_a !== null) {
    const usuario = db.prepare("SELECT 1 FROM usuarios WHERE id = ?").get(asignado_a);
    if (!usuario) return res.status(400).json({ error: "El usuario asignado no existe." });
  }
  if (valor_potencial !== undefined && valor_potencial !== null && Number.isNaN(Number(valor_potencial))) {
    return res.status(400).json({ error: "valor_potencial debe ser un numero." });
  }

  try {
    const contacto = db.prepare("SELECT id FROM contactos WHERE numero_telefono = ?").get(numeroTelefono);
    if (!contacto) return res.status(404).json({ error: "No existe un contacto con ese numero." });

    const campos = { etapa_embudo, asignado_a, valor_potencial, tags, notas };
    const actualizaciones = Object.entries(campos).filter(([, valor]) => valor !== undefined);
    if (actualizaciones.length === 0) {
      return res.status(400).json({ error: "No se envio ningun campo para actualizar." });
    }

    const asignaciones = actualizaciones.map(([campo]) => `${campo} = ?`).join(", ");
    const valores = actualizaciones.map(([, valor]) => valor);
    db.prepare(
      `UPDATE contactos SET ${asignaciones}, actualizado_en = datetime('now', 'localtime') WHERE numero_telefono = ?`
    ).run(...valores, numeroTelefono);

    const actualizado = db
      .prepare(
        `SELECT cont.*, usr.nombre AS asignado_nombre
         FROM contactos cont
         LEFT JOIN usuarios usr ON usr.id = cont.asignado_a
         WHERE cont.numero_telefono = ?`
      )
      .get(numeroTelefono);
    res.json(actualizado);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error actualizando pipeline de contacto:`, error);
    res.status(500).json({ error: "No se pudo actualizar el contacto.", detalle: error.message });
  }
});

module.exports = router;
