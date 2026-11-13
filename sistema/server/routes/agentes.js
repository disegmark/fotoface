const express = require("express");
const mcpManager = require("../services/mcpManager");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    mcp_habilitado: mcpManager.estaHabilitado(),
    agentes_conectados: mcpManager.listarAgentesConectados(),
  });
});

router.get("/config", (req, res) => {
  res.json({
    mcp_habilitado: mcpManager.estaHabilitado(),
    servidores: mcpManager.listarConfiguracion(),
  });
});

router.post("/config", async (req, res) => {
  try {
    await mcpManager.agregarServidor(req.body);
    res.status(201).json({ exito: true, servidores: mcpManager.listarConfiguracion() });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error agregando agente MCP:`, error);
    res.status(400).json({ error: error.message });
  }
});

router.delete("/config/:nombre", async (req, res) => {
  try {
    await mcpManager.eliminarServidor(req.params.nombre);
    res.json({ exito: true, servidores: mcpManager.listarConfiguracion() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.patch("/config/:nombre", async (req, res) => {
  const { habilitado } = req.body;
  if (typeof habilitado !== "boolean") {
    return res.status(400).json({ error: 'El campo "habilitado" debe ser true o false.' });
  }
  try {
    await mcpManager.cambiarHabilitado(req.params.nombre, habilitado);
    res.json({ exito: true, servidores: mcpManager.listarConfiguracion() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
