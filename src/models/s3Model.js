const {
    S3Client,
    GetObjectCommand,
    paginateListObjectsV2
} = require("@aws-sdk/client-s3");

// Credenciais pelo padrão do SDK (AWS_ACCESS_KEY_ID etc. no .env.dev, nunca versionado)
const s3 = new S3Client({
    region: process.env.AWS_REGION || "us-east-1"
});

const PASTA = "client/";

// Um resumo por máquina e dia, no caminho:
// client/resumos/maquina=AA:BB:CC:DD:EE:FF/data=2026-11-22/resumo.json
async function listarResumosS3() {

    const arquivos = [];

    // Cada chamada traz no máximo 1000 objetos. O paginador continua até acabar.
    const paginas = paginateListObjectsV2(
        { client: s3 },
        { Bucket: BUCKET, Prefix: PASTA_RESUMOS }
    );

    for await (const pagina of paginas) {
        for (const arquivo of pagina.Contents || []) {
            arquivos.push(arquivo);
        }
    }

    return arquivos;
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
    buscarConteudoS3
};