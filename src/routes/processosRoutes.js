const express = require("express");
const router = express.Router();
const processosController = require("../controllers/processosController");

router.get("/servidores", processosController.listarServidores);
router.get("/resumo", processosController.buscarResumo);
router.get("/dados", processosController.buscarDadosProcessos);

module.exports = router;