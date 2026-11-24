
const {
    S3Client,
    GetObjectCommand,
    paginateListObjectsV2
} = require("@aws-sdk/client-s3");

// Configuração AWS
const s3 = new S3Client({
    region: process.env.AWS_REGION || "us-east-1"
});

const NOME_BUCKET = process.env.BUCKET_DADOS_GOLD;
const PASTA = "client/";
const PASTA_RESUMOS = `${PASTA}resumos/`;

// Valida a configuração do bucket
if (!NOME_BUCKET) {
    throw new Error("Variável BUCKET_DADOS_GOLD não configurada.");
}

// Lista todos os resumos armazenados no S3
async function listarResumosS3() {

    const arquivos = [];

    const paginas = paginateListObjectsV2(
        { client: s3 },
        {
            Bucket: NOME_BUCKET,
            Prefix: PASTA_RESUMOS
        }
    );

    for await (const pagina of paginas) {
        for (const arquivo of pagina.Contents || []) {
            arquivos.push(arquivo);
        }
    }

    return arquivos;
}

// Busca o conteúdo de um arquivo no S3
async function buscarConteudoS3(chave) {

    const resposta = await s3.send(
        new GetObjectCommand({
            Bucket: NOME_BUCKET,
            Key: chave
        })
    );

    return await resposta.Body.transformToString();
}

// Normaliza o MAC para o padrão utilizado na Gold
function normalizarMac(mac) {

    return mac.trim().toUpperCase().replace(/-/g, ":");
}

// Busca o resumo de uma máquina em uma data específica
async function buscarResumoServidor(mac, data) {

    const chave =
        `${PASTA_RESUMOS}maquina=${normalizarMac(mac)}/data=${data}/resumo.json`;

    try {
        return JSON.parse(await buscarConteudoS3(chave));

    } catch (erro) {
        if (erro.name === "NoSuchKey") {
            return null;
        }

        throw erro;
    }
}

// Busca o resumo mais recente de uma máquina
async function buscarUltimoResumoServidor(mac) {

    const prefixo =
        `${PASTA_RESUMOS}maquina=${normalizarMac(mac)}/`;

    const pastas = [];

    const paginas = paginateListObjectsV2(
        { client: s3 },
        {
            Bucket: NOME_BUCKET,
            Prefix: prefixo,
            Delimiter: "/"
        }
    );

    for await (const pagina of paginas) {
        for (const pasta of pagina.CommonPrefixes || []) {
            pastas.push(pasta.Prefix);
        }
    }

    // Ordena as datas da mais recente para a mais antiga
    pastas.sort().reverse();

    for (const pasta of pastas) {

        try {
            return JSON.parse(
                await buscarConteudoS3(`${pasta}resumo.json`)
            );

        } catch (erro) {
            if (erro.name !== "NoSuchKey") {
                throw erro;
            }
        }
    }

    return null;
}

// Busca arquivos binários sem conversão para texto
async function buscarArquivoBinarioS3(nomeArquivo) {

    const resposta = await s3.send(
        new GetObjectCommand({
            Bucket: NOME_BUCKET,
            Key: nomeArquivo
        })
    );

    return Buffer.from(
        await resposta.Body.transformToByteArray()
    );
}

module.exports = {
    listarResumosS3,
    buscarConteudoS3,
    buscarResumoServidor,
    buscarUltimoResumoServidor,
    buscarArquivoBinarioS3
};
