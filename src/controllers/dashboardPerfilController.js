const dashboardPerfilModel = require("../models/dashboardPerfilModel");
const servidorModel = require("../models/servidorModel");
const dashboardPerfilService = require("../services/dashboardPerfilService");

// Guarda a resposta completa por empresa e usuário durante 2 minutos.
//quanto tempo os dados ficam armazenados
const CACHE_TTL_MS = 2 * 60 * 1000; 
//armazena na memoria do comp
const cacheDashboardPerfil = new Map();

async function obterDashboard(req, res) {
    const empresa = Number(req.query.empresa);
    const usuario = Number(req.query.usuario);
    if (typeof req.query.empresa !== "string" || typeof req.query.usuario !== "string" ||
        !Number.isSafeInteger(empresa) || empresa <= 0 || !Number.isSafeInteger(usuario) || usuario <= 0) {
        return res.status(400).json({ mensagem: "Informe empresa e usuário válidos." });
    }
    res.set("Cache-Control", "no-store");

//busca primeiro os dados no banco e dps no s3
    const somenteCadastros = req.query.cadastros === "1";
    const chaveCache = `${empresa}:${usuario}`;
    //ve se ja há dados armazenados
    if (!somenteCadastros) {
        const emCache = cacheDashboardPerfil.get(chaveCache);
        if (emCache && Date.now() - emCache.quando < CACHE_TTL_MS) {
            return res.json(emCache.dados);
        }
    }

    try {
        // O banco informa os cadastros e quais perfis o usuário pode consultar.
        const cadastros = await dashboardPerfilModel.buscarDados(empresa, usuario);
        const servidores = somenteCadastros ? [] : await servidorModel.listarServidoresPorEmpresa(empresa, usuario);
        // O service lê a Gold e compara as medições com os limites do banco.
        const dados = await dashboardPerfilService.montarDashboard(cadastros.perfis, servidores, !somenteCadastros);
       //horario que os dados foram armazenados
        if (!somenteCadastros) cacheDashboardPerfil.set(chaveCache, { quando: Date.now(), dados });
        return res.json(dados);
    } catch (erro) {
        console.error("Erro na DashboardPerfil:", erro.message);
        return res.status(500).json({ mensagem: "Não foi possível carregar os dados da dashboard." });
    }
}

module.exports = { obterDashboard };
