const crypto = require("crypto");
const database = require("../database/config");

function cadastrarComAdministrador(dados, enviarConvite) {
    const tokenInstalacao = crypto.randomBytes(32).toString("hex");
    const tokenAcesso = crypto.randomBytes(32).toString("hex");

    return database.transacao(async function (executar) {
        const niveis = await executar(
            "SELECT id_nivel_acesso FROM nivel_acesso WHERE nome = ? ORDER BY id_nivel_acesso LIMIT 1;",
            ["Administrador"]
        );
        if (niveis.length === 0) {
            throw Object.assign(new Error("Perfil Administrador não configurado."), { code: "ADMIN_NAO_CONFIGURADO" });
        }

        const empresa = await executar(`
            INSERT INTO empresa (razao_social, cnpj, dt_registro, token_instalacao)
            VALUES (?, ?, CURDATE(), ?);
        `, [dados.razaoSocial, dados.cnpj, tokenInstalacao]);

        const endereco = dados.endereco;
        if (Object.values(endereco).some(valor => valor !== null)) {
            await executar(`
                INSERT INTO endereco (numero, cidade, estado, logradouro, fk_empresa)
                VALUES (?, ?, ?, ?, ?);
            `, [endereco.numero, endereco.cidade, endereco.estado, endereco.logradouro, empresa.insertId]);
        }

        const administrador = dados.administrador;
        const usuario = await executar(`
            INSERT INTO usuario (nome, email, token_acesso, cpf, telefone, fk_empresa, fk_nivel_acesso, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDENTE');
        `, [administrador.nome, administrador.email, tokenAcesso, administrador.cpf,
            administrador.telefone, empresa.insertId, niveis[0].id_nivel_acesso]);

        // Se o Resend recusar o convite, a transação desfaz todos os cadastros.
        try {
            await enviarConvite(administrador.nome, administrador.email, tokenAcesso);
        } catch (erro) {
            throw Object.assign(new Error("Falha ao enviar convite.", { cause: erro }), { code: "EMAIL_FALHOU" });
        }

        return { id_empresa: empresa.insertId, id_usuario: usuario.insertId };
    });
}

module.exports = { cadastrarComAdministrador };
