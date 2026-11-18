const dashboardPerfilModel = require("../models/dashboardPerfilModel");

async function obterDashboard(req, res) {
    // recebe empresa e usuário
    const empresa = Number(req.query.empresa);
    const usuario = Number(req.query.usuario);

    // Verifica se empresa e usuario foram informados, e valida
    if (typeof req.query.empresa !== "string" || typeof req.query.usuario !== "string" ||
        !Number.isSafeInteger(empresa) || empresa <= 0 ||
        !Number.isSafeInteger(usuario) || usuario <= 0) {
        return res.status(400).json({ mensagem: "Informe empresa e usuário válidos." });
    }

    try {
        // busca no banco os perfis cadastrados e seus componentes e limites
        const dados = await dashboardPerfilModel.buscarDados(empresa, usuario);
        const perfis = [];

        // organiza os dados de cada perfil
        for (const perfil of dados.perfis) {
            perfis.push({
                id: perfil.id_perfil_servidor,
                nome: perfil.nome,
                totalServidores: Number(perfil.total_servidores),
                limites: perfil.componentes,

                // aq são os que irao depender de csv
                inativos: null,
                criticos: null,
                percentualCriticos: null
            });
        }

        // não deixa ter resposta armazenada em cache.
        res.set("Cache-Control", "no-store");

        // Retorna os cadastros e os indicadores para a dashboard.
        return res.json({
            coletasDisponiveis: false,
            kpis: {
                perfisConfigurados: perfis.length,
                perfisAtivos: null,
                servidoresInativos: null,
                perfisComMaisCriticos: null
            },
            perfis: perfis,
            rankingCriticos: [],
            historicoStatus: null
        });

    } catch (erro) {

        console.error("Erro na DashboardPerfil:", erro.message);
        return res.status(500).json({ mensagem: "Não foi possível carregar os dados da dashboard no banco." });
    }
}

module.exports = { obterDashboard };