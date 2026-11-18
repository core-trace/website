const express = require("express");
const router = express.Router();
const geralController = require("../controllers/geralController");

router.get("/resumo", geralController.obterResumo);

module.exports = router;
