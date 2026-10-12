const usuarioModel = require("../models/usuarioModel");

function cadastrar(req, res) {
    const dados = req.body || {};
    const nome = dados.nomeServer;
    const email = dados.emailServer;
    const senha = dados.senhaServer;
    const cpf = dados.cpfServer || null;
    const telefone = dados.telefoneServer || null;
    const empresa = Number(dados.empresaServer);
    const nivelAcesso = Number(dados.nivelAcessoServer);

    if (typeof nome !== "string" || nome.trim() === "" || nome.trim().length > 45) {
        return res.status(400).send("Informe um nome com até 45 caracteres.");
    }

    if (typeof email !== "string" || email.trim() === "" || email.trim().length > 45) {
        return res.status(400).send("Informe um email com até 45 caracteres.");
    }

    if (typeof senha !== "string" || senha.trim() === "" || senha.length > 45) {
        return res.status(400).send("Informe uma senha com até 45 caracteres.");
    }

    if (cpf !== null && (typeof cpf !== "string" || !/^\d{11}$/.test(cpf))) {
        return res.status(400).send("Informe o CPF com 11 números, sem pontuação.");
    }

    if (telefone !== null && (typeof telefone !== "string" || telefone.length > 45)) {
        return res.status(400).send("Informe um telefone com até 45 caracteres.");
    }

    if (!Number.isInteger(empresa) || empresa <= 0) {
        return res.status(400).send("Informe uma empresa válida.");
    }

    if (!Number.isInteger(nivelAcesso) || nivelAcesso <= 0) {
        return res.status(400).send("Informe um nível de acesso válido.");
    }

    return usuarioModel.cadastrar(nome.trim(), email.trim(), senha, cpf, telefone, empresa, nivelAcesso)
        .then(function (resultado) {
            return res.status(201).json({
                id_usuario: resultado.insertId,
                nome: nome.trim(),
                email: email.trim(),
                fk_empresa: empresa,
                fk_nivel_acesso: nivelAcesso,
                status: "ATIVO"
            });
        })
        .catch(function (erro) {
            if (erro.code === "ER_DUP_ENTRY") {
                return res.status(409).send("Já existe um usuário com esse email ou CPF.");
            }

            if (erro.code === "ER_NO_REFERENCED_ROW_2") {
                return res.status(400).send("A empresa ou o nível de acesso não existe.");
            }

            console.error("Erro ao cadastrar usuário:", erro);
            return res.status(500).send("Houve um erro ao cadastrar o usuário.");
        });
}

function autenticar(req, res) {
    const dados = req.body || {};
    const email = dados.emailServer;
    const senha = dados.senhaServer;

    if (typeof email !== "string" || email.trim() === "") {
        return res.status(400).send("Informe o email.");
    }

    if (typeof senha !== "string" || senha.trim() === "") {
        return res.status(400).send("Informe a senha.");
    }

    return usuarioModel.autenticar(email.trim(), senha)
        .then(function (resultado) {
            if (resultado.length === 0) {
                return res.status(403).send("Email ou senha inválidos, ou usuário inativo.");
            }

            return res.json(resultado[0]);
        })
        .catch(function (erro) {
            console.error("Erro ao autenticar usuário:", erro);
            return res.status(500).send("Houve um erro ao autenticar o usuário.");
        });
}

function listarEquipe(req, res) {
    const empresa = Number(req.query.empresa);
    if (typeof req.query.empresa !== "string" || !Number.isSafeInteger(empresa) || empresa <= 0) {
        return res.status(400).json({ mensagem: "Informe uma empresa válida para consultar a equipe." });
    }

    return Promise.all([
        usuarioModel.buscarEmpresa(empresa),
        usuarioModel.listarEquipe(empresa),
        usuarioModel.listarNiveisAcesso()
    ])
        .then(function (resultados) {
            if (resultados[0].length === 0) {
                return res.status(404).json({ mensagem: "Empresa não encontrada." });
            }
            return res.json({
                empresa: resultados[0][0],
                membros: resultados[1],
                perfisAcesso: resultados[2]
            });
        })
        .catch(function (erro) {
            console.error("Erro ao carregar equipe e acessos:", erro.message);
            return res.status(500).json({ mensagem: "Não foi possível carregar a equipe. Tente novamente." });
        });
}

function alterarPerfil(req, res) {
    const dados = req.body || {};
    const idUsuario = Number(req.params.id);
    const empresa = Number(dados.empresa);
    const nivelAcesso = Number(dados.nivelAcesso);

    if (!Number.isSafeInteger(idUsuario) || idUsuario <= 0) {
        return res.status(400).json({ mensagem: "Informe um usuário válido." });
    }
    if (typeof dados.empresa !== "number" || !Number.isSafeInteger(empresa) || empresa <= 0) {
        return res.status(400).json({ mensagem: "Informe uma empresa válida." });
    }
    if (typeof dados.nivelAcesso !== "number" || !Number.isSafeInteger(nivelAcesso) || nivelAcesso <= 0) {
        return res.status(400).json({ mensagem: "Selecione um perfil de acesso válido." });
    }

    return usuarioModel.listarNiveisAcesso()
        .then(function (perfis) {
            const perfil = perfis.find(function (item) {
                return item.id_nivel_acesso === nivelAcesso;
            });
            if (!perfil) {
                return res.status(400).json({ mensagem: "O perfil de acesso selecionado não existe." });
            }

            return usuarioModel.alterarPerfil(idUsuario, empresa, nivelAcesso)
                .then(function (resultado) {
                    if (resultado.affectedRows === 0) {
                        return res.status(404).json({ mensagem: "Usuário não encontrado nesta empresa." });
                    }
                    return res.json({
                        mensagem: "Perfil de acesso atualizado com sucesso.",
                        id_usuario: idUsuario,
                        fk_nivel_acesso: perfil.id_nivel_acesso,
                        nivel_acesso: perfil.nome
                    });
                });
        })
        .catch(function (erro) {
            console.error("Erro ao alterar perfil do usuário:", erro.message);
            return res.status(500).json({ mensagem: "Não foi possível alterar o perfil. Tente novamente." });
        });
}

module.exports = {
    cadastrar,
    autenticar,
    listarEquipe,
    alterarPerfil
};
