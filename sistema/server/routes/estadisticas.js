const express = require("express");
const db = require("../db");
const { clasificarNivel } = require("../services/clasificacionVentas");
const { nombreLegible } = require("../utils/origen");

const router = express.Router();

// Los timestamps se guardan con la hora del servidor (UTC); Peru es UTC-5 todo
// el año (sin horario de verano). "Hoy" para el dashboard tiene que ser el dia
// calendario en Peru, no en UTC — si no, durante las ultimas ~5 horas de cada
// dia (19:00 a 24:00 hora Peru) el servidor ya cree que es "mañana" en UTC y
// las tarjetas muestran todo en cero pese a haber actividad real ese dia.
const DESPLAZAMIENTO_PERU = "-5 hours";

router.get("/", (req, res) => {
  try {
    const conversacionesHoy = db
      .prepare(
        `SELECT COUNT(DISTINCT numero_telefono) AS total FROM mensajes_whatsapp
         WHERE date(recibido_en, ?) = date('now', ?)`
      )
      .get(DESPLAZAMIENTO_PERU, DESPLAZAMIENTO_PERU).total;

    const contactosNuevosHoy = db
      .prepare(`SELECT COUNT(*) AS total FROM contactos WHERE date(creado_en, ?) = date('now', ?)`)
      .get(DESPLAZAMIENTO_PERU, DESPLAZAMIENTO_PERU).total;

    const mensajesUsuarioHoy = db
      .prepare(
        `SELECT COUNT(*) AS total FROM mensajes_whatsapp
         WHERE remitente = 'usuario' AND date(recibido_en, ?) = date('now', ?)`
      )
      .get(DESPLAZAMIENTO_PERU, DESPLAZAMIENTO_PERU).total;

    const resueltasPorIaHoy = db
      .prepare(
        `SELECT COUNT(*) AS total FROM mensajes_whatsapp
         WHERE remitente = 'asistente' AND date(recibido_en, ?) = date('now', ?)`
      )
      .get(DESPLAZAMIENTO_PERU, DESPLAZAMIENTO_PERU).total;

    const enEsperaHumana = db
      .prepare(`SELECT COUNT(*) AS total FROM conversaciones WHERE modo = 'humano'`)
      .get().total;

    const tasaExito =
      mensajesUsuarioHoy > 0 ? Math.round((resueltasPorIaHoy / mensajesUsuarioHoy) * 100) : 0;

    res.json({
      conversaciones_hoy: conversacionesHoy,
      contactos_nuevos_hoy: contactosNuevosHoy,
      resueltas_por_ia_hoy: resueltasPorIaHoy,
      en_espera_humana: enEsperaHumana,
      tasa_exito: tasaExito,
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error calculando estadisticas:`, error);
    res.status(500).json({ error: "No se pudieron calcular las estadisticas.", detalle: error.message });
  }
});

/**
 * Estadisticas agregadas para los graficos del Dashboard: solo metadata
 * estructural (conteos, fechas, estados) de las conversaciones — nunca el
 * contenido de los mensajes.
 */
router.get("/detalle", (req, res) => {
  try {
    // Etapas pensadas para ser un embudo real (cada una subconjunto de la
    // anterior), no solo conteos independientes que podrian superar al total.
    const totalContactos = db.prepare("SELECT COUNT(*) AS total FROM conversaciones").get().total;
    const conversacionesActivas = db
      .prepare("SELECT COUNT(*) AS total FROM conversaciones WHERE estado = 'activa'")
      .get().total;

    const numerosActivos = db
      .prepare("SELECT numero_telefono FROM conversaciones WHERE estado = 'activa'")
      .all()
      .map((fila) => fila.numero_telefono);
    const conInteres = numerosActivos.filter((numero) =>
      ["tibio", "caliente"].includes(clasificarNivel(numero))
    ).length;

    const totalTurnos = db
      .prepare("SELECT COUNT(*) AS total FROM turnos WHERE estado IN ('confirmado', 'completado')")
      .get().total;

    const filas = db
      .prepare(
        `SELECT date(recibido_en, ?) AS fecha, remitente, COUNT(*) AS total
         FROM mensajes_whatsapp
         WHERE date(recibido_en, ?) >= date('now', ?, '-13 days')
         GROUP BY date(recibido_en, ?), remitente`
      )
      .all(DESPLAZAMIENTO_PERU, DESPLAZAMIENTO_PERU, DESPLAZAMIENTO_PERU, DESPLAZAMIENTO_PERU);

    const dias = [];
    for (let i = 13; i >= 0; i--) {
      const fecha = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      dias.push(
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Lima",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(fecha)
      );
    }

    const serieMap = Object.fromEntries(
      dias.map((fecha) => [fecha, { fecha, usuario: 0, asistente: 0, humano: 0 }])
    );
    for (const fila of filas) {
      if (serieMap[fila.fecha] && ["usuario", "asistente", "humano"].includes(fila.remitente)) {
        serieMap[fila.fecha][fila.remitente] = fila.total;
      }
    }

    const filasOrigen = db
      .prepare(
        `SELECT COALESCE(origen, '') AS origen, COUNT(*) AS total
         FROM contactos
         GROUP BY origen
         ORDER BY total DESC`
      )
      .all();
    const origenes = filasOrigen.map((fila) => ({
      origen: nombreLegible(fila.origen || null),
      valor: fila.total,
    }));

    res.json({
      embudo: [
        { etapa: "Contactos", valor: totalContactos },
        { etapa: "Conversaciones activas", valor: conversacionesActivas },
        { etapa: "Con interés concreto", valor: conInteres },
        { etapa: "Turnos agendados", valor: totalTurnos },
      ],
      serie_diaria: Object.values(serieMap),
      origenes,
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error calculando estadisticas detalladas:`, error);
    res.status(500).json({ error: "No se pudieron calcular las estadisticas.", detalle: error.message });
  }
});

module.exports = router;
