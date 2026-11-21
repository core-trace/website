const dashboardPerfilModel = require("../models/dashboardPerfilModel");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const s3 = new S3Client({});

async function obterDashboard(req, res) {
    const empresa = Number(req.query.empresa);
    const usuario = Number(req.query.usuario);
    const minutos = String(req.query.minutos || "0");
    if (typeof req.query.empresa !== "string" || typeof req.query.usuario !== "string" ||
        !Number.isSafeInteger(empresa) || empresa <= 0 || !Number.isSafeInteger(usuario) || usuario <= 0 ||
        !["0", "30", "60", "420", "1440"].includes(minutos)) {
        return res.status(400).json({ mensagem: "Informe empresa, usuário e período válidos." });
    }
    res.set("Cache-Control", "no-store");
    try {
        // Confere no banco quais perfis este usuário pode consultar agora.
        const cadastros = await dashboardPerfilModel.buscarDados(empresa, usuario);
        try {
            if (!process.env.BUCKET_DADOS_GOLD) throw new Error("Configure BUCKET_DADOS_GOLD.");
            const chave = `client/perfis/empresa=${empresa}/usuario=${usuario}/dashboard.json`;
            const resposta = await s3.send(new GetObjectCommand({
                Bucket: process.env.BUCKET_DADOS_GOLD, Key: chave
            }));
            const dados = JSON.parse(await resposta.Body.transformToString());

            // Se os cadastros ou as permissões mudaram, esperamos a próxima execução da Gold.
            // Não filtramos indicadores prontos, pois isso alteraria suas contagens.
            const permitidos = cadastros.perfis.map(perfil => String(perfil.id_perfil_servidor));
            if (dados.schema_version !== 1 || dados.empresaId !== empresa || dados.usuarioId !== usuario ||
                !Array.isArray(dados.perfis) || dados.perfis.length !== permitidos.length ||
                !dados.perfis.every(perfil => permitidos.includes(String(perfil.id))) ||
                !dados.kpis || !Array.isArray(dados.rankingCriticos) ||
                (minutos !== "0" && !dados.historicoStatus?.[minutos])) {
                throw new Error("A Gold precisa atualizar os dados desta dashboard.");
            }
            const validade = Date.parse(dados.validoAte);
            if (!Number.isFinite(validade) || Date.now() > validade) {
                throw new Error("A Gold precisa atualizar os indicadores.");
            }
            // Agora usa os valores atuais já calculados pela Gold.
            // Os demais períodos usam os registros do histórico.
            const status = minutos === "0"
                ? { minutos: 0, referencia: dados.geradoEm, perfis: dados.perfis }
                : dados.historicoStatus[minutos];
            return res.json({
                ...dados,
                kpis: {
                    perfisConfigurados: dados.kpis.perfisConfigurados,
                    perfisAtivos: dados.kpis.perfisAtivos,
                    perfisComMaisCriticos: dados.kpis.perfisComMaisCriticos
                },
                historicoStatus: status
            });
        } catch (erro) {
            console.error("Gold da DashboardPerfil:", erro.name, erro.message);
            // Se a Gold estiver indisponível, os cadastros continuam aparecendo.
            // Não substituímos indicadores indisponíveis por zeros.
            const perfis = cadastros.perfis.map(perfil => ({
                id: perfil.id_perfil_servidor, nome: perfil.nome,
                totalServidores: Number(perfil.total_servidores), limites: perfil.componentes,
                ativos: null, inativos: null, criticos: null, percentualCriticos: null
            }));
            return res.json({
                coletasDisponiveis: false,
                avisos: [],
                kpis: { perfisConfigurados: perfis.length, perfisAtivos: null,
                    perfisComMaisCriticos: null },
                perfis, rankingCriticos: [],
                historicoStatus: { minutos: Number(minutos), perfis }
            });
        }
    } catch (erro) {
        console.error("Erro na DashboardPerfil:", erro.message);
        return res.status(500).json({ mensagem: "Não foi possível carregar os cadastros da dashboard." });
    }
}

module.exports = { obterDashboard };
