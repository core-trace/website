const processosService = require("../services/processosService");

function obterContexto(req, res) {
    return processosService.obterContexto(req.query)
        .then(function (dados) {
            return res.json(dados);
        })
        .catch(function (erro) {
            console.error("Erro ao obter contexto de processos:", erro.message);
            return res.status(500).json({ mensagem: "Não foi possível carregar o contexto de processos." });
        });
}

function obterKpis(req, res) {
    return processosService.obterKpis(req.query)
        .then(function (dados) {
            return res.json(dados);
        })
        .catch(function (erro) {
            console.error("Erro ao obter KPIs de processos:", erro.message);
            return res.status(500).json({ mensagem: "Não foi possível carregar os KPIs." });
        });
}

function obterSerieTemporal(req, res) {
    return processosService.obterSerieTemporal(req.query)
        .then(function (dados) {
            return res.json(dados);
        })
        .catch(function (erro) {
            console.error("Erro ao obter série temporal:", erro.message);
            return res.status(500).json({ mensagem: "Não foi possível carregar a série temporal." });
        });
}

function obterVariacao(req, res) {
    return processosService.obterVariacao(req.query)
        .then(function (dados) {
            return res.json(dados);
        })
        .catch(function (erro) {
            console.error("Erro ao obter variação de processos:", erro.message);
            return res.status(500).json({ mensagem: "Não foi possível carregar a variação de processos." });
        });
}

function obterEventos(req, res) {
    return processosService.obterEventos(req.query)
        .then(function (dados) {
            return res.json(dados);
        })
        .catch(function (erro) {
            console.error("Erro ao obter eventos de processos:", erro.message);
            return res.status(500).json({ mensagem: "Não foi possível carregar os eventos." });
        });
}

function listarTodos(req, res) {
    return processosService.listarTodos(req.query)
        .then(function (dados) {
            return res.json(dados);
        })
        .catch(function (erro) {
            console.error("Erro ao listar processos:", erro.message);
            return res.status(500).json({ mensagem: "Não foi possível carregar a lista de processos." });
        });
}

function obterRecorrencia(req, res) {
    return processosService.obterRecorrencia(req.query)
        .then(function (dados) {
            return res.json(dados);
        })
        .catch(function (erro) {
            console.error("Erro ao obter recorrência:", erro.message);
            return res.status(500).json({ mensagem: "Não foi possível carregar a recorrência." });
        });
}

function listarServidores(req, res) {
    return processosService.listarServidores(req.query)
        .then(function (dados) {
            return res.json(dados);
        })
        .catch(function (erro) {
            console.error("Erro ao listar servidores:", erro.message);
            return res.status(500).json({ mensagem: "Não foi possível carregar os servidores." });
        });
}

module.exports = {
    obterContexto,
    obterKpis,
    obterSerieTemporal,
    obterVariacao,
    obterEventos,
    listarTodos,
    obterRecorrencia,
    listarServidores
};