const database = require("../database/config")

function cadastrar(nome, email, senha, cpf, telefone, empresa, nivelAcesso) {
    const instrucaoSql = `
        INSERT INTO usuario (nome, email, senha, cpf, telefone, fk_empresa, fk_nivel_acesso, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'ATIVO');
    `;

    return database.executar(instrucaoSql, [nome, email, senha, cpf, telefone, empresa, nivelAcesso]);
}

function autenticar(email, senha) {
    const instrucaoSql = `
        SELECT u.id_usuario, u.nome, u.email, u.fk_empresa, u.fk_nivel_acesso, u.status,
               n.nome AS nivel_acesso, e.razao_social AS nome_empresa
        FROM usuario u
        INNER JOIN nivel_acesso n ON n.id_nivel_acesso = u.fk_nivel_acesso
        INNER JOIN empresa e ON e.id_empresa = u.fk_empresa
        WHERE u.email = ? AND u.senha = ? AND u.status = 'ATIVO';
    `;

    return database.executar(instrucaoSql, [email, senha]);
}

function criarUser(nome, email, token, cpf, telefone, empresa, nivelAcesso) {
    const instrucao = `
        INSERT INTO usuario (nome, email, token_acesso, cpf, telefone, fk_empresa, fk_nivel_acesso, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDENTE');
    `

    return database.executar(instrucao, [nome, email, token, cpf, telefone, empresa, nivelAcesso])
}

function buscarUsuarioPorToken(token) {
    const instrucao = `
        SELECT id_usuario, nome, email
        FROM usuario
        WHERE token_acesso = ? AND status = 'PENDENTE';
    `

    return database.executar(instrucao, [token])
}

function ativarUsuario(token, senha) {
    const instrucao = `
        UPDATE usuario
        SET senha = ?, status = 'ATIVO', token_acesso = NULL
        WHERE token_acesso = ? AND status = 'PENDENTE';
    `

    return database.executar(instrucao, [senha, token])
}

function removerConvite(idUsuario, token) {
    const instrucao = `
        DELETE FROM usuario
        WHERE id_usuario = ? AND token_acesso = ? AND status = 'PENDENTE';
    `

    return database.executar(instrucao, [idUsuario, token])
}

module.exports = {
    cadastrar,
    autenticar,
    criarUser,
    buscarUsuarioPorToken,
    ativarUsuario,
    removerConvite
}
