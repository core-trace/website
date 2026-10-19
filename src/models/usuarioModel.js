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

function buscarEmpresa(idEmpresa) {
    const instrucaoSql = `
        SELECT id_empresa, razao_social
        FROM empresa
        WHERE id_empresa = ?;
    `;
    return database.executar(instrucaoSql, [idEmpresa]);
}

function listarEquipe(idEmpresa) {
    const instrucaoSql = `
        SELECT u.id_usuario, u.nome, u.email, u.status,
               u.fk_nivel_acesso, n.nome AS nivel_acesso
        FROM usuario u
        INNER JOIN nivel_acesso n ON n.id_nivel_acesso = u.fk_nivel_acesso
        WHERE u.fk_empresa = ?
        ORDER BY u.nome, u.id_usuario;
    `;
    return database.executar(instrucaoSql, [idEmpresa]);
}

function listarNiveisAcesso() {
    const instrucaoSql = `
        SELECT id_nivel_acesso, nome, descricao
        FROM nivel_acesso
        WHERE nome <> 'Administrador CoreTrace'
        ORDER BY id_nivel_acesso;
    `;
    return database.executar(instrucaoSql);
}

function listarPermissoes(idUsuario) {
    return database.executar(`
        SELECT DISTINCT p.nome
        FROM usuario u
        INNER JOIN nivel_acesso n ON n.id_nivel_acesso = u.fk_nivel_acesso
        INNER JOIN nivel_acesso_permissoes np ON np.fk_nivel_acesso = n.id_nivel_acesso
        INNER JOIN permissoes p ON p.id_permissao = np.fk_permissao
        WHERE u.id_usuario = ? AND u.status = 'ATIVO';
    `, [idUsuario]);
}

function alterarPerfil(idUsuario, idEmpresa, nivelAcesso) {
    const instrucaoSql = `
        UPDATE usuario
        SET fk_nivel_acesso = ?
        WHERE id_usuario = ? AND fk_empresa = ?;
    `;
    return database.executar(instrucaoSql, [nivelAcesso, idUsuario, idEmpresa]);
}

module.exports = {
    cadastrar,
    autenticar,
    criarUser,
    buscarUsuarioPorToken,
    ativarUsuario,
    removerConvite,
    buscarEmpresa,
    listarEquipe,
    listarNiveisAcesso,
    listarPermissoes,
    alterarPerfil
}
