const express = require("express");
const auth = require("../services/auth");

const router = express.Router();

router.get("/", (req, res) => {
  try {
    res.json(auth.listarUsuarios());
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error listando usuarios:`, error);
    res.status(500).json({ error: "No se pudieron obtener los usuarios.", detalle: error.message });
  }
});

router.post("/", async (req, res) => {
  const { email, password, nombre, telefono } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email y contraseña son requeridos." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
  }

  try {
    const usuario = await auth.crearUsuario({ email, password, nombre, telefono });
    res.status(201).json(usuario);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.patch("/:id/telefono", (req, res) => {
  const id = Number(req.params.id);
  const { telefono } = req.body;

  try {
    const usuario = auth.actualizarTelefono(id, telefono || null);
    res.json(usuario);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);

  if (id === req.usuario.id) {
    return res.status(400).json({ error: "No puedes eliminar tu propia cuenta mientras estás conectado con ella." });
  }

  try {
    auth.eliminarUsuario(id);
    res.json({ exito: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
