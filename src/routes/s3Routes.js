
const express = require('express');
const router = express.Router();

const s3Controller = require("../controllers/s3Controller");

router.get("/arquivos", s3Controller.listarArquivos);
router.get("/conteudo", s3Controller.buscarConteudo);

module.exports = router;
