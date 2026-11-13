const express = require("express");
const pedidos = require("../services/pedidos");

const router = express.Router();

router.get("/", (req, res) => {
  try {
    res.json({ estados: pedidos.ESTADOS, pedidos: pedidos.listar() });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error obteniendo pedidos:`, error);
    res.status(500).json({ error: "No se pudieron obtener los pedidos." });
  }
});

// Alta manual desde el dashboard (pedido tomado por telefono o en tienda).
router.post("/", (req, res) => {
  const resultado = pedidos.registrar(req.body || {}, "equipo");
  if (!resultado.exito) return res.status(400).json({ error: resultado.mensaje });
  res.status(201).json(pedidos.obtener(resultado.id_pedido));
});

router.patch("/:id", (req, res) => {
  try {
    const actualizado = pedidos.actualizar(Number(req.params.id), req.body || {});
    if (!actualizado) return res.status(404).json({ error: "No se encontro el pedido." });
    res.json(actualizado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/:id/reparto", async (req, res) => {
  try {
    const pedido = await pedidos.enviarAReparto(Number(req.params.id));
    if (!pedido) return res.status(404).json({ error: "No se encontro el pedido." });
    res.json(pedido);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error enviando pedido a Repartos:`, error.message);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
