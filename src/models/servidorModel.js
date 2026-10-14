const crypto = require("crypto");
const database = require("../database/config");

function buscarPerfil(tokenInstalacao, tokenPerfilServidor) {
    const instrucaoSql = `
        SELECT p.id_perfil_servidor
        FROM perfil_servidor p
        INNER JOIN empresa e ON e.id_empresa = p.fk_empresa
        WHERE e.token_instalacao = ? AND p.token_perfil_servidor = ?;
    `;

    return database.executar(instrucaoSql, [tokenInstalacao, tokenPerfilServidor]);
}

function buscarPorMac(enderecoMac) {
    const instrucaoSql = `
        SELECT id_servidor, fk_perfil_servidor
        FROM servidores
        WHERE endereco_mac = ?;
    `;

    return database.executar(instrucaoSql, [enderecoMac]);
}

function cadastrar(enderecoMac, idPerfilServidor) {
    const instrucaoSql = `
        INSERT INTO servidores (nome, status, endereco_mac, fk_perfil_servidor)
        VALUES (?, 'ATIVO', ?, ?);
    `;

    return database.executar(instrucaoSql, [`Servidor ${enderecoMac}`, enderecoMac, idPerfilServidor]);
}

function ativar(idServidor, idPerfilServidor) {
    const instrucaoSql = `
        UPDATE servidores
        SET status = 'ATIVO'
        WHERE id_servidor = ? AND fk_perfil_servidor = ?;
    `;

    return database.executar(instrucaoSql, [idServidor, idPerfilServidor]);
}

function listarServidoresPorEmpresa(idEmpresa) {
    return database.executar(`
        SELECT s.id_servidor, s.nome, p.id_perfil_servidor,
               p.nome AS nome_perfil, p.sistema_operacional
        FROM servidores s
        INNER JOIN perfil_servidor p ON p.id_perfil_servidor = s.fk_perfil_servidor
        WHERE p.fk_empresa = ?
        ORDER BY s.id_servidor ASC;
    `, [idEmpresa]);
}

function listarPerfisPorEmpresa(idEmpresa) {
    const instrucaoSql = `
        SELECT p.id_perfil_servidor, p.nome, p.descricao,
               COUNT(s.id_servidor) AS total_servidores
        FROM perfil_servidor p
        LEFT JOIN servidores s ON s.fk_perfil_servidor = p.id_perfil_servidor
        WHERE p.fk_empresa = ?
        GROUP BY p.id_perfil_servidor, p.nome, p.descricao
        ORDER BY p.nome ASC, p.id_perfil_servidor ASC;
    `;

    return database.executar(instrucaoSql, [idEmpresa]);
}

function listarMetricas() {
    return database.executar(`
        SELECT id_componente, nome, nome_coluna, funcao_psutil, unidade,
               categoria, essencial, recomendada, plataforma, exibir_no_card, ordem_card
        FROM componentes
        ORDER BY id_componente ASC;
    `);
}

function buscarProprietario(idUsuario, idEmpresa) {
    const instrucaoSql = `
        SELECT id_usuario
        FROM usuario
        WHERE id_usuario = ? AND fk_empresa = ? AND status = 'ATIVO';
    `;
    return database.executar(instrucaoSql, [idUsuario, idEmpresa]);
}

function listarMembrosDisponiveis(idEmpresa, idProprietario, idPerfil) {
    const instrucaoSql = `
        SELECT u.id_usuario, u.nome, u.email, u.status, n.nome AS nivel_acesso
        FROM usuario u
        INNER JOIN nivel_acesso n ON n.id_nivel_acesso = u.fk_nivel_acesso
        WHERE u.fk_empresa = ?
          AND u.id_usuario <> ?
          AND u.status = 'ATIVO'
          AND (? = 0 OR EXISTS (
              SELECT 1 FROM perfil_servidor p
              WHERE p.id_perfil_servidor = ? AND p.fk_empresa = u.fk_empresa
          ))
          AND NOT EXISTS (
              SELECT 1 FROM usuario_perfil_servidor up
              WHERE up.fk_usuario = u.id_usuario AND up.fk_perfil_servidor = ?
          )
        ORDER BY u.nome, u.id_usuario;
    `;
    return database.executar(instrucaoSql, [idEmpresa, idProprietario, idPerfil, idPerfil, idPerfil]);
}

function criarPerfil(dados) {
    const token = crypto.randomBytes(32).toString("hex");

    // As três tabelas precisam ser gravadas juntas, na mesma transação.
    return database.transacao(async function (executar) {
        const sqlPerfil = `
            INSERT INTO perfil_servidor
                (nome, descricao, sistema_operacional, monitorar_docker, token_perfil_servidor, fk_empresa)
            VALUES (?, ?, ?, ?, ?, ?);
        `;
        const resultado = await executar(sqlPerfil, [
            dados.nome.trim(), dados.descricao.trim(), dados.sistemaOperacional,
            dados.monitorarDocker, token, dados.empresa
        ]);
        const idPerfil = resultado.insertId;

        const sqlMetrica = `
            INSERT INTO componentes_perfil
                (fk_componente, fk_perfil_servidor, operador, limite_atencao, limite_critico)
            VALUES (?, ?, ?, ?, ?);
        `;
        for (const metrica of dados.metricas) {
            await executar(sqlMetrica, [metrica.id, idPerfil, metrica.operador, metrica.atencao, metrica.critico]);
        }

        const sqlMembro = `
            INSERT INTO usuario_perfil_servidor (fk_usuario, fk_perfil_servidor, papel)
            VALUES (?, ?, ?);
        `;
        await executar(sqlMembro, [dados.proprietario, idPerfil, "proprietario"]);
        for (const membro of dados.equipe) {
            await executar(sqlMembro, [membro.id, idPerfil, membro.papel]);
        }
        return resultado;
    });
}

function obterPerfil(idPerfil, idEmpresa) {
    const instrucaoSql = `
        SELECT id_perfil_servidor, nome, descricao, sistema_operacional, monitorar_docker
        FROM perfil_servidor
        WHERE id_perfil_servidor = ? AND fk_empresa = ?;
    `;
    return database.executar(instrucaoSql, [idPerfil, idEmpresa])
        .then(function (perfis) {
            if (perfis.length === 0) return null;
            const perfil = perfis[0];
            return database.executar(`
                SELECT fk_componente AS id, operador, limite_atencao AS atencao, limite_critico AS critico
                FROM componentes_perfil
                WHERE fk_perfil_servidor = ?;
            `, [idPerfil]).then(function (metricas) {
                perfil.metricas = metricas;
                return perfil;
            });
        });
}

function atualizarPerfil(idPerfil, dados) {
    return database.transacao(async function (executar) {
        const perfis = await executar(`
            SELECT id_perfil_servidor FROM perfil_servidor
            WHERE id_perfil_servidor = ? AND fk_empresa = ? FOR UPDATE;
        `, [idPerfil, dados.empresa]);
        if (perfis.length === 0) return false;

        await executar(`
            UPDATE perfil_servidor
            SET nome = ?, descricao = ?, sistema_operacional = ?, monitorar_docker = ?
            WHERE id_perfil_servidor = ? AND fk_empresa = ?;
        `, [dados.nome.trim(), dados.descricao.trim(), dados.sistemaOperacional,
            dados.monitorarDocker, idPerfil, dados.empresa]);

        // Substitui a seleção e seus limites dentro da mesma transação.
        await executar("DELETE FROM componentes_perfil WHERE fk_perfil_servidor = ?", [idPerfil]);
        for (const metrica of dados.metricas) {
            await executar(`
                INSERT INTO componentes_perfil
                    (fk_componente, fk_perfil_servidor, operador, limite_atencao, limite_critico)
                VALUES (?, ?, ?, ?, ?);
            `, [metrica.id, idPerfil, metrica.operador, metrica.atencao, metrica.critico]);
        }
        return true;
    });
}

module.exports = {
    buscarPerfil, buscarPorMac, cadastrar, ativar,
    listarServidoresPorEmpresa, listarPerfisPorEmpresa, listarMetricas, buscarProprietario,
    listarMembrosDisponiveis, criarPerfil, obterPerfil, atualizarPerfil
};
