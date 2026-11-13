import { Phone, User, Tag, StickyNote, PhoneCall, Video, MapPin } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatearLargo } from "@/lib/fechas";
import { llamarParaConfirmar } from "@/lib/api";

const VARIANTE_POR_ESTADO = {
  confirmado: "success",
  pendiente: "warning",
  cancelado: "destructive",
  completado: "info",
};

const ETIQUETA_ESTADO = {
  confirmado: "Confirmado",
  pendiente: "Pendiente",
  cancelado: "Cancelado",
  completado: "Completado",
};

export default function ListaTurnos({ turnos = [], cargando }) {
  const queryClient = useQueryClient();

  const mutacionLlamar = useMutation({
    mutationFn: llamarParaConfirmar,
    onSuccess: () => {
      toast.success("Llamada iniciada.");
      queryClient.invalidateQueries({ queryKey: ["turnos"] });
    },
    onError: (error) => toast.error(error.message || "No se pudo iniciar la llamada."),
  });

  return (
    <div className="flex h-[600px] flex-col gap-3 overflow-y-auto rounded-xl bg-muted/40 p-4">
      {cargando && <p className="text-sm text-muted-foreground">Cargando turnos...</p>}
      {!cargando && turnos.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay turnos registrados todavia.</p>
      )}

      {turnos.map((turno) => (
        <Card key={turno.id}>
          <CardContent className="flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between">
              <span className="font-display font-semibold">
                {formatearLargo(turno.fecha_turno)}
              </span>
              <div className="flex items-center gap-2">
                {turno.modalidad && (
                  <Badge variant="outline">
                    {turno.modalidad === "virtual" ? (
                      <span className="flex items-center gap-1">
                        <Video className="h-3 w-3" /> Virtual
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> Presencial
                      </span>
                    )}
                  </Badge>
                )}
                <Badge variant={VARIANTE_POR_ESTADO[turno.estado] || "outline"}>
                  {ETIQUETA_ESTADO[turno.estado] || turno.estado}
                </Badge>
              </div>
            </div>
            <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
              <span className="flex items-center gap-2">
                <User className="h-4 w-4" /> {turno.nombre_paciente || "Sin nombre"}
              </span>
              <span className="flex items-center gap-2">
                <Phone className="h-4 w-4" /> {turno.numero_telefono}
              </span>
              <span className="flex items-center gap-2">
                <Tag className="h-4 w-4" /> {turno.tipo_turno || "No especificado"}
              </span>
              {turno.notas && (
                <span className="flex items-center gap-2">
                  <StickyNote className="h-4 w-4" /> {turno.notas}
                </span>
              )}
            </div>
            {turno.estado !== "cancelado" && (
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={mutacionLlamar.isPending}
                  onClick={() => mutacionLlamar.mutate(turno.id)}
                >
                  <PhoneCall className="h-4 w-4" /> Llamar para confirmar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
