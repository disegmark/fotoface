import { useMemo, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import ListaTurnos from "@/components/ListaTurnos";
import { formatearFechaISO, aFecha } from "@/lib/fechas";

export default function CalendarioTurnos({ turnos = [], cargando }) {
  const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date());

  const fechasConTurnos = useMemo(() => {
    const fechas = turnos.map((turno) => aFecha(turno.fecha_turno)).filter(Boolean);
    return fechas;
  }, [turnos]);

  const turnosDelDia = useMemo(() => {
    const fechaISOSeleccionada = formatearFechaISO(fechaSeleccionada);
    return turnos.filter(
      (turno) => formatearFechaISO(aFecha(turno.fecha_turno) || new Date(0)) === fechaISOSeleccionada
    );
  }, [turnos, fechaSeleccionada]);

  return (
    <div className="grid gap-6 md:grid-cols-[auto_1fr]">
      <Card className="w-fit">
        <CardContent className="p-2">
          <Calendar
            mode="single"
            selected={fechaSeleccionada}
            onSelect={(fecha) => fecha && setFechaSeleccionada(fecha)}
            modifiers={{ conTurnos: fechasConTurnos }}
            modifiersClassNames={{
              conTurnos: "[&>button]:bg-sky-100 [&>button]:font-semibold",
            }}
          />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h3 className="font-display text-sm font-semibold text-muted-foreground">
          Turnos del {formatearFechaISO(fechaSeleccionada)}
        </h3>
        <ListaTurnos turnos={turnosDelDia} cargando={cargando} />
      </div>
    </div>
  );
}
