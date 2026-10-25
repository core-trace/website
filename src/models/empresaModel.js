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

function buscarMetricasPorToken(tokenInstalacao, tokenPerfil) {
    return database.executar(`
        SELECT c.nome, c.nome_coluna, c.funcao_psutil, c.argumento_nome,
               c.argumento_valor, c.atributo_retorno, c.indice_retorno, c.unidade
        FROM empresa e
        JOIN perfil_servidor ps ON ps.fk_empresa = e.id_empresa
        JOIN componentes_perfil cp ON cp.fk_perfil_servidor = ps.id_perfil_servidor
        JOIN componentes c ON c.id_componente = cp.fk_componente
        WHERE e.token_instalacao = ? AND ps.token_perfil_servidor = ?
        ORDER BY c.id_componente;
    `, [tokenInstalacao, tokenPerfil]);
}

function listarLimites(idPerfil) {
    return database.executar(`
        SELECT c.nome AS componente, c.unidade,
               cp.limite_atencao, cp.limite_critico, cp.operador,
               cp.operador_2, cp.limite_atencao_2, cp.limite_critico_2
        FROM componentes_perfil cp
        JOIN componentes c ON c.id_componente = cp.fk_componente
        WHERE cp.fk_perfil_servidor = ?
        ORDER BY c.id_componente;
    `, [idPerfil]);
}

module.exports = { cadastrarComAdministrador, buscarMetricasPorToken, listarLimites };
