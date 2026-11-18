const resumoGeralService = require("../services/resumoGeralService");

// So devolve o que ja esta em cache (ver resumoGeralService.iniciar) - nunca busca no
// S3 durante a requisicao, pra dashboard nao ficar lenta esperando a rede.
function obterResumo(req, res) {
    return res.json(resumoGeralService.obterResumoGeral());
}

module.exports = { obterResumo };
