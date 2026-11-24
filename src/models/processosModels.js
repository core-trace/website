const {
    S3Client,
    ListObjectsV2Command,
    GetObjectCommand
} = require("@aws-sdk/client-s3");

const s3 = new S3Client({
    region: process.env.AWS_REGION || "us-east-1"
});

const BUCKET = process.env.BUCKET_DADOS_GOLD || "bucket-coretrace";

/**
 * Lista endereços MAC únicos que possuem resumo diário no S3.
 * Prefixo: client/resumos/maquina=<MAC>/data=<DATA>/resumo.json
 */
async function listarServidores() {
    const resposta = await s3.send(
        new ListObjectsV2Command({
            Bucket: BUCKET,
            Prefix: "client/resumos/maquina="
        })
    );

    const arquivos = resposta.Contents || [];
    const macs = new Set();

    for (const arquivo of arquivos) {
        const chave = arquivo.Key;
        const match = chave.match(/maquina=([^/]+)/);
        if (match) {
            macs.add(match[1]);
        }
    }

    return Array.from(macs).sort();
}

/**
 * Busca o resumo diário de um servidor em uma data.
 * Caminho: client/resumos/maquina=<MAC>/data=<DATA>/resumo.json
 */
async function buscarResumoDiario(enderecoMac, data) {
    const chave = `client/resumos/maquina=${enderecoMac}/data=${data}/resumo.json`;
    const resposta = await s3.send(
        new GetObjectCommand({ Bucket: BUCKET, Key: chave })
    );
    const texto = await resposta.Body.transformToString();
    return JSON.parse(texto);
}

/**
 * Lista as chaves dos lotes de captura de um servidor/dia.
 * Prefixo: client/lotes/maquina=<MAC>/data=<DATA>/
 */
async function listarLotesDoDia(enderecoMac, data) {
    const prefixo = `client/lotes/maquina=${enderecoMac}/data=${data}/`;
    const resposta = await s3.send(
        new ListObjectsV2Command({
            Bucket: BUCKET,
            Prefix: prefixo
        })
    );

    return (resposta.Contents || []).map(item => item.Key);
}

/**
 * Busca o conteúdo JSON de um lote específico.
 */
async function buscarConteudoLote(chave) {
    const resposta = await s3.send(
        new GetObjectCommand({ Bucket: BUCKET, Key: chave })
    );
    const texto = await resposta.Body.transformToString();
    return JSON.parse(texto);
}

module.exports = {
    listarServidores,
    buscarResumoDiario,
    listarLotesDoDia,
    buscarConteudoLote
};