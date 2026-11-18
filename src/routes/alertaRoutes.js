const express = require("express");
const router = express.Router();
const alertaController = require("../controllers/alertaController");

router.get("/servidores", alertaController.listarServidores);
router.post("/chamado", alertaController.acessarChamado);

module.exports = router;
