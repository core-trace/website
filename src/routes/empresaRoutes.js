const express = require("express");
const empresaController = require("../controllers/empresaController");
const router = express.Router();

router.post("/cadastrar", empresaController.cadastrar);

module.exports = router;
