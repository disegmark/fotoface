const db = require("../db");

// Palabras que indican que el prospecto ya mostro un interes concreto (no
// solo un saludo generico): precios, un servicio puntual, o intencion de
// agendar. Clasificacion por reglas simples, sin llamar a un modelo aparte.
const PALABRAS_INTERES_ESPECIFICO = [
  "precio",
  "costo",
  "cotiza",
  "presupuesto",
  "tarifa",
  "plan",
  "paquete",
  "agendar",
  "agenda",
  "cita",
  "turno",
  "reunion",
  "reunión",
  "servicio",
  "contratar",
  "comprar",
  "disponibilidad",
  "horario",
  "marketing",
  "branding",
  "fotografia",
  "fotografía",
  "video",
  "sesion",
  "sesión",
];

/**
 * Clasifica el nivel de interes de un contacto usando reglas simples (sin
 * modelo aparte):
 * - "caliente" (Cliente Potencial): ya tiene un turno confirmado/completado.
 * - "tibio" (Prospecto): sin turno todavia, pero mostro interes concreto
 *   (pregunto por precios, un servicio puntual, o quiso agendar).
 * - "frio" (Informes): solo saludo o pregunta generica, sin senal de interes.
 */
function clasificarNivel(numeroTelefono) {
  const tieneTurno = db
    .prepare(
      "SELECT 1 FROM turnos WHERE numero_telefono = ? AND estado IN ('confirmado', 'completado') LIMIT 1"
    )
    .get(numeroTelefono);
  if (tieneTurno) return "caliente";

  const mensajes = db
    .prepare("SELECT contenido_mensaje FROM mensajes_whatsapp WHERE numero_telefono = ? AND remitente = 'usuario'")
    .all(numeroTelefono);

  const textoCompleto = mensajes.map((m) => m.contenido_mensaje).join(" ").toLowerCase();
  const tieneInteresEspecifico = PALABRAS_INTERES_ESPECIFICO.some((palabra) => textoCompleto.includes(palabra));

  return tieneInteresEspecifico ? "tibio" : "frio";
}

module.exports = { clasificarNivel };
