import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, UserPlus, Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatearCorto } from "@/lib/fechas";
import {
  obtenerUsuarios,
  crearUsuario,
  eliminarUsuario,
  obtenerSesionActual,
  actualizarTelefonoUsuario,
} from "@/lib/api";

const FORMULARIO_INICIAL = { nombre: "", email: "", password: "", telefono: "" };

function FilaUsuario({ usuario, esUsuarioActual, onEliminar, eliminandoDeshabilitado }) {
  const queryClient = useQueryClient();
  const [telefono, setTelefono] = useState(usuario.telefono || "");

  const mutacionTelefono = useMutation({
    mutationFn: () => actualizarTelefonoUsuario(usuario.id, telefono || null),
    onSuccess: () => {
      toast.success("Teléfono actualizado.");
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
    },
    onError: (error) => toast.error(error.message || "No se pudo actualizar el teléfono."),
  });

  const cambio = telefono !== (usuario.telefono || "");

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">{usuario.nombre || usuario.email}</p>
          <p className="text-xs text-muted-foreground">
            {usuario.email} · desde {formatearCorto(usuario.creado_en)}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          disabled={eliminandoDeshabilitado}
          title={esUsuarioActual ? "No puedes eliminar tu propia cuenta" : "Eliminar usuario"}
          onClick={() => onEliminar(usuario.id)}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Input
          className="h-8 text-xs"
          placeholder="Teléfono de WhatsApp (para recuperar contraseña)"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
        />
        {cambio && (
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8 shrink-0"
            disabled={mutacionTelefono.isPending}
            onClick={() => mutacionTelefono.mutate()}
          >
            <Save className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default function TabUsuarios() {
  const queryClient = useQueryClient();
  const [formulario, setFormulario] = useState(FORMULARIO_INICIAL);

  const { data: sesion } = useQuery({ queryKey: ["sesion"], queryFn: obtenerSesionActual });
  const { data: usuarios = [], isLoading } = useQuery({ queryKey: ["usuarios"], queryFn: obtenerUsuarios });

  const mutacionCrear = useMutation({
    mutationFn: crearUsuario,
    onSuccess: () => {
      toast.success("Usuario creado correctamente.");
      setFormulario(FORMULARIO_INICIAL);
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
    },
    onError: (error) => toast.error(error.message || "No se pudo crear el usuario."),
  });

  const mutacionEliminar = useMutation({
    mutationFn: eliminarUsuario,
    onSuccess: () => {
      toast.success("Usuario eliminado.");
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
    },
    onError: (error) => toast.error(error.message || "No se pudo eliminar el usuario."),
  });

  function manejarEnvio(evento) {
    evento.preventDefault();
    mutacionCrear.mutate(formulario);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Equipo con acceso al dashboard</CardTitle>
          <CardDescription>
            El teléfono de WhatsApp es necesario para poder recuperar la contraseña (escribiendo "recuperar" al
            número de la agencia).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Cargando...</p>}
          <div className="flex flex-col divide-y divide-border">
            {usuarios.map((usuario) => (
              <FilaUsuario
                key={usuario.id}
                usuario={usuario}
                esUsuarioActual={usuario.id === sesion?.usuario?.id}
                eliminandoDeshabilitado={usuario.id === sesion?.usuario?.id || mutacionEliminar.isPending}
                onEliminar={(id) => mutacionEliminar.mutate(id)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Crear nueva cuenta</CardTitle>
          <CardDescription>La persona va a poder iniciar sesión de inmediato con estos datos.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={manejarEnvio}>
            <div className="grid gap-2">
              <Label htmlFor="nombre">Nombre</Label>
              <Input
                id="nombre"
                value={formulario.nombre}
                onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nuevo-email">Email</Label>
              <Input
                id="nuevo-email"
                type="email"
                required
                value={formulario.email}
                onChange={(e) => setFormulario({ ...formulario, email: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nuevo-telefono">Teléfono de WhatsApp (opcional)</Label>
              <Input
                id="nuevo-telefono"
                placeholder="+51999888777"
                value={formulario.telefono}
                onChange={(e) => setFormulario({ ...formulario, telefono: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Necesario para poder recuperar la contraseña despues.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nueva-password">Contraseña</Label>
              <Input
                id="nueva-password"
                type="password"
                required
                minLength={8}
                value={formulario.password}
                onChange={(e) => setFormulario({ ...formulario, password: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
            </div>
            <Button type="submit" variant="gradient" disabled={mutacionCrear.isPending}>
              <UserPlus className="h-4 w-4" /> Crear cuenta
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
