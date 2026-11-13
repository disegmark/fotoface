import { useMemo, useState } from "react";

const SERIES = [
  { clave: "usuario", etiqueta: "Clientes", color: "#1c5cab" },
  { clave: "asistente", etiqueta: "Lumi (IA)", color: "#4fb3e8" },
  { clave: "humano", etiqueta: "Equipo humano", color: "#1baf7a" },
];

const ANCHO = 700;
const ALTO = 240;
const MARGEN = { arriba: 12, abajo: 26, izquierda: 30, derecha: 12 };

function calcularEscalaMaxima(valorMaximo) {
  if (valorMaximo <= 0) return 5;
  const potencia = Math.pow(10, Math.floor(Math.log10(valorMaximo)));
  const pasos = [1, 2, 5, 10];
  for (const paso of pasos) {
    if (valorMaximo <= paso * potencia) return paso * potencia;
  }
  return 10 * potencia;
}

function formatearFechaCorta(fechaISO) {
  const [, mes, dia] = fechaISO.split("-");
  return `${dia}/${mes}`;
}

export default function GraficoTendencia({ datos = [] }) {
  const [indiceHover, setIndiceHover] = useState(null);

  const { anchoUtil, altoUtil, escalaMaxima, puntosPorSerie } = useMemo(() => {
    const anchoUtil = ANCHO - MARGEN.izquierda - MARGEN.derecha;
    const altoUtil = ALTO - MARGEN.arriba - MARGEN.abajo;
    const valorMaximo = Math.max(1, ...datos.flatMap((d) => SERIES.map((s) => d[s.clave] || 0)));
    const escalaMaxima = calcularEscalaMaxima(valorMaximo);

    const x = (indice) => (datos.length > 1 ? (indice / (datos.length - 1)) * anchoUtil : anchoUtil / 2);
    const y = (valor) => altoUtil - (valor / escalaMaxima) * altoUtil;

    const puntosPorSerie = SERIES.map((serie) => ({
      ...serie,
      puntos: datos.map((d, i) => ({ x: x(i), y: y(d[serie.clave] || 0), valor: d[serie.clave] || 0 })),
    }));

    return { anchoUtil, altoUtil, escalaMaxima, puntosPorSerie };
  }, [datos]);

  const pasosGrilla = 4;
  const lineasGrilla = Array.from({ length: pasosGrilla + 1 }, (_, i) => (escalaMaxima / pasosGrilla) * i);

  function manejarMovimiento(evento) {
    const svg = evento.currentTarget;
    const rect = svg.getBoundingClientRect();
    const xRelativo = ((evento.clientX - rect.left) / rect.width) * ANCHO - MARGEN.izquierda;
    const proporcion = Math.min(Math.max(xRelativo / anchoUtil, 0), 1);
    const indice = Math.round(proporcion * (datos.length - 1));
    setIndiceHover(Math.min(Math.max(indice, 0), datos.length - 1));
  }

  const diaHover = indiceHover !== null ? datos[indiceHover] : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-4">
        {SERIES.map((serie) => (
          <span key={serie.clave} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: serie.color }} />
            {serie.etiqueta}
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="w-full"
        onMouseMove={manejarMovimiento}
        onMouseLeave={() => setIndiceHover(null)}
      >
        <g transform={`translate(${MARGEN.izquierda}, ${MARGEN.arriba})`}>
          {lineasGrilla.map((valor) => (
            <g key={valor}>
              <line
                x1={0}
                x2={anchoUtil}
                y1={altoUtil - (valor / escalaMaxima) * altoUtil}
                y2={altoUtil - (valor / escalaMaxima) * altoUtil}
                stroke="#e1e0d9"
                strokeWidth={1}
              />
              <text
                x={-8}
                y={altoUtil - (valor / escalaMaxima) * altoUtil}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {Math.round(valor)}
              </text>
            </g>
          ))}

          {datos.map(
            (d, i) =>
              i % 3 === 0 && (
                <text
                  key={d.fecha}
                  x={puntosPorSerie[0]?.puntos[i]?.x ?? 0}
                  y={altoUtil + 16}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {formatearFechaCorta(d.fecha)}
                </text>
              )
          )}

          {puntosPorSerie.map((serie) => (
            <polyline
              key={serie.clave}
              points={serie.puntos.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={serie.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {indiceHover !== null && (
            <line
              x1={puntosPorSerie[0]?.puntos[indiceHover]?.x}
              x2={puntosPorSerie[0]?.puntos[indiceHover]?.x}
              y1={0}
              y2={altoUtil}
              stroke="#c3c2b7"
              strokeWidth={1}
            />
          )}

          {puntosPorSerie.map(
            (serie) =>
              indiceHover !== null && (
                <circle
                  key={serie.clave}
                  cx={serie.puntos[indiceHover].x}
                  cy={serie.puntos[indiceHover].y}
                  r={4}
                  fill={serie.color}
                  stroke="#fcfcfb"
                  strokeWidth={2}
                />
              )
          )}
        </g>
      </svg>

      {diaHover && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg bg-muted/40 px-3 py-2 text-xs">
          <span className="font-semibold text-foreground">{formatearFechaCorta(diaHover.fecha)}</span>
          {SERIES.map((serie) => (
            <span key={serie.clave} className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: serie.color }} />
              {serie.etiqueta}: <span className="font-medium text-foreground">{diaHover[serie.clave] || 0}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
