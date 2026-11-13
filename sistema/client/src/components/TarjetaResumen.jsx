import { Card, CardContent } from "@/components/ui/card";

/** Tarjeta de estadistica con icono, valor y variacion opcional vs. el mes anterior. */
export default function TarjetaResumen({
  icono: Icono,
  color,
  etiqueta,
  valor,
  variacion,
  invertirColor = false,
  textoVariacion = "vs. mes anterior",
}) {
  const esPositivo = variacion > 0;
  const esBueno = invertirColor ? !esPositivo : esPositivo;

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${color}1a`, color }}
          >
            <Icono className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{etiqueta}</p>
            <p className="font-display text-xl font-bold">{valor}</p>
          </div>
        </div>
        {variacion !== undefined && variacion !== null && variacion !== 0 && (
          <span className={`text-xs font-medium ${esBueno ? "text-emerald-600" : "text-red-600"}`}>
            {esPositivo ? "↑" : "↓"} {Math.abs(variacion)}% <span className="text-muted-foreground">{textoVariacion}</span>
          </span>
        )}
      </CardContent>
    </Card>
  );
}
