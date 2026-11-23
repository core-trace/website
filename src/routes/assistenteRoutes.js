const express = require("express");
const router = express.Router();
const assistenteController = require("../controllers/assistenteController");

router.post("/responder", assistenteController.responder);

module.exports = router;
