const API_URL = "https://api.deepseek.com/chat/completions";
const MAX_TOKENS = 1024;
const MAX_ITERACIONES_TOOLS = 5;

const clavesIA = require("./clavesIA");

// DeepSeek es el PRIMER nivel (barato y rapido): responde consultas con
// herramientas de solo lectura. Cuando no le corresponde responder, contesta
// solo con uno de estos centinelas y el sistema escala:
// - ACCION   -> ChatGPT: hay que ejecutar algo (agendar/cancelar/reprogramar un turno, inscribir a alguien).
// - COMPLEJO -> Claude: caso delicado o complejo que pide el mejor razonamiento.
const SENTINEL_ACCION = "__ESCALAR_ACCION__";
const SENTINEL_COMPLEJO = "__ESCALAR_COMPLEJO__";

function construirInstruccionEscalamiento(capacidadesExternas) {
  let instruccion = `

Instruccion especial de escalamiento (eres el primer nivel de atencion):
- Responde tu mismo las preguntas generales: servicios, horarios, precios, consultar disponibilidad, o ver turnos e inscripciones existentes.
- Si hay que EJECUTAR una accion — el cliente quiere agendar, cancelar o reprogramar un turno (cualquier accion que modifique la agenda), o ya dio sus datos para inscribirse a un curso, taller o programa — responde unicamente con el texto exacto "${SENTINEL_ACCION}".
- Si el caso es COMPLEJO o delicado — reclamo o cliente molesto, negociacion, o cualquier situacion en la que no estes seguro de responder bien — responde unicamente con el texto exacto "${SENTINEL_COMPLEJO}".
- Cuando uses un centinela, no agregues ninguna explicacion ni texto adicional.`;

  if (capacidadesExternas && capacidadesExternas.length > 0) {
    instruccion += `

Ademas, el sistema cuenta con estas capacidades especiales de agentes externos que no se pueden ejecutar directamente desde aqui:
${capacidadesExternas.map((c) => `- ${c}`).join("\n")}
Si la consulta del cliente necesita alguna de esas capacidades, responder unicamente con el texto exacto "${SENTINEL_ACCION}".`;
  }

  return instruccion;
}

function estaHabilitado() {
  return Boolean(clavesIA.obtenerClave("deepseek"));
}

function toolsAFormatoOpenAI(tools) {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));
}

async function llamarDeepSeek(body) {
  const respuesta = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${clavesIA.obtenerClave("deepseek")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!respuesta.ok) {
    const texto = await respuesta.text();
    throw new Error(`DeepSeek respondio ${respuesta.status}: ${texto}`);
  }

  return respuesta.json();
}

/**
 * Primer nivel de atencion: preguntas generales, servicios, disponibilidad y
 * estado de lo existente. Solo recibe las tools de solo lectura
 * (`toolsSeguras`); no puede crear ni modificar nada.
 *
 * Devuelve `{ texto }` con la respuesta, o `{ escalar: "accion" | "complejo" }`
 * si DeepSeek determino que el mensaje debe resolverlo un nivel superior.
 */
async function procesarMensaje(system, mensajes, toolsSeguras, ejecutarTool, capacidadesExternas = []) {
  if (!estaHabilitado()) {
    throw new Error("DeepSeek no esta configurado (falta DEEPSEEK_API_KEY).");
  }

  const toolsOpenAI = toolsAFormatoOpenAI(toolsSeguras);
  const messages = [
    { role: "system", content: system + construirInstruccionEscalamiento(capacidadesExternas) },
    ...mensajes,
  ];

  for (let iteracion = 0; iteracion < MAX_ITERACIONES_TOOLS; iteracion++) {
    const data = await llamarDeepSeek({
      model: clavesIA.obtenerModelo("deepseek"),
      max_tokens: MAX_TOKENS,
      messages,
      tools: toolsOpenAI,
    });

    const mensaje = data.choices?.[0]?.message;
    if (!mensaje) {
      throw new Error("Respuesta invalida de DeepSeek (sin mensaje).");
    }

    if (!mensaje.tool_calls || mensaje.tool_calls.length === 0) {
      const texto = (mensaje.content || "").trim();
      // No exigimos igualdad estricta: a veces DeepSeek mete un centinela
      // junto con una respuesta de relleno (por ejemplo, dando a entender que
      // ya gestiono el cambio) en vez de responder solo con el texto exacto.
      // Si el centinela aparece en cualquier parte, hay que escalar igual —
      // nunca mandarle al cliente esa mezcla, que puede sonar a una
      // confirmacion que DeepSeek jamas pudo haber ejecutado (no tiene las
      // herramientas para modificar la agenda).
      if (texto.includes(SENTINEL_COMPLEJO)) return { escalar: "complejo" };
      if (texto.includes(SENTINEL_ACCION)) return { escalar: "accion" };
      return { texto };
    }

    messages.push(mensaje);

    for (const toolCall of mensaje.tool_calls) {
      let input = {};
      try {
        input = JSON.parse(toolCall.function.arguments || "{}");
      } catch (error) {
        input = {};
      }
      const resultado = await ejecutarTool(toolCall.function.name, input);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(resultado),
      });
    }
  }

  throw new Error("Se alcanzo el limite de iteraciones de herramientas sin una respuesta final (DeepSeek).");
}

module.exports = { estaHabilitado, procesarMensaje };
