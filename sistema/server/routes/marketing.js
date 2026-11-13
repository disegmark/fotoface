const express = require("express");
const db = require("../db");
const { clasificarNivel } = require("../services/clasificacionVentas");

const router = express.Router();

const CANALES_VALIDOS = ["tiktok", "meta", "linkedin", "google", "email", "otro"];
const ESTADOS_VALIDOS = ["activa", "pausada", "finalizada"];

/**
 * Clics = contactos que llegaron con este codigo de origen.
 * Leads = de esos, cuantos mostraron interes concreto (tibio/caliente).
 * Ventas = de esos, cuantos llegaron a "ganado" en el pipeline (Ventas y Clientes Potenciales).
 * Ingreso = suma del valor_potencial de esos contactos ganados.
 */
function calcularMetricas(codigoOrigen, inversion) {
  const contactos = db
    .prepare("SELECT numero_telefono, etapa_embudo, valor_potencial FROM contactos WHERE origen = ?")
    .all(codigoOrigen);
  const clics = contactos.length;
  const leads = contactos.filter((c) => ["tibio", "caliente"].includes(clasificarNivel(c.numero_telefono))).length;
  const ganados = contactos.filter((c) => c.etapa_embudo === "ganado");
  const ventas = ganados.length;
  const ingreso = ganados.reduce((s, c) => s + (c.valor_potencial || 0), 0);
  // CAC: costo por cliente conseguido (no por lead). ROI: retorno sobre lo invertido.
  const cac = inversion && ventas > 0 ? Math.round((inversion / ventas) * 100) / 100 : null;
  const roi = inversion ? Math.round(((ingreso - inversion) / inversion) * 1000) / 10 : null;
  return { clics, leads, ventas, ingreso, cac, roi };
}

/** LTV aproximado: valor promedio de los contactos ganados en todo el pipeline (no solo los de campañas). */
function calcularLtvPromedio() {
  const ganados = db
    .prepare("SELECT valor_potencial FROM contactos WHERE etapa_embudo = 'ganado' AND valor_potencial IS NOT NULL")
    .all();
  if (!ganados.length) return null;
  const total = ganados.reduce((s, c) => s + c.valor_potencial, 0);
  return Math.round((total / ganados.length) * 100) / 100;
}

function obtenerTodas() {
  const filas = db.prepare("SELECT * FROM campanas_marketing ORDER BY creado_en DESC").all();
  const campanas = filas.map((fila) => ({ ...fila, ...calcularMetricas(fila.codigo_origen, fila.inversion), es_demo: false }));
  return { es_demo: false, campanas };
}

function calcularResumen(campanas) {
  const clicsTotales = campanas.reduce((s, c) => s + c.clics, 0);
  const leadsTotales = campanas.reduce((s, c) => s + c.leads, 0);
  const ventasTotales = campanas.reduce((s, c) => s + c.ventas, 0);
  const ingresoTotal = campanas.reduce((s, c) => s + c.ingreso, 0);
  const inversionTotal = campanas.reduce((s, c) => s + (c.inversion || 0), 0);
  const tasaConversion = clicsTotales > 0 ? Math.round((leadsTotales / clicsTotales) * 1000) / 10 : 0;
  const cacPromedio = ventasTotales > 0 ? Math.round((inversionTotal / ventasTotales) * 100) / 100 : null;
  const roiTotal = inversionTotal > 0 ? Math.round(((ingresoTotal - inversionTotal) / inversionTotal) * 1000) / 10 : null;

  return {
    campanas_activas: campanas.filter((c) => c.estado === "activa").length,
    clics_totales: clicsTotales,
    leads_generados: leadsTotales,
    inversion_total: inversionTotal,
    tasa_conversion: tasaConversion,
    ventas_generadas: ventasTotales,
    ingreso_total: ingresoTotal,
    cac_promedio: cacPromedio,
    roi_total: roiTotal,
    ltv_promedio: calcularLtvPromedio(),
  };
}

router.get("/", (req, res) => {
  try {
    const { es_demo, campanas } = obtenerTodas();
    res.json({ es_demo, campanas, resumen: calcularResumen(campanas) });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error obteniendo campañas:`, error);
    res.status(500).json({ error: "No se pudieron obtener las campañas.", detalle: error.message });
  }
});

router.post("/", (req, res) => {
  const { nombre, descripcion, canal, codigo_origen, mensaje_precargado, inversion, estado } = req.body;

  if (!nombre || !canal || !codigo_origen) {
    return res.status(400).json({ error: "El nombre, canal y código de origen son requeridos." });
  }
  if (!CANALES_VALIDOS.includes(canal)) {
    return res.status(400).json({ error: `Canal invalido. Debe ser uno de: ${CANALES_VALIDOS.join(", ")}` });
  }
  if (estado && !ESTADOS_VALIDOS.includes(estado)) {
    return res.status(400).json({ error: `Estado invalido. Debe ser uno de: ${ESTADOS_VALIDOS.join(", ")}` });
  }

  const codigoLimpio = String(codigo_origen).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  if (!codigoLimpio) {
    return res.status(400).json({ error: "El código de origen no puede quedar vacío." });
  }

  const existente = db.prepare("SELECT 1 FROM campanas_marketing WHERE codigo_origen = ?").get(codigoLimpio);
  if (existente) {
    return res.status(400).json({ error: `Ya existe una campaña con el código "${codigoLimpio}".` });
  }

  try {
    const resultado = db
      .prepare(
        `INSERT INTO campanas_marketing (nombre, descripcion, canal, codigo_origen, mensaje_precargado, inversion, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        nombre,
        descripcion || null,
        canal,
        codigoLimpio,
        mensaje_precargado || "Hola, quiero más información",
        inversion ? Number(inversion) : null,
        estado || "activa"
      );

    const creada = db.prepare("SELECT * FROM campanas_marketing WHERE id = ?").get(resultado.lastInsertRowid);
    res.status(201).json({ ...creada, ...calcularMetricas(creada.codigo_origen, creada.inversion), es_demo: false });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error creando campaña:`, error);
    res.status(500).json({ error: "No se pudo crear la campaña.", detalle: error.message });
  }
});

router.patch("/:id", (req, res) => {
  const { id } = req.params;
  const { estado, inversion, nombre } = req.body;

  if (String(id).startsWith("demo-")) {
    return res.status(400).json({ error: "No se puede editar una campaña de ejemplo." });
  }
  if (estado && !ESTADOS_VALIDOS.includes(estado)) {
    return res.status(400).json({ error: `Estado invalido. Debe ser uno de: ${ESTADOS_VALIDOS.join(", ")}` });
  }

  const existente = db.prepare("SELECT * FROM campanas_marketing WHERE id = ?").get(id);
  if (!existente) {
    return res.status(404).json({ error: "No se encontro la campaña." });
  }

  try {
    db.prepare(
      `UPDATE campanas_marketing SET
         estado = COALESCE(?, estado),
         inversion = COALESCE(?, inversion),
         nombre = COALESCE(?, nombre)
       WHERE id = ?`
    ).run(estado || null, inversion !== undefined ? Number(inversion) : null, nombre || null, id);

    const actualizada = db.prepare("SELECT * FROM campanas_marketing WHERE id = ?").get(id);
    res.json({ ...actualizada, ...calcularMetricas(actualizada.codigo_origen, actualizada.inversion), es_demo: false });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error actualizando campaña:`, error);
    res.status(500).json({ error: "No se pudo actualizar la campaña.", detalle: error.message });
  }
});

module.exports = router;
