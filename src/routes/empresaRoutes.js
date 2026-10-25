const express = require("express");
const empresaController = require("../controllers/empresaController");
const router = express.Router();

router.post("/cadastrar", empresaController.cadastrar);
router.get("/metricas", empresaController.buscarMetricasPorToken);
router.get("/listarLimites/:idPerfil", empresaController.listarLimites);

module.exports = router;
