const servidoresModel = require('../models/servidoresModel');

async function listarServidores(req, res) {

    const idEmpresa = Number(req.query.idEmpresa);
    const idUsuario = Number(req.query.idUsuario);

    try {

        const servidores = await servidoresModel.listarServidores(
            idEmpresa,
            idUsuario
        );

        return res.status(200).json(servidores);

    } catch (erro) {

        console.error(erro);

        return res.status(500).json({
            erro: 'Erro ao listar servidores'
        });

    }
}

module.exports = {
    listarServidores
};