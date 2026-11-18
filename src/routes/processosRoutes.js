const express = require("express");
const router = express.Router();
const processosController = require("../controllers/processosController");

router.get("/contexto", processosController.obterContexto);
router.get("/kpis", processosController.obterKpis);
router.get("/serie-temporal", processosController.obterSerieTemporal);
router.get("/variacao", processosController.obterVariacao);
router.get("/eventos", processosController.obterEventos);
router.get("/todos", processosController.listarTodos);
router.get("/recorrencia", processosController.obterRecorrencia);

module.exports = router;