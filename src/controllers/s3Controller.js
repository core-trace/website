const dockerFonte = require("../services/dockerFonteService");
const s3Model = require("../models/s3Model");

// Só deixa ler resumos: evita que a rota sirva qualquer objeto do bucket
const PADRAO_RESUMO = /^client\/resumos\/maquina=[^/\\]+\/data=\d{4}-\d{2}-\d{2}\/(?:hora=\d{2}(?:\d{2})?\/)?resumo\.json$/;

async function listarArquivos(req, res) {

    const informado = req.query.prefixo || "client/resumos/";
    const prefixo = informado === "client/" ? "client/resumos/" : informado;
    if (typeof prefixo !== "string" || !prefixo.startsWith("client/resumos/")
        || prefixo.includes("\\") || prefixo.split("/").some(parte => parte === ".." || parte === ".")) {
        return res.status(400).json({ erro: "Prefixo inválido" });
    }
    try {

        const usarLocal = dockerFonte.local(req);
        const arquivos = usarLocal ? await dockerFonte.listar(prefixo) : await s3Model.listarResumosS3(prefixo);
        if (usarLocal) await dockerFonte.referencia(res);

        return res.status(200).json(arquivos);

    } catch (erro) {

        console.error(erro);

        return res.status(500).json({
            erro: "Erro ao listar os resumos"
        });

    }
}

async function buscarConteudo(req, res) {

    const nomeArquivo = req.query.arquivo;

    if (typeof nomeArquivo !== "string" || !PADRAO_RESUMO.test(nomeArquivo)) {

        return res.status(400).json({
            erro: "Nome do arquivo inválido"
        });

    }

    try {

        const conteudo = dockerFonte.local(req) ? await dockerFonte.ler(nomeArquivo) : await s3Model.buscarConteudoS3(nomeArquivo);

        return res.status(200).json({
            arquivo: nomeArquivo,
            conteudo: conteudo
        });

    } catch (erro) {

        console.error(erro);

        return res.status(500).json({
            erro: "Erro ao buscar o conteúdo do resumo"
        });

    }
}

module.exports = {
    listarArquivos,
    buscarConteudo
};
