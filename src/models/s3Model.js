const {
    S3Client,
    ListObjectsV2Command,
    GetObjectCommand
} = require("@aws-sdk/client-s3");

// Configuração AWS
const s3 = new S3Client({
    region: process.env.AWS_REGION
});

const BUCKET = "bucket-coretrace-servidores";
const PASTA = "raw/";

async function listarArquivosS3() {

    const resposta = await s3.send(
        new ListObjectsV2Command({
            Bucket: BUCKET,
            Prefix: PASTA
        })
    );

    const arquivos = resposta.Contents || [];

    return arquivos.filter(arquivo => arquivo.Key !== PASTA);
}

async function buscarConteudoS3(nomeArquivo) {

    const resposta = await s3.send(
        new GetObjectCommand({
            Bucket: BUCKET,
            Key: nomeArquivo
        })
    );

    const conteudo = await resposta.Body.transformToString();

    return conteudo;
}

module.exports = {
    listarArquivosS3,
    buscarConteudoS3
};
