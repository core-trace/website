const dashboardPerfilModel = require("../models/dashboardPerfilModel");
const servidorModel = require("../models/servidorModel");
const dashboardPerfilService = require("../services/dashboardPerfilService");

async function obterDashboard(req, res) {
    const empresa = Number(req.query.empresa);
    const usuario = Number(req.query.usuario);
    const minutos = Number(req.query.minutos || "0");
    if (typeof req.query.empresa !== "string" || typeof req.query.usuario !== "string" ||
        !Number.isSafeInteger(empresa) || empresa <= 0 || !Number.isSafeInteger(usuario) || usuario <= 0 ||
        ![0, 30, 60, 420, 1440].includes(minutos)) {
        return res.status(400).json({ mensagem: "Informe empresa, usuário e período válidos." });
    }
    res.set("Cache-Control", "no-store");
    try {
        // O banco informa os cadastros e quais perfis o usuário pode consultar.
        const cadastros = await dashboardPerfilModel.buscarDados(empresa, usuario);
        const servidores = await servidorModel.listarServidoresPorEmpresa(empresa, usuario);
        // O service lê a Gold e compara as medições com os limites do banco.
        const dados = await dashboardPerfilService.montarDashboard(cadastros.perfis, servidores, minutos);
        return res.json(dados);
    } catch (erro) {
        console.error("Erro na DashboardPerfil:", erro.message);
        return res.status(500).json({ mensagem: "Não foi possível carregar os dados da dashboard." });
    }
}

module.exports = { obterDashboard };
