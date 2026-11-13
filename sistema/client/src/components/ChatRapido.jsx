import { useEffect } from "react";

// Chat de respuesta rapida con Lumi: carga el mismo widget que se embebe en
// sitios externos (server/public/widget.js). Se ubica abajo a la izquierda, en
// el extremo opuesto al boton flotante de WhatsApp. El widget se protege solo
// contra cargas duplicadas, asi que puede montarse en varias paginas.
export default function ChatRapido() {
  useEffect(() => {
    if (document.querySelector("script[data-fotoface-chat]")) return;
    const script = document.createElement("script");
    script.src = "/widget.js";
    script.defer = true;
    script.dataset.fotofaceChat = "true";
    document.body.appendChild(script);
  }, []);
  return null;
}
