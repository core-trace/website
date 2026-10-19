const express = require("express");
const router = express.Router();
const servidorController = require("../controllers/servidorController");

router.post("/ativarAgente", servidorController.ativarAgente);
router.get("/lista", servidorController.listarServidores);
router.post("/perfis", servidorController.criarPerfil);
router.get("/perfis", servidorController.listarPerfis);
router.get("/perfis/:id", servidorController.obterPerfil);
router.put("/perfis/:id", servidorController.atualizarPerfil);
router.get("/membros-disponiveis", servidorController.listarMembrosDisponiveis);
router.get("/metricas", servidorController.listarMetricas);

module.exports = router;
