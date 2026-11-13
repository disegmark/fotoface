import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutGrid,
  Megaphone,
  MousePointerClick,
  Users2,
  DollarSign,
  Star,
  ShoppingBag,
  Calculator,
  TrendingUp,
  Heart,
} from "lucide-react";
import TarjetaResumen from "@/components/TarjetaResumen";
import TarjetasAtraccion from "@/components/TarjetasAtraccion";
import { PLATAFORMAS, BloquePlataforma } from "@/components/TarjetasPublicidad";
import { obtenerCampanas, obtenerClavesPublicidad } from "@/lib/api";

function formatearMonto(monto) {
  if (monto === null || monto === undefined) return "—";
  return `S/ ${Number(monto).toLocaleString("es-PE")}`;
}

function PestanaGeneral({ resumen, cargando }) {
  return (
    <div className="flex flex-col gap-5">
      <TarjetasAtraccion />

      {!cargando && resumen && (
        <>
          <div className="flex flex-col gap-3">
            <h3 className="font-display text-sm font-semibold text-muted-foreground">
              KPIs de Marketing — Campañas y Conversión
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <TarjetaResumen icono={Megaphone} color="#2a78d6" etiqueta="Campañas activas" valor={resumen.campanas_activas} />
              <TarjetaResumen icono={MousePointerClick} color="#4a3aa7" etiqueta="Clics totales" valor={resumen.clics_totales.toLocaleString("es-PE")} />
              <TarjetaResumen icono={Users2} color="#1baf7a" etiqueta="Leads generados" valor={resumen.leads_generados.toLocaleString("es-PE")} />
              <TarjetaResumen icono={DollarSign} color="#e34948" etiqueta="Inversión total" valor={formatearMonto(resumen.inversion_total)} invertirColor />
              <TarjetaResumen icono={Star} color="#eda100" etiqueta="Tasa de conversión" valor={`${resumen.tasa_conversion}%`} />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="font-display text-sm font-semibold text-muted-foreground">
              KPIs de Marketing — Decisión y Fidelización
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <TarjetaResumen icono={ShoppingBag} color="#1baf7a" etiqueta="Ventas desde campañas" valor={resumen.ventas_generadas} />
              <TarjetaResumen icono={Calculator} color="#2a78d6" etiqueta="CAC (costo por cliente)" valor={formatearMonto(resumen.cac_promedio)} invertirColor />
              <TarjetaResumen icono={TrendingUp} color="#1baf7a" etiqueta="ROI" valor={resumen.roi_total === null ? "—" : `${resumen.roi_total}%`} />
              <TarjetaResumen icono={Heart} color="#e87ba4" etiqueta="LTV promedio (clientes ganados)" valor={formatearMonto(resumen.ltv_promedio)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const PESTANAS = [
  { id: "general", etiqueta: "General", icono: LayoutGrid, color: null },
  ...Object.entries(PLATAFORMAS).map(([id, info]) => ({ id, etiqueta: info.nombreCorto, icono: info.icono, color: info.color })),
];

/**
 * KPIs de Marketing en pestañas: "General" (atracción, campañas/conversión,
 * decisión/fidelización) y una pestaña por cada plataforma de publicidad.
 * Se usa tanto en el Dashboard como en la pestaña Marketing.
 */
export default function TarjetasMarketing() {
  const [pestana, setPestana] = useState("general");
  const { data, isLoading } = useQuery({ queryKey: ["campanas"], queryFn: obtenerCampanas });
  const { data: estadosPublicidad } = useQuery({ queryKey: ["claves-publicidad"], queryFn: obtenerClavesPublicidad });
  const resumen = data?.resumen;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {PESTANAS.map((tab) => {
          const Icono = tab.icono;
          const activa = pestana === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setPestana(tab.id)}
              style={activa && tab.color ? { backgroundColor: tab.color } : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition-all ${
                activa
                  ? `scale-[1.04] text-white shadow-md ${!tab.color ? "bg-brand-gradient" : ""}`
                  : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              }`}
            >
              <Icono className="h-4 w-4" />
              {tab.etiqueta}
            </button>
          );
        })}
      </div>

      {pestana === "general" ? (
        <PestanaGeneral resumen={resumen} cargando={isLoading} />
      ) : (
        <BloquePlataforma
          plataforma={pestana}
          configurada={Boolean(estadosPublicidad?.find((e) => e.plataforma === pestana)?.configurada)}
        />
      )}
    </div>
  );
}
