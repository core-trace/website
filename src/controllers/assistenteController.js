const assistenteService = require("../services/assistenteService");

async function responder(req, res) {
    try {
        const resposta = await assistenteService.responderPergunta(req.body.pergunta);
        return res.json({ resposta });
    } catch (erro) {
        console.error("Erro no assistente:", erro.message);
        return res.status(500).json({ erro: "Não foi possível responder agora." });
    }
}

module.exports = { responder };
