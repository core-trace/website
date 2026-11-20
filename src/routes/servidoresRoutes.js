const express = require('express');
const router = express.Router();

const servidoresController = require("../controllers/servidoresController");

router.get("/", servidoresController.listarServidores);

module.exports = router;