import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, List } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import CalendarioTurnos from "@/components/CalendarioTurnos";
import ListaTurnos from "@/components/ListaTurnos";
import { obtenerTurnos } from "@/lib/api";

export default function TabTurnos() {
  const [vista, setVista] = useState("calendario");

  const {
    data: turnos = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["turnos"],
    queryFn: obtenerTurnos,
    refetchInterval: 5000,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Turnos</CardTitle>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={vista === "calendario" ? "default" : "outline"}
            onClick={() => setVista("calendario")}
          >
            <CalendarDays className="h-4 w-4" /> Calendario
          </Button>
          <Button
            size="sm"
            variant={vista === "lista" ? "default" : "outline"}
            onClick={() => setVista("lista")}
          >
            <List className="h-4 w-4" /> Lista
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isError && (
          <p className="mb-4 text-sm text-destructive">No se pudieron cargar los turnos.</p>
        )}
        {vista === "calendario" ? (
          <CalendarioTurnos turnos={turnos} cargando={isLoading} />
        ) : (
          <ListaTurnos turnos={turnos} cargando={isLoading} />
        )}
      </CardContent>
    </Card>
  );
}
