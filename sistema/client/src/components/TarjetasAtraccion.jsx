import { useQuery } from "@tanstack/react-query";
import { Globe, Users, Eye, MousePointerClick, Search, Hash } from "lucide-react";
import TarjetaResumen from "@/components/TarjetaResumen";
import { Card, CardContent } from "@/components/ui/card";
import { obtenerEstadoGoogle, obtenerAnaliticaGoogle } from "@/lib/api";

/** KPIs de "Atraccion" (trafico, visitas, impresiones, CTR, palabras clave) desde Google Analytics 4 + Search Console. */
export default function TarjetasAtraccion() {
  const { data: estado } = useQuery({ queryKey: ["google-estado"], queryFn: obtenerEstadoGoogle });
  const habilitado = Boolean(estado?.analytics_habilitado || estado?.search_console_habilitado);

  const { data, isLoading } = useQuery({
    queryKey: ["google-analytics"],
    queryFn: () => obtenerAnaliticaGoogle(30),
    enabled: habilitado,
  });

  if (!estado) return null;

  if (!habilitado) {
    return (
      <div className="flex flex-col gap-3">
        <h3 className="font-display text-sm font-semibold text-muted-foreground">KPIs de Marketing — Atracción</h3>
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Conecta Google en <strong>Conexiones</strong> y completa el Property ID de Analytics 4 y/o el sitio de
            Search Console para ver tráfico, impresiones, CTR y palabras clave posicionadas de fotoface.pro.
          </CardContent>
        </Card>
      </div>
    );
  }

  const atraccion = data?.atraccion;
  const busqueda = data?.busqueda;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-muted-foreground">KPIs de Marketing — Atracción</h3>
        <span className="text-xs text-muted-foreground">Últimos 30 días</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <TarjetaResumen icono={Users} color="#4a3aa7" etiqueta="Visitas únicas" valor={isLoading ? "…" : atraccion ? atraccion.visitas_unicas.toLocaleString("es-PE") : "—"} />
        <TarjetaResumen icono={Globe} color="#2a78d6" etiqueta="Tráfico orgánico" valor={isLoading ? "…" : atraccion ? atraccion.trafico_organico.toLocaleString("es-PE") : "—"} />
        <TarjetaResumen icono={Eye} color="#1baf7a" etiqueta="Impresiones" valor={isLoading ? "…" : busqueda ? busqueda.impresiones.toLocaleString("es-PE") : "—"} />
        <TarjetaResumen icono={MousePointerClick} color="#eda100" etiqueta="CTR" valor={isLoading ? "…" : busqueda ? `${busqueda.ctr}%` : "—"} />
        <TarjetaResumen icono={Hash} color="#e34948" etiqueta="Palabras clave posicionadas" valor={isLoading ? "…" : busqueda ? busqueda.palabras_clave_posicionadas.toLocaleString("es-PE") : "—"} />
        <TarjetaResumen icono={Search} color="#e87ba4" etiqueta="Posición promedio" valor={isLoading ? "…" : busqueda?.posicion_promedio ?? "—"} />
      </div>
    </div>
  );
}
