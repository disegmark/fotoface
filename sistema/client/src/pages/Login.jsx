import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { iniciarSesion } from "@/lib/api";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const mutacion = useMutation({
    mutationFn: () => iniciarSesion(email, password),
    onSuccess: () => navigate("/dashboard", { replace: true }),
    onError: (err) => setError(err.message || "No se pudo iniciar sesion."),
  });

  function manejarEnvio(evento) {
    evento.preventDefault();
    setError("");
    mutacion.mutate();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <img src="/logo.svg" alt="FotoFace" className="mb-2 h-14 w-14 rounded-full" />
          <CardTitle>FotoFace</CardTitle>
          <CardDescription>Iniciá sesión para acceder al panel de administración.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={manejarEnvio}>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" variant="gradient" disabled={mutacion.isPending}>
              {mutacion.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Ingresando...
                </>
              ) : (
                "Ingresar"
              )}
            </Button>

            <Link to="/recuperar" className="text-center text-sm text-muted-foreground hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
