const express = require("express");
const router = express.Router();
const usuarioController = require("../controllers/usuarioController");

router.post("/cadastrar", usuarioController.cadastrar);
router.post("/autenticar", usuarioController.autenticar);
router.get("/navegacao", usuarioController.navegacao);
router.get("/equipe", usuarioController.listarEquipe);
router.patch("/:id/perfil", usuarioController.alterarPerfil);

module.exports = router;
