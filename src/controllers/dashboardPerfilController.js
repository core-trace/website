const dashboardPerfilModel = require("../models/dashboardPerfilModel");
const servidorModel = require("../models/servidorModel");
const dashboardPerfilService = require("../services/dashboardPerfilService");

async function obterDashboard(req, res) {
    const empresa = Number(req.query.empresa);
    const usuario = Number(req.query.usuario);
    if (typeof req.query.empresa !== "string" || typeof req.query.usuario !== "string" ||
        !Number.isSafeInteger(empresa) || empresa <= 0 || !Number.isSafeInteger(usuario) || usuario <= 0) {
        return res.status(400).json({ mensagem: "Informe empresa e usuário válidos." });
    }
    res.set("Cache-Control", "no-store");
    try {
        // O banco informa os cadastros e quais perfis o usuário pode consultar.
        const cadastros = await dashboardPerfilModel.buscarDados(empresa, usuario);
        // A primeira consulta da tela mostra os cadastros sem esperar pelo S3.
        const somenteCadastros = req.query.cadastros === "1";
        const servidores = somenteCadastros ? [] : await servidorModel.listarServidoresPorEmpresa(empresa, usuario);
        // O service lê a Gold e compara as medições com os limites do banco.
        const dados = await dashboardPerfilService.montarDashboard(cadastros.perfis, servidores, !somenteCadastros);
        return res.json(dados);
    } catch (erro) {
        console.error("Erro na DashboardPerfil:", erro.message);
        return res.status(500).json({ mensagem: "Não foi possível carregar os dados da dashboard." });
    }
}

module.exports = { obterDashboard };
