import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, MailOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import SeccionTarjetas from "@/components/SeccionTarjetas";
import { obtenerSesionActual, cerrarSesion } from "@/lib/api";

// Proyecto Tarjetas digitales tal como se ve en tarjetas.fotoface.pro.
export default function PanelTarjetas() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: sesion } = useQuery({ queryKey: ["sesion"], queryFn: obtenerSesionActual });
  const salir = useMutation({
    mutationFn: cerrarSesion,
    onSuccess: () => {
      queryClient.clear();
      navigate("/login", { replace: true });
    },
  });

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-20 border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <img src="/logo-marca.png" alt="FotoFace" className="h-9 w-auto" />
            <span className="hidden h-6 w-px bg-border sm:block" />
            <span className="flex items-center gap-2 font-display text-base font-bold">
              <MailOpen className="h-5 w-5 text-brand-primary" /> Tarjetas digitales
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground md:inline">{sesion?.usuario?.email}</span>
            <Button variant="outline" size="sm" onClick={() => salir.mutate()} disabled={salir.isPending}>
              <LogOut className="h-4 w-4" /> Salir
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <SeccionTarjetas />
      </main>
    </div>
  );
}
