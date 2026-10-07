const express = require("express")
const router = express.Router()
const contatoController = require("../controllers/contatoController")

router.post("/", contatoController.enviarContato)

module.exports = router
