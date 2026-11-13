const express = require("express");
const db = require("../db");
const clavesIA = require("../services/clavesIA");

const router = express.Router();

const CAMPOS_EDITABLES = [
  "nombre_agencia",
  "direccion",
  "telefono",
  "telefono_humano",
  "email",
  "horarios",
  "servicios",
  "sobre_agencia",
  "google_sheets_id",
  "google_calendar_id",
  "ga4_property_id",
  "ga4_measurement_id",
  "search_console_site",
];

router.get("/", (req, res) => {
  try {
    const config = db.prepare("SELECT * FROM configuracion_agencia LIMIT 1").get();
    if (!config) {
      return res.status(404).json({ error: "No hay configuracion de la agencia registrada." });
    }
    res.json(config);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error obteniendo configuracion:`, error);
    res.status(500).json({ error: "No se pudo obtener la configuracion.", detalle: error.message });
  }
});

router.put("/", (req, res) => {
  const timestamp = new Date().toISOString();
  const config = db.prepare("SELECT id FROM configuracion_agencia LIMIT 1").get();

  if (!config) {
    return res.status(404).json({ error: "No hay configuracion de la agencia registrada." });
  }

  const datos = {};
  for (const campo of CAMPOS_EDITABLES) {
    if (req.body[campo] !== undefined) {
      if (typeof req.body[campo] !== "string") {
        return res.status(400).json({ error: `El campo "${campo}" debe ser texto.` });
      }
      datos[campo] = req.body[campo];
    }
  }

  if (Object.keys(datos).length === 0) {
    return res.status(400).json({ error: "No se enviaron campos validos para actualizar." });
  }

  if (datos.servicios !== undefined) {
    try {
      const lista = datos.servicios
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      datos.servicios = JSON.stringify(lista);
    } catch (error) {
      return res.status(400).json({ error: "El campo servicios no pudo ser procesado." });
    }
  }

  try {
    const asignaciones = Object.keys(datos)
      .map((campo) => `${campo} = @${campo}`)
      .join(", ");

    db.prepare(`UPDATE configuracion_agencia SET ${asignaciones} WHERE id = @id`).run({
      ...datos,
      id: config.id,
    });

    const configActualizada = db
      .prepare("SELECT * FROM configuracion_agencia WHERE id = ?")
      .get(config.id);

    console.log(`[${timestamp}] Configuracion de la agencia actualizada.`);
    res.json(configActualizada);
  } catch (error) {
    console.error(`[${timestamp}] Error actualizando configuracion:`, error);
    res.status(500).json({ error: "No se pudo actualizar la configuracion.", detalle: error.message });
  }
});

// --- Claves de IA (DeepSeek, ChatGPT, Claude, OpenRouter) ---
// Nunca se devuelve una clave completa: solo enmascarada (••••abcd).

router.get("/ia", (req, res) => {
  res.json(clavesIA.estado());
});

// Body: { api_key?, modelo? }. api_key vacia ("") borra la clave guardada (vuelve a usar la del .env, si hay).
// Antes de guardar una clave nueva se valida contra el proveedor.
router.put("/ia/:proveedor", async (req, res) => {
  try {
    const { api_key, modelo } = req.body || {};
    if (api_key) {
      const prueba = await clavesIA.probar(req.params.proveedor, api_key);
      if (!prueba.ok) return res.status(400).json({ error: `No se guardo: ${prueba.mensaje}` });
    }
    const resultado = clavesIA.guardar(req.params.proveedor, { api_key, modelo }, req.usuario?.email);
    console.log(`[${new Date().toISOString()}] Clave de IA "${req.params.proveedor}" actualizada por ${req.usuario?.email}.`);
    res.json(resultado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/ia/:proveedor/probar", async (req, res) => {
  try {
    res.json(await clavesIA.probar(req.params.proveedor, req.body?.api_key));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
