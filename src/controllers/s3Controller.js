
const dockerFonte = require("../services/dockerFonteService");
const s3Model = require("../models/s3Model");

const BUCKET = process.env.BUCKET_DADOS_GOLD || process.env.S3_BUCKET || "bucket-coretrace";

async function listarArquivos(req, res) {

    const prefixo = req.query.prefixo || "client/";
    if (typeof prefixo !== "string" || !prefixo.startsWith("client/")) {
        return res.status(400).json({ erro: "Prefixo inválido" });
    }
    try {
        const usarLocal = dockerFonte.local(req);
        const arquivos = usarLocal ? await dockerFonte.listar(prefixo) : await s3Model.listarArquivosS3(BUCKET, prefixo);
        if (usarLocal) await dockerFonte.referencia(res);

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

    if (!nomeArquivo || !nomeArquivo.startsWith("client/")) {

        return res.status(400).json({
            erro: "Nome do arquivo inválido"
        });

    }

    try {

        const conteudo = dockerFonte.local(req) ? await dockerFonte.ler(nomeArquivo) : await s3Model.buscarConteudoS3(BUCKET, nomeArquivo);

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
