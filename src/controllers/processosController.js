const processosService = require("../services/processosService");

async function listarServidores(req, res) {
    try {
        const processosModel = require("../models/processosModel");
        const servidores = await processosModel.listarServidores();
        return res.json({ servidores });
    } catch (erro) {
        console.error("Erro ao listar servidores:", erro);
        return res.status(500).json({ erro: "Não foi possível listar servidores." });
    }
}

async function buscarResumo(req, res) {
    try {
        const { mac, data } = req.query;

        if (!mac || !data) {
            return res.status(400).json({ erro: "Parâmetros 'mac' e 'data' são obrigatórios." });
        }

        const resumo = await require("../models/processosModel").buscarResumoDiario(mac, data);
        return res.json(resumo);
    } catch (erro) {
        console.error("Erro ao buscar resumo diário:", erro);
        return res.status(500).json({ erro: "Não foi possível buscar o resumo diário." });
    }
}

async function buscarDadosProcessos(req, res) {
    try {
        const { mac, data } = req.query;

        if (!mac || !data) {
            return res.status(400).json({ erro: "Parâmetros 'mac' e 'data' são obrigatórios." });
        }

        const amostras = await processosService.carregarAmostras(mac, data);
        return res.json({
            mac,
            data,
            processos: amostras,
            total: amostras.length
        });
    } catch (erro) {
        console.error("Erro ao buscar dados de processos:", erro);
        return res.status(500).json({ erro: "Não foi possível buscar os dados de processos." });
    }
}

async function obterDashboard(req, res) {
    try {
        const { mac, data, idEmpresa, idUsuario } = req.query;

        if (!mac || !data) {
            return res.status(400).json({ erro: "Parâmetros 'mac' e 'data' são obrigatórios." });
        }

        const filtros = { mac, data };
        if (idEmpresa) filtros.idEmpresa = Number(idEmpresa);
        if (idUsuario) filtros.idUsuario = Number(idUsuario);

        const dashboard = await processosService.obterDashboard(filtros);
        return res.json(dashboard);
    } catch (erro) {
        console.error("Erro ao obter dashboard de processos:", erro.message);
        return res.status(500).json({ erro: "Não foi possível carregar o dashboard de processos." });
    }
}

module.exports = {
    listarServidores,
    buscarResumo,
    buscarDadosProcessos,
    obterDashboard
};
