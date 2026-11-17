const database = require('../database/config');

async function listarServidores(idEmpresa, idUsuario) {

    const servidores = await database.executar(`
        SELECT 
            s.nome,
            p.id_perfil_servidor,
            p.nome AS nome_perfil,
            s.endereco_mac
        FROM servidores s
        INNER JOIN perfil_servidor p 
            ON p.id_perfil_servidor = s.fk_perfil_servidor
        WHERE p.fk_empresa = ? AND EXISTS (
            SELECT 1 FROM usuario u
            INNER JOIN nivel_acesso n 
                ON n.id_nivel_acesso = u.fk_nivel_acesso
            WHERE u.id_usuario = ? 
              AND u.fk_empresa = p.fk_empresa 
              AND u.status = 'ATIVO'
              AND (EXISTS (
                  SELECT 1 FROM nivel_acesso_permissoes np
                  INNER JOIN permissoes perm 
                      ON perm.id_permissao = np.fk_permissao
                  WHERE np.fk_nivel_acesso = n.id_nivel_acesso
                    AND perm.nome IN ('ACESSAR_EQUIPE', 'ACESSAR_EMPRESAS')
              ) OR EXISTS (
                  SELECT 1 FROM usuario_perfil_servidor up
                  WHERE up.fk_usuario = u.id_usuario 
                    AND up.fk_perfil_servidor = p.id_perfil_servidor
              ))
        )
        ORDER BY s.id_servidor ASC;
    `, [idEmpresa, idUsuario]);

    return servidores;
}

module.exports = {
    listarServidores
};