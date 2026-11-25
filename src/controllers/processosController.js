const processosService = require("../services/processosService");
const servidorModel = require("../models/servidorModel");

async function listarServidores(req, res) {
    try {
        const idEmpresa = Number(req.query.empresa);
        const idUsuario = Number(req.query.usuario);

        if (!Number.isSafeInteger(idEmpresa) || idEmpresa <= 0
            || !Number.isSafeInteger(idUsuario) || idUsuario <= 0) {
            return res.status(400).json({ erro: "Informe empresa e usuário válidos." });
        }

        const servidores = await servidorModel.listarServidoresPorEmpresa(idEmpresa, idUsuario);

        return res.json({
            servidores: servidores.map(s => ({
                mac: s.endereco_mac,
                nome: s.nome || s.endereco_mac,
                componentes: s.componentes || []
            }))
        });
    } catch (erro) {
        console.error("Erro ao listar servidores:", erro);
        return res.status(500).json({ erro: "Não foi possível listar servidores." });
    }
}

async function validarAcessoAoServidor(mac, idEmpresa, idUsuario) {
    if (!Number.isSafeInteger(idEmpresa) || idEmpresa <= 0
        || !Number.isSafeInteger(idUsuario) || idUsuario <= 0) {
        return false;
    }
    const servidores = await servidorModel.listarServidoresPorEmpresa(idEmpresa, idUsuario);
    return servidores.some(s => String(s.endereco_mac || "").trim().toUpperCase()
        === String(mac || "").trim().toUpperCase());
}

async function buscarResumo(req, res) {
    try {
        const { mac, data } = req.query;
        const idEmpresa = Number(req.query.empresa);
        const idUsuario = Number(req.query.usuario);

        if (!mac || !data) {
            return res.status(400).json({ erro: "Parâmetros 'mac' e 'data' são obrigatórios." });
        }

        const temAcesso = await validarAcessoAoServidor(mac, idEmpresa, idUsuario);
        if (!temAcesso) {
            return res.status(403).json({ erro: "Usuário não tem acesso a este servidor." });
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
        const idEmpresa = Number(req.query.empresa);
        const idUsuario = Number(req.query.usuario);

        if (!mac || !data) {
            return res.status(400).json({ erro: "Parâmetros 'mac' e 'data' são obrigatórios." });
        }

        const temAcesso = await validarAcessoAoServidor(mac, idEmpresa, idUsuario);
        if (!temAcesso) {
            return res.status(403).json({ erro: "Usuário não tem acesso a este servidor." });
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

        const temAcesso = await validarAcessoAoServidor(mac, idEmpresa, idUsuario);
        if (!temAcesso) {
            return res.status(403).json({ erro: "Usuário não tem acesso a este servidor." });
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
