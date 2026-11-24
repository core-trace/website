const {
    S3Client,
    ListObjectsV2Command,
    GetObjectCommand
} = require("@aws-sdk/client-s3");

// Configuração AWS
const s3 = new S3Client({
    region: process.env.AWS_REGION || "us-east-1"
});

const PASTA = "client/";
const NOME_BUCKET = process.env.BUCKET_DADOS_GOLD || process.env.S3_BUCKET || "bucket-coretrace";

async function listarArquivosS3(BUCKET, prefixo = PASTA) {
    const arquivos = [];
    let token;
    do {
        const resposta = await s3.send(new ListObjectsV2Command({
            Bucket: BUCKET,
            Prefix: prefixo,
            ContinuationToken: token
        }));
        arquivos.push(...(resposta.Contents || []).filter(arquivo => !arquivo.Key.endsWith("/")));
        token = resposta.IsTruncated ? resposta.NextContinuationToken : undefined;
    } while (token);
    return arquivos;
}

async function buscarConteudoS3(BUCKET, nomeArquivo) {

    const resposta = await s3.send(
        new GetObjectCommand({
            Bucket: BUCKET,
            Key: nomeArquivo
        })
    );

    const conteudo = await resposta.Body.transformToString();

    return conteudo;
}

// Igual a buscarConteudoS3, mas sem converter pra texto pq transformToString() corromperia o conteudo.
async function buscarArquivoBinarioS3(nomeArquivo) {

    const resposta = await s3.send(
        new GetObjectCommand({
            Bucket: NOME_BUCKET,
            Key: nomeArquivo
        })
    );

    return Buffer.from(await resposta.Body.transformToByteArray());
}

module.exports = {
    listarArquivosS3,
    buscarConteudoS3,
    buscarArquivoBinarioS3
};
