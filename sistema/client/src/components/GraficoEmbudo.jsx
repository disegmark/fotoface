// Rampa secuencial ordinal (azul, claro -> oscuro) para las etapas del embudo.
// Pasos 250/350/450/550 del validador de paleta: el mas claro ya limpia 2:1
// de contraste sobre la superficie clara.
const COLORES_ETAPA = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab"];

export default function GraficoEmbudo({ datos = [] }) {
  const maximo = datos[0]?.valor || 1;

  return (
    <div className="flex flex-col gap-4">
      {datos.map((item, indice) => {
        const porcentaje = maximo > 0 ? Math.round((item.valor / maximo) * 100) : 0;
        const anchoBarra =
          maximo > 0 ? Math.min(Math.max((item.valor / maximo) * 100, item.valor > 0 ? 3 : 0), 100) : 0;
        const color = COLORES_ETAPA[indice] || COLORES_ETAPA[COLORES_ETAPA.length - 1];

        return (
          <div key={item.etapa} className="flex items-center gap-3">
            <span className="w-36 shrink-0 text-sm text-muted-foreground">{item.etapa}</span>
            <div className="h-4 flex-1 rounded-sm bg-muted/50">
              <div
                className="h-4"
                style={{ width: `${anchoBarra}%`, backgroundColor: color, borderRadius: "0 4px 4px 0" }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-sm font-semibold [font-variant-numeric:tabular-nums]">
              {item.valor.toLocaleString("es-PE")}
            </span>
            <span className="w-12 shrink-0 text-right text-xs text-muted-foreground [font-variant-numeric:tabular-nums]">
              {indice === 0 ? "100%" : `${porcentaje}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
