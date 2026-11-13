import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import TarjetasEstadisticas from "@/components/TarjetasEstadisticas";
import TarjetasMarketing from "@/components/TarjetasMarketing";
import GraficoEmbudo from "@/components/GraficoEmbudo";
import GraficoTendencia from "@/components/GraficoTendencia";
import GraficoOrigenes from "@/components/GraficoOrigenes";
import { obtenerEstadisticasDetalle } from "@/lib/api";

export default function SeccionDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["estadisticas-detalle"],
    queryFn: obtenerEstadisticasDetalle,
  });

  return (
    <div className="flex flex-col gap-6">
      <TarjetasEstadisticas />

      <TarjetasMarketing />

      <Card>
        <CardHeader>
          <CardTitle>Tendencia diaria de mensajes</CardTitle>
          <CardDescription>Mensajes de clientes, respuestas de Lumi y del equipo humano, últimos 14 días.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Cargando...</p>}
          {!isLoading && <GraficoTendencia datos={data?.serie_diaria || []} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resumen de interacciones</CardTitle>
          <CardDescription>Del primer contacto al turno agendado (histórico, todos los canales).</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Cargando...</p>}
          {!isLoading && <GraficoEmbudo datos={data?.embudo || []} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Origen de los contactos</CardTitle>
          <CardDescription>
            De dónde viene cada contacto nuevo: directo, o desde una campaña con código (TikTok, LinkedIn, etc.).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Cargando...</p>}
          {!isLoading && <GraficoOrigenes datos={data?.origenes || []} />}
        </CardContent>
      </Card>
    </div>
  );
}
