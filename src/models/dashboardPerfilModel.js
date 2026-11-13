const database = require("../database/config");
const servidorModel = require("./servidorModel");

async function buscarDados(empresa, usuario) {

    const perfis = await database.executar(`
        SELECT p.id_perfil_servidor, p.nome
        FROM perfil_servidor p
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
                    AND perm.nome IN (
                        'ACESSAR_EQUIPE',
                        'ACESSAR_EMPRESAS'
                    )
                )
                OR EXISTS (
                    SELECT 1
                    FROM usuario_perfil_servidor up
                    WHERE up.fk_usuario = u.id_usuario
                    AND up.fk_perfil_servidor = p.id_perfil_servidor
                )
            )
        )
        ORDER BY p.nome
    `, [empresa, usuario]);

    const servidores = await servidorModel.listarServidoresPorEmpresa(
        empresa,
        usuario
    );

    for (const perfil of perfis) {

        perfil.componentes = await database.executar(`
            SELECT
                c.nome,
                c.nome_coluna AS coluna,
                c.unidade,
                cp.operador,
                cp.limite_atencao AS atencao,
                cp.limite_critico AS critico,
                cp.operador_2 AS operador2,
                cp.limite_atencao_2 AS atencao2,
                cp.limite_critico_2 AS critico2
            FROM componentes_perfil cp
            JOIN componentes c
            ON c.id_componente = cp.fk_componente
            WHERE cp.fk_perfil_servidor = ?
        `, [perfil.id_perfil_servidor]);

        for (const servidor of servidores) {

            if (servidor.id_perfil_servidor == perfil.id_perfil_servidor) {
                servidor.componentes = perfil.componentes;
            }
        }
    }

    return { perfis, servidores };
}

module.exports = { buscarDados };

