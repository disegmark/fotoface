import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import Sidebar from "@/components/Sidebar";
import SeccionDashboard from "@/components/SeccionDashboard";
import PanelConversaciones from "@/components/PanelConversaciones";
import TabTurnos from "@/components/TabTurnos";
import TabConfiguracion from "@/components/TabConfiguracion";
import TabUsuarios from "@/components/TabUsuarios";
import TabConexiones from "@/components/TabConexiones";
import TabConocimiento from "@/components/TabConocimiento";
import SeccionContacto from "@/components/SeccionContacto";
import SeccionVentas from "@/components/SeccionVentas";
import SeccionInscripciones from "@/components/SeccionInscripciones";
import SeccionPedidos from "@/components/SeccionPedidos";
import SeccionMarketing from "@/components/SeccionMarketing";
import SeccionOficina from "@/components/SeccionOficina";
import SeccionConApps from "@/components/SeccionConApps";
import ChatRapido from "@/components/ChatRapido";
import { resolverSeccion } from "@/lib/appsIntegradas";
import { obtenerSesionActual, cerrarSesion } from "@/lib/api";

const TITULOS_SECCION = {
  dashboard: "Dashboard",
  conversaciones: "Conversaciones",
  calendario: "Sesiones y citas",
  pedidos: "Pedidos e impresiones",
  inscripciones: "Talleres",
  contacto: "Contacto",
  ventas: "Ventas y Clientes Potenciales",
  marketing: "Marketing",
  oficina: "Oficina",
  conocimiento: "Conocimiento",
  conexiones: "Conexiones",
  usuarios: "Usuarios",
  configuracion: "Configuración",
};

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [seccionActiva, setSeccionActiva] = useState("dashboard");

  const { data: sesion } = useQuery({ queryKey: ["sesion"], queryFn: obtenerSesionActual });

  const mutacionLogout = useMutation({
    mutationFn: cerrarSesion,
    onSuccess: () => {
      queryClient.clear();
      navigate("/login", { replace: true });
    },
  });

  const { seccion: seccionBase, appId } = resolverSeccion(seccionActiva);

  function renderizarSeccion() {
    switch (seccionBase) {
      case "dashboard":
        return <SeccionDashboard />;
      case "conversaciones":
        return <PanelConversaciones />;
      case "calendario":
        return (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Sesiones de fotos, fotos para documentos y coberturas que agenda Lumi o el equipo. Se sincronizan con Google Calendar si está conectado.
            </p>
            <TabTurnos />
          </div>
        );
      case "pedidos":
        return (
          <SeccionConApps seccion="pedidos" appId={appId}>
            <SeccionPedidos />
          </SeccionConApps>
        );
      case "inscripciones":
        return <SeccionInscripciones />;
      case "contacto":
        return <SeccionContacto />;
      case "ventas":
        return <SeccionVentas />;
      case "marketing":
        return (
          <SeccionConApps seccion="marketing" appId={appId}>
            <SeccionMarketing />
          </SeccionConApps>
        );
      case "oficina":
        return (
          <SeccionConApps seccion="oficina" appId={appId}>
            <SeccionOficina />
          </SeccionConApps>
        );
      case "configuracion":
        return <TabConfiguracion />;
      case "usuarios":
        return <TabUsuarios />;
      case "conexiones":
        return <TabConexiones />;
      case "conocimiento":
        return <TabConocimiento />;
      default:
        return null;
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      <Sidebar seccionActiva={seccionActiva} onCambiarSeccion={setSeccionActiva} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-border bg-white">
          <div className="flex items-center justify-between px-6 py-4">
            <h1 className="font-display text-lg font-bold">{TITULOS_SECCION[seccionBase]}</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {sesion?.usuario?.email || "Panel de administracion"}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => mutacionLogout.mutate()}
                disabled={mutacionLogout.isPending}
              >
                <LogOut className="h-4 w-4" /> Salir
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto max-w-7xl">{renderizarSeccion()}</div>
        </main>
      </div>

      <ChatRapido />
    </div>
  );
}
