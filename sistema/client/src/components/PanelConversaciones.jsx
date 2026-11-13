import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, Phone, Send, UserCheck, UserCog } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatearCorto } from "@/lib/fechas";
import {
  obtenerConversaciones,
  obtenerMensajesConversacion,
  cambiarControlConversacion,
  enviarMensajeHumano,
} from "@/lib/api";
import { socket } from "@/lib/socket";

function iniciales(nombre, numero) {
  if (nombre) {
    return nombre
      .split(" ")
      .map((parte) => parte[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }
  return numero ? numero.slice(-2) : "?";
}

export default function PanelConversaciones() {
  const queryClient = useQueryClient();
  const [numeroSeleccionado, setNumeroSeleccionado] = useState(null);
  const [textoMensaje, setTextoMensaje] = useState("");

  const { data: conversaciones = [] } = useQuery({
    queryKey: ["conversaciones"],
    queryFn: obtenerConversaciones,
    refetchInterval: 20000,
  });

  useEffect(() => {
    if (!numeroSeleccionado && conversaciones.length > 0) {
      setNumeroSeleccionado(conversaciones[0].numero_telefono);
    }
  }, [conversaciones, numeroSeleccionado]);

  const { data: mensajes = [] } = useQuery({
    queryKey: ["conversacion-mensajes", numeroSeleccionado],
    queryFn: () => obtenerMensajesConversacion(numeroSeleccionado),
    enabled: Boolean(numeroSeleccionado),
  });

  useEffect(() => {
    function alRecibirMensaje(mensaje) {
      queryClient.invalidateQueries({ queryKey: ["conversaciones"] });
      if (mensaje.numero_telefono === numeroSeleccionado) {
        queryClient.invalidateQueries({ queryKey: ["conversacion-mensajes", numeroSeleccionado] });
      }
    }
    function alActualizarConversacion() {
      queryClient.invalidateQueries({ queryKey: ["conversaciones"] });
    }
    socket.on("mensaje:nuevo", alRecibirMensaje);
    socket.on("conversacion:actualizada", alActualizarConversacion);
    return () => {
      socket.off("mensaje:nuevo", alRecibirMensaje);
      socket.off("conversacion:actualizada", alActualizarConversacion);
    };
  }, [numeroSeleccionado, queryClient]);

  const conversacionActual = useMemo(
    () => conversaciones.find((c) => c.numero_telefono === numeroSeleccionado) || null,
    [conversaciones, numeroSeleccionado]
  );

  const mutacionControl = useMutation({
    mutationFn: ({ numero, modo }) => cambiarControlConversacion(numero, modo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversaciones"] });
    },
    onError: (error) => toast.error(error.message || "No se pudo cambiar el control."),
  });

  const mutacionEnviar = useMutation({
    mutationFn: ({ numero, texto }) => enviarMensajeHumano(numero, texto),
    onSuccess: () => {
      setTextoMensaje("");
      queryClient.invalidateQueries({ queryKey: ["conversacion-mensajes", numeroSeleccionado] });
      queryClient.invalidateQueries({ queryKey: ["conversaciones"] });
    },
    onError: (error) => toast.error(error.message || "No se pudo enviar el mensaje."),
  });

  function manejarEnvio(evento) {
    evento.preventDefault();
    if (!textoMensaje.trim() || !numeroSeleccionado) return;
    mutacionEnviar.mutate({ numero: numeroSeleccionado, texto: textoMensaje.trim() });
  }

  const modoHumano = conversacionActual?.modo === "humano";

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr_260px]">
      <Card className="flex max-h-[650px] flex-col overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Conversaciones</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 space-y-1 overflow-y-auto p-2">
          {conversaciones.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">Todavia no hay conversaciones.</p>
          )}
          {conversaciones.map((conv) => (
            <button
              key={conv.numero_telefono}
              onClick={() => setNumeroSeleccionado(conv.numero_telefono)}
              className={cn(
                "flex w-full flex-col gap-0.5 rounded-xl p-3 text-left transition-colors",
                conv.numero_telefono === numeroSeleccionado ? "bg-accent" : "hover:bg-muted"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">
                  {conv.nombre || conv.numero_telefono}
                </span>
                {conv.modo === "humano" ? (
                  <Badge variant="warning">Humano</Badge>
                ) : (
                  <Badge variant="info">IA</Badge>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {conv.ultimo_remitente === "usuario" ? "" : "Tu: "}
                {conv.ultimo_mensaje}
              </p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="flex max-h-[650px] flex-col overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-3">
          <div>
            <CardTitle className="text-base">
              {conversacionActual
                ? conversacionActual.nombre || conversacionActual.numero_telefono
                : "Seleccione una conversacion"}
            </CardTitle>
            {conversacionActual && (
              <p className="text-xs text-muted-foreground">{conversacionActual.numero_telefono}</p>
            )}
          </div>
          {conversacionActual && (
            <Badge variant={modoHumano ? "warning" : "info"}>
              {modoHumano ? "IA en pausa" : "IA Activa"}
            </Badge>
          )}
        </CardHeader>

        <CardContent className="flex-1 space-y-3 overflow-y-auto bg-muted/40 p-4">
          {mensajes.map((mensaje) => {
            const esUsuario = mensaje.remitente === "usuario";
            return (
              <div key={mensaje.id} className={cn("flex", esUsuario ? "justify-start" : "justify-end")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm",
                    esUsuario
                      ? "bg-secondary"
                      : mensaje.remitente === "humano"
                        ? "bg-amber-500/15"
                        : "bg-brand-primary/10"
                  )}
                >
                  <div className="mb-1 flex items-center gap-1.5">
                    {esUsuario ? (
                      <Phone className="h-3 w-3 text-muted-foreground" />
                    ) : mensaje.remitente === "humano" ? (
                      <UserCog className="h-3 w-3 text-amber-700" />
                    ) : (
                      <Bot className="h-3 w-3 text-brand-primary" />
                    )}
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {esUsuario ? "Cliente" : mensaje.remitente === "humano" ? "Agente humano" : "Lumi (IA)"}
                    </span>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {formatearCorto(mensaje.recibido_en)}
                    </span>
                  </div>
                  <p className="text-sm">{mensaje.contenido_mensaje}</p>
                </div>
              </div>
            );
          })}
        </CardContent>

        <form onSubmit={manejarEnvio} className="flex items-center gap-2 border-t border-border p-3">
          <Input
            value={textoMensaje}
            onChange={(e) => setTextoMensaje(e.target.value)}
            placeholder={
              modoHumano
                ? "Escribe un mensaje..."
                : "Toma el control para responder manualmente"
            }
            disabled={!modoHumano || !numeroSeleccionado || mutacionEnviar.isPending}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!modoHumano || !numeroSeleccionado || mutacionEnviar.isPending}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Control de la conversacion</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!conversacionActual ? (
            <p className="text-sm text-muted-foreground">Seleccione una conversacion.</p>
          ) : (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-lg font-bold text-white">
                {iniciales(conversacionActual.nombre, conversacionActual.numero_telefono)}
              </div>
              <div className="space-y-1 text-sm">
                <p className="font-semibold">{conversacionActual.nombre || "Sin nombre"}</p>
                <p className="text-muted-foreground">{conversacionActual.numero_telefono}</p>
              </div>

              <div className="rounded-xl bg-muted/50 p-3 text-sm">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Estado</p>
                <Badge variant={modoHumano ? "warning" : "info"}>
                  {modoHumano ? "Bajo control humano" : "IA gestionando"}
                </Badge>
              </div>

              {modoHumano ? (
                <Button
                  variant="outline"
                  onClick={() =>
                    mutacionControl.mutate({ numero: conversacionActual.numero_telefono, modo: "ia" })
                  }
                  disabled={mutacionControl.isPending}
                >
                  <Bot className="h-4 w-4" /> Devolver a la IA
                </Button>
              ) : (
                <Button
                  variant="gradient"
                  onClick={() =>
                    mutacionControl.mutate({ numero: conversacionActual.numero_telefono, modo: "humano" })
                  }
                  disabled={mutacionControl.isPending}
                >
                  <UserCheck className="h-4 w-4" /> Tomar control
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
