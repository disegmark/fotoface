import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { obtenerSesionActual } from "@/lib/api";

export default function RutaProtegida({ children }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["sesion"],
    queryFn: obtenerSesionActual,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data?.usuario) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
