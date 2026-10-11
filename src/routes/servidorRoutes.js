const express = require("express");
const router = express.Router();
const servidorController = require("../controllers/servidorController");

router.post("/ativarAgente", servidorController.ativarAgente);
router.post("/perfis", servidorController.criarPerfil);
router.get("/perfis", servidorController.listarPerfis);
router.get("/membros-disponiveis", servidorController.listarMembrosDisponiveis);
router.get("/metricas", servidorController.listarMetricas);

module.exports = router;
