const database = require("../database/config");

async function buscarDados(empresa, usuario) {
    //busca os perfis da empresa, conta seus servidores e respeita as permissões de acesso do usuário
    const perfis = await database.executar(`
        SELECT p.id_perfil_servidor, p.nome,
               COUNT(s.id_servidor) AS total_servidores
        FROM perfil_servidor p
        LEFT JOIN servidores s
            ON s.fk_perfil_servidor = p.id_perfil_servidor
        WHERE p.fk_empresa = ?
        AND EXISTS (
            SELECT 1
            FROM usuario u
            WHERE u.id_usuario = ?
              AND u.fk_empresa = p.fk_empresa
              AND u.status = 'ATIVO'
              AND (
                  EXISTS (
                      SELECT 1
                      FROM nivel_acesso_permissoes np
                      JOIN permissoes perm
                          ON perm.id_permissao = np.fk_permissao
                      WHERE np.fk_nivel_acesso = u.fk_nivel_acesso
                        AND perm.nome IN ('ACESSAR_EQUIPE', 'ACESSAR_EMPRESAS')
                  )
                  OR EXISTS (
                      SELECT 1
                      FROM usuario_perfil_servidor up
                      WHERE up.fk_usuario = u.id_usuario
                        AND up.fk_perfil_servidor = p.id_perfil_servidor
                  )
              )
        )
        GROUP BY p.id_perfil_servidor, p.nome
        ORDER BY p.nome, p.id_perfil_servidor;
    `, [empresa, usuario]);

    const servidores = [];

    for (const perfil of perfis) {
        //busca quais componentes cada perfil monitora e quais são os limites de atenção e criticidade de cada um.
        perfil.componentes = await database.executar(`
            SELECT c.id_componente AS id, c.categoria, c.nome,
                   c.nome_coluna AS coluna, c.unidade,
                   cp.operador,
                   cp.limite_atencao AS atencao,
                   cp.limite_critico AS critico,
                   cp.operador_2 AS operador2,
                   cp.limite_atencao_2 AS atencao2,
                   cp.limite_critico_2 AS critico2
            FROM componentes_perfil cp
            JOIN componentes c ON c.id_componente = cp.fk_componente
            JOIN perfil_servidor p
                ON p.id_perfil_servidor = cp.fk_perfil_servidor
            WHERE p.id_perfil_servidor = ? AND p.fk_empresa = ?
            ORDER BY c.categoria, c.ordem_card, c.id_componente;
        `, [perfil.id_perfil_servidor, empresa]);

        //identifica os servidores associados a cada perfil, trazendo suas informações de identificação

        const servidoresDoPerfil = await database.executar(`
            SELECT s.id_servidor, s.nome, s.endereco_mac,
                   p.id_perfil_servidor, p.nome AS nome_perfil
            FROM servidores s
            JOIN perfil_servidor p
                ON p.id_perfil_servidor = s.fk_perfil_servidor
            WHERE p.id_perfil_servidor = ? AND p.fk_empresa = ?
            ORDER BY s.id_servidor;
        `, [perfil.id_perfil_servidor, empresa]);

        for (const servidor of servidoresDoPerfil) {
            servidor.componentes = perfil.componentes;
            servidores.push(servidor);
        }
        //cada servidor recebe os componentes configurados para o seu perfil
    }

    return { perfis, servidores };
}

module.exports = { buscarDados };

