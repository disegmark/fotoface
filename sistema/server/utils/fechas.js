const { format, isValid, parseISO } = require("date-fns");
const { es } = require("date-fns/locale");

function aFecha(valor) {
  if (valor instanceof Date) return valor;
  if (typeof valor === "string") {
    const parseada = parseISO(valor);
    if (isValid(parseada)) return parseada;
    const nativa = new Date(valor.replace(" ", "T"));
    if (isValid(nativa)) return nativa;
  }
  return null;
}

function formatearCorto(valor) {
  const fecha = aFecha(valor);
  if (!fecha) return "";
  return format(fecha, "d MMM, HH:mm", { locale: es });
}

function formatearLargo(valor) {
  const fecha = aFecha(valor);
  if (!fecha) return "";
  return format(fecha, "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es });
}

function formatearFechaISO(valor) {
  const fecha = aFecha(valor);
  if (!fecha) return "";
  return format(fecha, "yyyy-MM-dd");
}

module.exports = {
  aFecha,
  formatearCorto,
  formatearLargo,
  formatearFechaISO,
};
