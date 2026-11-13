import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, MessageCircle, Mail, Phone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { restablecerPassword, solicitarCodigoPorEmail } from "@/lib/api";

const CANALES = [
  { id: "whatsapp", etiqueta: "Por WhatsApp", icono: Phone },
  { id: "email", etiqueta: "Por Email", icono: Mail },
];

export default function RecuperarPassword() {
  const navigate = useNavigate();
  const [canal, setCanal] = useState("whatsapp");
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [nuevaPassword, setNuevaPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [error, setError] = useState("");

  const mutacionSolicitarEmail = useMutation({
    mutationFn: () => solicitarCodigoPorEmail(email),
    onSuccess: (datos) => toast.success(datos.mensaje || "Código enviado."),
    onError: (err) => toast.error(err.message || "No se pudo enviar el código."),
  });

  const mutacionRestablecer = useMutation({
    mutationFn: () => restablecerPassword({ email, codigo, nueva_password: nuevaPassword }),
    onSuccess: () => {
      toast.success("Contraseña actualizada. Ya podés iniciar sesión.");
      navigate("/login", { replace: true });
    },
    onError: (err) => setError(err.message || "No se pudo restablecer la contraseña."),
  });

  function manejarEnvio(evento) {
    evento.preventDefault();
    setError("");

    if (nuevaPassword !== confirmarPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    mutacionRestablecer.mutate();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-8">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 rounded-xl bg-white px-5 py-4">
            <img src="/logo-fotoface.png" alt="FotoFace, tu foto estudio personal" className="w-48" />
          </div>
          <CardTitle>Recuperar contraseña</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex gap-2 rounded-lg bg-muted p-1">
            {CANALES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCanal(c.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors ${
                  canal === c.id ? "bg-white shadow-sm" : "text-muted-foreground"
                }`}
              >
                <c.icono className="h-3.5 w-3.5" /> {c.etiqueta}
              </button>
            ))}
          </div>

          {canal === "whatsapp" ? (
            <CardDescription>
              Escribí la palabra <b>recuperar</b> desde tu WhatsApp registrado al número de la agencia (el mismo
              donde Lumi responde a los clientes). Te llega un código de 6 dígitos válido por 10 minutos.
            </CardDescription>
          ) : (
            <CardDescription>
              Ingresá tu email abajo y hacé clic en "Enviar código". Si tenés una cuenta, te llega un código de 6
              dígitos válido por 10 minutos.
            </CardDescription>
          )}

          <form className="flex flex-col gap-4" onSubmit={manejarEnvio}>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <div className="flex gap-2">
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                {canal === "email" && (
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    disabled={!email || mutacionSolicitarEmail.isPending}
                    onClick={() => mutacionSolicitarEmail.mutate()}
                  >
                    {mutacionSolicitarEmail.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar código"}
                  </Button>
                )}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="codigo">Código recibido</Label>
              <Input
                id="codigo"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nueva_password">Nueva contraseña</Label>
              <Input
                id="nueva_password"
                type="password"
                value={nuevaPassword}
                onChange={(e) => setNuevaPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirmar_password">Confirmar contraseña</Label>
              <Input
                id="confirmar_password"
                type="password"
                value={confirmarPassword}
                onChange={(e) => setConfirmarPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" variant="gradient" disabled={mutacionRestablecer.isPending}>
              {mutacionRestablecer.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Actualizando...
                </>
              ) : (
                "Restablecer contraseña"
              )}
            </Button>

            <Link
              to="/login"
              className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:underline"
            >
              <MessageCircle className="h-3.5 w-3.5" /> Volver a iniciar sesión
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
