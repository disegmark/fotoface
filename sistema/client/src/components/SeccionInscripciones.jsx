import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { GraduationCap, Mail, Phone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { obtenerInscripciones, actualizarInscripcion } from "@/lib/api";
import { formatearCorto } from "@/lib/fechas";
import { socket } from "@/lib/socket";

const ESTADOS = {
  pendiente: { etiqueta: "Pendiente", variante: "warning" },
  pago_reportado: { etiqueta: "Pago reportado", variante: "info" },
  confirmada: { etiqueta: "Confirmada", variante: "success" },
  cancelada: { etiqueta: "Cancelada", variante: "destructive" },
};

// Numero de WhatsApp para escribirle al inscrito (los contactos del chat web se identifican como "web:...").
function numeroWhatsapp(inscripcion) {
  const numero = inscripcion.whatsapp || (inscripcion.numero_telefono.startsWith("web:") ? "" : inscripcion.numero_telefono);
  return numero.replace(/[^\d]/g, "");
}

export default function SeccionInscripciones() {
  const queryClient = useQueryClient();
  const [filtroPrograma, setFiltroPrograma] = useState("todos");
  const { data, isLoading } = useQuery({ queryKey: ["inscripciones"], queryFn: obtenerInscripciones });

  useEffect(() => {
    const refrescar = () => queryClient.invalidateQueries({ queryKey: ["inscripciones"] });
    socket.on("inscripcion:nueva", refrescar);
    return () => socket.off("inscripcion:nueva", refrescar);
  }, [queryClient]);

  const mutacionEstado = useMutation({
    mutationFn: ({ id, estado }) => actualizarInscripcion(id, { estado }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inscripciones"] });
      toast.success("Estado actualizado.");
    },
    onError: (e) => toast.error(e.message),
  });

  const inscripciones = data?.inscripciones || [];
  const conteos = inscripciones.reduce((acc, i) => ({ ...acc, [i.programa]: (acc[i.programa] || 0) + 1 }), {});
  // Los programas no vienen de un catalogo fijo: se recomponen a partir de lo
  // que Lumi haya registrado, para que esto sirva para cualquier curso/taller.
  const programas = useMemo(() => Array.from(new Set(inscripciones.map((i) => i.programa))).sort(), [inscripciones]);
  const filtradas =
    filtroPrograma === "todos" ? inscripciones : inscripciones.filter((i) => i.programa === filtroPrograma);
  const filtros = [["todos", "Todos"], ...programas.map((p) => [p, p])];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Inscripciones que registra Lumi desde WhatsApp y el chat web. Valida el voucher de pago y cambia el estado para
        llevar el control de cada vacante.
      </p>

      <div className="flex flex-wrap gap-2">
        {filtros.map(([id, nombre]) => {
          const activo = filtroPrograma === id;
          return (
            <button
              key={id}
              onClick={() => setFiltroPrograma(id)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                activo ? "border-brand-primary bg-brand-primary text-white" : "border-border bg-card hover:bg-muted"
              }`}
            >
              {nombre}
              {id !== "todos" && (
                <span className={activo ? "text-white/80" : "text-muted-foreground"}> ({conteos[id] || 0})</span>
              )}
            </button>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && <p className="p-6 text-sm text-muted-foreground">Cargando...</p>}
          {!isLoading && filtradas.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">Todavía no hay inscripciones en esta categoría.</p>
          )}
          <div className="flex flex-col divide-y divide-border">
            {filtradas.map((inscripcion) => {
              const estado = ESTADOS[inscripcion.estado] || ESTADOS.pendiente;
              const wa = numeroWhatsapp(inscripcion);
              return (
                <div key={inscripcion.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
                      <GraduationCap className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{inscripcion.nombre}</p>
                      <p className="text-sm text-brand-primary">
                        {inscripcion.programa}
                        {inscripcion.detalle ? ` · ${inscripcion.detalle}` : ""}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {wa && (
                          <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                            <Phone className="h-3 w-3" /> +{wa}
                          </a>
                        )}
                        {inscripcion.email && (
                          <a href={`mailto:${inscripcion.email}`} className="flex items-center gap-1 hover:underline">
                            <Mail className="h-3 w-3" /> {inscripcion.email}
                          </a>
                        )}
                        <span>{formatearCorto(inscripcion.creado_en)}</span>
                      </div>
                      {inscripcion.notas && <p className="mt-1 max-w-xl text-xs text-muted-foreground">📝 {inscripcion.notas}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 md:flex-col md:items-end">
                    <Badge variant={estado.variante}>{estado.etiqueta}</Badge>
                    <select
                      aria-label="Cambiar estado"
                      value={inscripcion.estado}
                      disabled={mutacionEstado.isPending}
                      onChange={(e) => mutacionEstado.mutate({ id: inscripcion.id, estado: e.target.value })}
                      className="rounded-md border border-input bg-card px-2 py-1 text-xs"
                    >
                      {Object.entries(ESTADOS).map(([id, info]) => (
                        <option key={id} value={id}>
                          {info.etiqueta}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
