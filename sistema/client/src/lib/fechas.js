import { format, isValid, parseISO } from "date-fns";
import { es } from "date-fns/locale";

function aFecha(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  const parseada = parseISO(valor);
  if (isValid(parseada)) return parseada;
  const nativa = new Date(String(valor).replace(" ", "T"));
  return isValid(nativa) ? nativa : null;
}

export function formatearCorto(valor) {
  const fecha = aFecha(valor);
  return fecha ? format(fecha, "d MMM, HH:mm", { locale: es }) : "";
}

export function formatearLargo(valor) {
  const fecha = aFecha(valor);
  return fecha ? format(fecha, "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es }) : "";
}

export function formatearFechaISO(fecha) {
  return format(fecha, "yyyy-MM-dd");
}

export { aFecha };
