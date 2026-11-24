const s3Model = require("../models/s3Model");

// Só deixa ler resumos: evita que a rota sirva qualquer objeto do bucket
const PADRAO_RESUMO = /^client\/resumos\/maquina=[^/]+\/data=\d{4}-\d{2}-\d{2}\/resumo\.json$/;

async function listarArquivos(req, res) {

    try {

        const arquivos = await s3Model.listarResumosS3();

        return res.status(200).json(arquivos);

    } catch (erro) {

        console.error(erro);

        return res.status(500).json({
            erro: "Erro ao listar arquivos do S3"
        });

    }
}

async function buscarConteudo(req, res) {

    const nomeArquivo = req.query.arquivo;

    if (!nomeArquivo || !PADRAO_RESUMO.test(nomeArquivo)) {

        return res.status(400).json({
            erro: "Nome do arquivo inválido"
        });

    }

    try {

        const conteudo = await s3Model.buscarConteudoS3(nomeArquivo);

        return res.status(200).json({
            arquivo: nomeArquivo,
            conteudo: conteudo
        });

    } catch (erro) {

        console.error(erro);

        return res.status(500).json({
            erro: "Erro ao buscar conteúdo do arquivo S3"
        });

    }
}

module.exports = {
    listarArquivos,
    buscarConteudo
};