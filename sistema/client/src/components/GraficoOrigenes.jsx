// Paleta categorica validada (orden fijo, nunca por rango/conteo) — la
// identidad de cada origen conserva su color aunque cambien los numeros.
const PALETA_CATEGORICA = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];

const ORDEN_CONOCIDO = ["Directo", "TikTok", "LinkedIn", "Instagram", "Facebook", "Google Ads", "Sitio web"];

function colorPara(origen, indiceFallback) {
  const indiceConocido = ORDEN_CONOCIDO.indexOf(origen);
  const indice = indiceConocido >= 0 ? indiceConocido : ORDEN_CONOCIDO.length + indiceFallback;
  return PALETA_CATEGORICA[indice % PALETA_CATEGORICA.length];
}

export default function GraficoOrigenes({ datos = [] }) {
  const maximo = Math.max(1, ...datos.map((d) => d.valor));
  let contadorDesconocidos = 0;

  return (
    <div className="flex flex-col gap-3">
      {datos.map((item) => {
        const esConocido = ORDEN_CONOCIDO.includes(item.origen);
        const color = colorPara(item.origen, esConocido ? 0 : contadorDesconocidos++);
        const ancho = Math.max((item.valor / maximo) * 100, item.valor > 0 ? 3 : 0);

        return (
          <div key={item.origen} className="flex items-center gap-3">
            <span className="flex w-32 shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              {item.origen}
            </span>
            <div className="h-4 flex-1 rounded-sm bg-muted/50">
              <div className="h-4" style={{ width: `${ancho}%`, backgroundColor: color, borderRadius: "0 4px 4px 0" }} />
            </div>
            <span className="w-10 shrink-0 text-right text-sm font-semibold [font-variant-numeric:tabular-nums]">
              {item.valor.toLocaleString("es-PE")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
