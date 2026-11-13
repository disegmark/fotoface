import { useQuery } from "@tanstack/react-query";
import { Facebook, Music2, Search, Linkedin, Bot, Eye, Users2, MousePointerClick, Percent, DollarSign, Target } from "lucide-react";
import TarjetaResumen from "@/components/TarjetaResumen";
import { Card, CardContent } from "@/components/ui/card";
import { obtenerMetricasPublicidad } from "@/lib/api";

export const PLATAFORMAS = {
  meta: { nombre: "Meta Ads (Facebook / Instagram)", nombreCorto: "Meta", icono: Facebook, color: "#1877f2" },
  tiktok: { nombre: "TikTok Ads", nombreCorto: "TikTok", icono: Music2, color: "#000000" },
  google: { nombre: "Google Ads", nombreCorto: "Google", icono: Search, color: "#ea4335" },
  linkedin: { nombre: "LinkedIn Ads", nombreCorto: "LinkedIn", icono: Linkedin, color: "#0a66c2" },
  chatgpt: { nombre: "ChatGPT Ads", nombreCorto: "ChatGPT", icono: Bot, color: "#10a37f" },
};

function formatearMonto(monto) {
  if (monto === null || monto === undefined) return "—";
  return `S/ ${Number(monto).toLocaleString("es-PE")}`;
}

export function BloquePlataforma({ plataforma, configurada }) {
  const info = PLATAFORMAS[plataforma];
  const Icono = info.icono;

  const { data, isLoading } = useQuery({
    queryKey: ["publicidad-metricas", plataforma],
    queryFn: () => obtenerMetricasPublicidad(plataforma, 30),
    enabled: configurada,
  });
  const metricas = data?.metricas;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-muted-foreground">
          <Icono className="h-4 w-4" style={{ color: info.color }} /> KPIs de {info.nombre}
        </h3>
        {configurada && <span className="text-xs text-muted-foreground">Últimos 30 días</span>}
      </div>

      {!configurada ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Cargá el Access Token y el ID de cuenta en <strong>Conexiones</strong> para ver impresiones, alcance,
            clics, CTR, inversión y conversiones reales de {info.nombre}.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <TarjetaResumen icono={Eye} color={info.color} etiqueta="Impresiones" valor={isLoading ? "…" : metricas ? metricas.impresiones.toLocaleString("es-PE") : "—"} />
          <TarjetaResumen icono={Users2} color="#1baf7a" etiqueta="Alcance" valor={isLoading ? "…" : metricas ? metricas.alcance.toLocaleString("es-PE") : "—"} />
          <TarjetaResumen icono={MousePointerClick} color="#4a3aa7" etiqueta="Clics" valor={isLoading ? "…" : metricas ? metricas.clics.toLocaleString("es-PE") : "—"} />
          <TarjetaResumen icono={Percent} color="#eda100" etiqueta="CTR" valor={isLoading ? "…" : metricas ? `${metricas.ctr}%` : "—"} />
          <TarjetaResumen icono={DollarSign} color="#e34948" etiqueta="Inversión" valor={isLoading ? "…" : metricas ? formatearMonto(metricas.inversion) : "—"} invertirColor />
          <TarjetaResumen icono={Target} color="#1baf7a" etiqueta="Conversiones" valor={isLoading ? "…" : metricas ? metricas.conversiones.toLocaleString("es-PE") : "—"} />
        </div>
      )}
    </div>
  );
}

