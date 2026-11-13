/**
 * Convierte el markdown que naturalmente escriben los modelos (GitHub-flavored:
 * **negrita**, encabezados con #, listas con "- ", lineas divisorias ---) al
 * formato que WhatsApp realmente interpreta (*negrita* con un solo asterisco,
 * sin encabezados, sin lineas divisorias). Sin esto, el cliente ve literalmente
 * los asteriscos dobles y los simbolos de markdown en el chat.
 */
function aTextoWhatsapp(texto) {
  if (!texto) return texto;
  let resultado = texto;

  // Encabezados markdown (#, ##, ###...) -> negrita simple de WhatsApp
  resultado = resultado.replace(/^#{1,6}\s*(.+)$/gm, "*$1*");

  // Negrita markdown (**texto** o __texto__) -> negrita de WhatsApp (*texto*)
  resultado = resultado.replace(/\*\*(.+?)\*\*/g, "*$1*");
  resultado = resultado.replace(/__(.+?)__/g, "*$1*");

  // Lineas divisorias markdown (---, ***, ___) -> se eliminan, WhatsApp no las soporta
  resultado = resultado.replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, "");

  // Bullets markdown ("- item" o "* item") -> bullet mas prolijo ("• item")
  resultado = resultado.replace(/^[ \t]*[-*][ \t]+/gm, "• ");

  // Colapsar 3+ saltos de linea seguidos (quedan de las lineas divisorias eliminadas)
  resultado = resultado.replace(/\n{3,}/g, "\n\n");

  return resultado.trim();
}

module.exports = { aTextoWhatsapp };
