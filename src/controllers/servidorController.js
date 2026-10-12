const servidorModel = require("../models/servidorModel");
const { agruparMetricas } = require("../services/metricasService");

function ativarAgente(req, res) {
    const dados = req.body || {};
    const tokenInstalacao = dados.tokenInstalacaoServer;
    const tokenPerfilServidor = dados.tokenPerfilServidorServer;
    const mac = dados.enderecoMacServer;

    if (typeof tokenInstalacao !== "string" || tokenInstalacao.trim() === "" || tokenInstalacao.length > 255
        || typeof tokenPerfilServidor !== "string" || tokenPerfilServidor.trim() === "" || tokenPerfilServidor.length > 255) {
        return res.status(400).json({ mensagem: "Informe os tokens de instalação e do perfil de servidor." });
    }

    if (typeof mac !== "string" || !/^[0-9a-f]{2}([:-])[0-9a-f]{2}(\1[0-9a-f]{2}){4}$/i.test(mac.trim())) {
        return res.status(400).json({ mensagem: "Informe um endereço MAC válido." });
    }

    const enderecoMac = mac.trim().replace(/-/g, ":").toUpperCase();

    if (enderecoMac === "00:00:00:00:00:00") {
        return res.status(400).json({ mensagem: "Informe um endereço MAC válido." });
    }

    function responderAtivacao(idServidor) {
        return res.status(200).json({
            mensagem: "Agente ativado com sucesso.",
            id_servidor: idServidor
        });
    }

    return servidorModel.buscarPerfil(tokenInstalacao.trim(), tokenPerfilServidor.trim())
        .then(function (perfis) {
            if (perfis.length === 0) {
                return res.status(403).json({ mensagem: "Tokens inválidos ou perfil não vinculado à empresa." });
            }

            const idPerfilServidor = perfis[0].id_perfil_servidor;

            return servidorModel.buscarPorMac(enderecoMac)
                .then(function (servidores) {
                    if (servidores.length > 0) {
                        const servidor = servidores[0];

                        if (servidor.fk_perfil_servidor !== idPerfilServidor) {
                            return res.status(409).json({ mensagem: "Este MAC já está cadastrado em outro perfil de servidor." });
                        }

                        return servidorModel.ativar(servidor.id_servidor, idPerfilServidor)
                            .then(function () {
                                return responderAtivacao(servidor.id_servidor);
                            });
                    }

                    return servidorModel.cadastrar(enderecoMac, idPerfilServidor)
                        .then(function (resultado) {
                            return responderAtivacao(resultado.insertId);
                        });
                });
        })
        .catch(function (erro) {
            if (erro.code === "ER_DUP_ENTRY") {
                return res.status(409).json({ mensagem: "Este MAC acabou de ser cadastrado. Tente ativar novamente." });
            }

            console.error("Erro ao ativar agente:", erro.message);
            return res.status(500).json({ mensagem: "Não foi possível ativar o agente." });
        });
}

function listarPerfis(req, res) {
    const idEmpresa = Number(req.query.empresa);

    if (typeof req.query.empresa !== "string" || !Number.isSafeInteger(idEmpresa) || idEmpresa <= 0) {
        return res.status(400).json({ mensagem: "Informe uma empresa válida para consultar os perfis." });
    }

    return servidorModel.listarPerfisPorEmpresa(idEmpresa)
        .then(function (perfis) {
            return res.json(perfis);
        })
        .catch(function (erro) {
            console.error("Erro ao listar perfis de servidor:", erro.message);
            return res.status(500).json({ mensagem: "Não foi possível carregar os perfis de servidor. Tente novamente." });
        });
}

function listarMetricas(req, res) {
    return servidorModel.listarMetricas()
        .then(function (componentes) {
            return res.json({ categorias: agruparMetricas(componentes) });
        })
        .catch(function (erro) {
            console.error("Erro ao listar métricas:", erro.message);
            return res.status(500).json({ mensagem: "Não foi possível carregar as métricas. Tente novamente." });
        });
}

// O wizard envia todas as etapas juntas para evitar perfis incompletos.
function criarPerfil(req, res) {
    const dados = req.body || {};
    const mensagem = validarPerfil(dados);

    if (mensagem) {
        return res.status(400).json({ mensagem: mensagem });
    }

    return Promise.all([
        servidorModel.buscarProprietario(dados.proprietario, dados.empresa),
        servidorModel.listarMetricas(),
        servidorModel.listarMembrosDisponiveis(dados.empresa, dados.proprietario, 0)
    ])
        .then(function (resultados) {
            const proprietarios = resultados[0];
            const metricas = resultados[1];
            const membros = resultados[2];

            if (proprietarios.length === 0) {
                return res.status(403).json({ mensagem: "Proprietário ativo não encontrado nesta empresa." });
            }
            const erroMetricas = validarMetricasDoCatalogo(dados.metricas, metricas);
            if (erroMetricas) {
                return res.status(400).json({ mensagem: erroMetricas });
            }
            for (const membro of dados.equipe) {
                const usuario = membros.find(function (item) {
                    return item.id_usuario === membro.id;
                });
                if (!usuario) {
                    return res.status(400).json({ mensagem: "Selecione apenas colaboradores disponíveis da sua empresa." });
                }
            }

            return servidorModel.criarPerfil(dados)
                .then(function (resultado) {
                    return res.status(201).json({
                        mensagem: "Perfil cadastrado com sucesso.",
                        id_perfil_servidor: resultado.insertId
                    });
                });
        })
        .catch(function (erro) {
            console.error("Erro ao cadastrar perfil:", erro.message);
            return res.status(500).json({ mensagem: "Não foi possível salvar o perfil. Tente novamente." });
        });
}

function validarMetricasDoCatalogo(selecionadas, catalogo) {
    for (const metrica of selecionadas) {
        const componente = catalogo.find(function (item) {
            return item.id_componente === metrica.id;
        });
        if (!componente) return "Uma das métricas selecionadas não existe.";
        if (componente.unidade === "%" && metrica.atencao !== null
            && (metrica.atencao < 0 || metrica.atencao > 100 || metrica.critico < 0 || metrica.critico > 100)) {
            return "Os limites percentuais devem estar entre 0 e 100.";
        }
    }
    return "";
}

function obterPerfil(req, res) {
    const idPerfil = Number(req.params.id);
    const empresa = Number(req.query.empresa);
    if (!Number.isSafeInteger(idPerfil) || idPerfil <= 0 || !Number.isSafeInteger(empresa) || empresa <= 0) {
        return res.status(400).json({ mensagem: "Informe um perfil e uma empresa válidos." });
    }
    return servidorModel.obterPerfil(idPerfil, empresa)
        .then(function (perfil) {
            if (!perfil) return res.status(404).json({ mensagem: "Perfil não encontrado nesta empresa." });
            return res.json(perfil);
        })
        .catch(function (erro) {
            console.error("Erro ao consultar perfil:", erro.message);
            return res.status(500).json({ mensagem: "Não foi possível carregar o perfil." });
        });
}

function atualizarPerfil(req, res) {
    const idPerfil = Number(req.params.id);
    const dados = req.body || {};
    // A edição altera os dados de monitoramento; a equipe permanece no vínculo existente.
    dados.equipe = [];
    const mensagem = validarPerfil(dados);
    if (!Number.isSafeInteger(idPerfil) || idPerfil <= 0) {
        return res.status(400).json({ mensagem: "Informe um perfil válido." });
    }
    if (mensagem) return res.status(400).json({ mensagem: mensagem });

    return Promise.all([
        servidorModel.buscarProprietario(dados.proprietario, dados.empresa),
        servidorModel.listarMetricas()
    ])
        .then(function (resultados) {
            if (resultados[0].length === 0) {
                return res.status(403).json({ mensagem: "Usuário ativo não encontrado nesta empresa." });
            }
            const erroMetricas = validarMetricasDoCatalogo(dados.metricas, resultados[1]);
            if (erroMetricas) return res.status(400).json({ mensagem: erroMetricas });
            return servidorModel.atualizarPerfil(idPerfil, dados)
                .then(function (atualizado) {
                    if (!atualizado) return res.status(404).json({ mensagem: "Perfil não encontrado nesta empresa." });
                    return res.json({ mensagem: "Perfil atualizado com sucesso.", id_perfil_servidor: idPerfil });
                });
        })
        .catch(function (erro) {
            console.error("Erro ao atualizar perfil:", erro.message);
            return res.status(500).json({ mensagem: "Não foi possível salvar as alterações. Tente novamente." });
        });
}

function validarPerfil(dados) {
    if (!Number.isSafeInteger(dados.empresa) || dados.empresa <= 0
        || !Number.isSafeInteger(dados.proprietario) || dados.proprietario <= 0) {
        return "Informe a empresa e o proprietário do perfil.";
    }
    if (typeof dados.nome !== "string" || dados.nome.trim() === "" || dados.nome.trim().length > 100) {
        return "Informe um nome com até 100 caracteres.";
    }
    if (typeof dados.descricao !== "string" || dados.descricao.length > 500) {
        return "A descrição deve ter até 500 caracteres.";
    }
    if (dados.sistemaOperacional !== "linux" && dados.sistemaOperacional !== "windows") {
        return "Selecione Linux ou Windows.";
    }
    if (typeof dados.monitorarDocker !== "boolean") {
        return "Informe se deseja monitorar Docker.";
    }
    if (!Array.isArray(dados.metricas) || dados.metricas.length === 0 || dados.metricas.length > 500) {
        return "Selecione ao menos uma métrica.";
    }

    const idsMetricas = [];
    for (const metrica of dados.metricas) {
        if (!metrica || !Number.isSafeInteger(metrica.id) || metrica.id <= 0 || idsMetricas.includes(metrica.id)) {
            return "Selecione métricas válidas, sem repetições.";
        }
        idsMetricas.push(metrica.id);
        if (![">", ">=", "<", "<="].includes(metrica.operador)) {
            return "Selecione um operador válido para o alerta.";
        }
        if (metrica.atencao === null && metrica.critico === null) continue;
        if (!Number.isFinite(metrica.atencao) || !Number.isFinite(metrica.critico)) {
            return "Preencha os dois limites ou deixe ambos vazios.";
        }
        if ((metrica.operador === ">" || metrica.operador === ">=") && metrica.critico <= metrica.atencao) {
            return "O limite crítico deve ser maior que o de atenção.";
        }
        if ((metrica.operador === "<" || metrica.operador === "<=") && metrica.critico >= metrica.atencao) {
            return "O limite crítico deve ser menor que o de atenção.";
        }
    }

    if (!Array.isArray(dados.equipe) || dados.equipe.length > 100) {
        return "Selecione uma equipe válida.";
    }
    const idsEquipe = [dados.proprietario];
    for (const membro of dados.equipe) {
        if (!membro || !Number.isSafeInteger(membro.id) || membro.id <= 0 || idsEquipe.includes(membro.id)) {
            return "Selecione colaboradores válidos, sem repetições.";
        }
        if (membro.papel !== "administrador" && membro.papel !== "visualizador") {
            return "Selecione um nível de acesso válido.";
        }
        idsEquipe.push(membro.id);
    }
    return "";
}

function listarMembrosDisponiveis(req, res) {
    const empresa = Number(req.query.empresa);
    const proprietario = Number(req.query.proprietario);
    const perfil = req.query.perfil === undefined ? 0 : Number(req.query.perfil);

    if (!Number.isSafeInteger(empresa) || empresa <= 0
        || !Number.isSafeInteger(proprietario) || proprietario <= 0
        || !Number.isSafeInteger(perfil) || perfil < 0) {
        return res.status(400).json({ mensagem: "Informe a empresa, o proprietário e um perfil válido." });
    }

    return servidorModel.buscarProprietario(proprietario, empresa)
        .then(function (usuarios) {
            if (usuarios.length === 0) {
                return res.status(403).json({ mensagem: "Usuário não encontrado nesta empresa." });
            }
            return servidorModel.listarMembrosDisponiveis(empresa, proprietario, perfil)
                .then(function (membros) {
                    return res.json(membros);
                });
        })
        .catch(function (erro) {
            console.error("Erro ao buscar equipe:", erro.message);
            return res.status(500).json({ mensagem: "Não foi possível carregar os colaboradores." });
        });
}

module.exports = {
    ativarAgente,
    listarPerfis,
    listarMetricas,
    criarPerfil,
    listarMembrosDisponiveis,
    obterPerfil,
    atualizarPerfil
};
