import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, UserPlus, Bot, UserCheck, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { obtenerEstadisticas } from "@/lib/api";
import { socket } from "@/lib/socket";

const TARJETAS = [
  { clave: "conversaciones_hoy", etiqueta: "Conversaciones hoy", icono: MessageSquare },
  { clave: "contactos_nuevos_hoy", etiqueta: "Contactos nuevos", icono: UserPlus },
  { clave: "resueltas_por_ia_hoy", etiqueta: "Resueltas por IA", icono: Bot },
  { clave: "en_espera_humana", etiqueta: "En espera humana", icono: UserCheck },
  { clave: "tasa_exito", etiqueta: "Tasa de exito", icono: TrendingUp, sufijo: "%" },
];

export default function TarjetasEstadisticas() {
  const queryClient = useQueryClient();

  const { data: estadisticas } = useQuery({
    queryKey: ["estadisticas"],
    queryFn: obtenerEstadisticas,
    refetchInterval: 15000,
  });

  useEffect(() => {
    function refrescar() {
      queryClient.invalidateQueries({ queryKey: ["estadisticas"] });
    }
    socket.on("mensaje:nuevo", refrescar);
    socket.on("conversacion:actualizada", refrescar);
    return () => {
      socket.off("mensaje:nuevo", refrescar);
      socket.off("conversacion:actualizada", refrescar);
    };
  }, [queryClient]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {TARJETAS.map(({ clave, etiqueta, icono: Icono, sufijo }) => (
        <Card key={clave}>
          <CardContent className="flex items-center justify-between gap-3 p-5">
            <div>
              <p className="text-xs font-medium text-muted-foreground">{etiqueta}</p>
              <p className="font-display text-2xl font-bold">
                {estadisticas ? estadisticas[clave] : "-"}
                {sufijo || ""}
              </p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white">
              <Icono className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
