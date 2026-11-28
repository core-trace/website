const alertaService = require("../services/alertaService");

async function listarServidores(req, res) {
    const idEmpresa = Number(req.query.idEmpresa);
    const idUsuario = Number(req.query.idUsuario);

    if (!Number.isInteger(idEmpresa) || idEmpresa <= 0 || !Number.isInteger(idUsuario) || idUsuario <= 0) {
        return res.status(400).json({ erro: "idEmpresa e idUsuario são obrigatórios." });
    }

    const fonte = req.query.fonte === "local" ? "local" : "s3";

    try {
        const dados = await alertaService.obterAlertasServidores(idEmpresa, idUsuario, fonte);
        res.set("X-Alertas-Fonte", fonte);
        return res.status(200).json(dados);
    } catch (erro) {
        console.error("Erro ao carregar alertas dos servidores:", erro);
        return res.status(500).json({ erro: "Falha ao carregar alertas dos servidores." });
    }
}

async function acessarChamado(req, res) {
    const { mac, nomeServidor, perfil, metricaPrincipal, nivel } = req.body || {};

    if (!mac || !nomeServidor) {
        return res.status(400).json({ erro: "Dados do servidor são obrigatórios para acessar o chamado." });
    }

    try {
        const chamado = await alertaService.abrirOuObterChamadoJira({
            mac,
            nomeServidor,
            perfil,
            metricaPrincipal,
            nivel
        });
        return res.status(200).json(chamado);
    } catch (erro) {
        console.error("Erro ao acessar/abrir chamado no Jira:", erro);
        return res.status(500).json({ erro: erro.message || "Falha ao integrar com o Jira." });
    }
}

module.exports = {
    listarServidores,
    acessarChamado
};
