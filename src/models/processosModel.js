const {
    S3Client,
    ListObjectsV2Command,
    GetObjectCommand
} = require("@aws-sdk/client-s3");

const s3 = new S3Client({
    region: process.env.AWS_REGION || "us-east-1"
});

const BUCKET = process.env.BUCKET_DADOS_GOLD || "bucket-coretrace";

const PREFIXO_LOTES = "client/lotes/";
const PREFIXO_RESUMOS = "client/resumos/";

// A listagem varre os prefixos no S3; como muda pouco, fica em cache por 5 min.
const CACHE_SERVIDORES_TTL_MS = 5 * 60 * 1000;
let cacheServidores = null;

function normalizarMac(enderecoMac) {
    return String(enderecoMac || "").trim().toUpperCase();
}

/**
 * Lista todos os endereços MAC únicos que possuem dados no S3.
 * Olha tanto os lotes de captura (client/lotes/maquina=<MAC>/...)
 * quanto os resumos diários (client/resumos/maquina=<MAC>/...),
 * para que apareçam servidores que tenham processos mesmo sem
 * resumo diário gerado ainda.
 */
async function listarServidores() {
    if (cacheServidores && Date.now() - cacheServidores.tempo < CACHE_SERVIDORES_TTL_MS) {
        return cacheServidores.macs;
    }

    const macs = new Set();

    for (const prefixo of [PREFIXO_LOTES, PREFIXO_RESUMOS]) {
        let token;
        do {
            const resposta = await s3.send(
                new ListObjectsV2Command({
                    Bucket: BUCKET,
                    Prefix: `${prefixo}maquina=`,
                    ContinuationToken: token
                })
            );

            for (const arquivo of resposta.Contents || []) {
                const chave = arquivo.Key;
                const match = chave.match(/maquina=([^/]+)/);
                if (match) {
                    macs.add(normalizarMac(match[1]));
                }
            }

            token = resposta.IsTruncated ? resposta.NextContinuationToken : undefined;
        } while (token);
    }

    const resultado = Array.from(macs).sort();
    cacheServidores = { tempo: Date.now(), macs: resultado };
    return resultado;
}

/**
 * Busca o resumo diário de um servidor em uma data.
 * Caminho: client/resumos/maquina=<MAC>/data=<DATA>/resumo.json
 */
async function buscarResumoDiario(enderecoMac, data) {
    const mac = normalizarMac(enderecoMac);
    const chave = `${PREFIXO_RESUMOS}maquina=${mac}/data=${data}/resumo.json`;
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
    const mac = normalizarMac(enderecoMac);
    const prefixo = `${PREFIXO_LOTES}maquina=${mac}/data=${data}/`;
    const chaves = [];
    let token;

    do {
        const resposta = await s3.send(
            new ListObjectsV2Command({
                Bucket: BUCKET,
                Prefix: prefixo,
                ContinuationToken: token
            })
        );

        for (const arquivo of resposta.Contents || []) {
            chaves.push(arquivo.Key);
        }

        token = resposta.IsTruncated ? resposta.NextContinuationToken : undefined;
    } while (token);

    return chaves.sort();
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
    buscarConteudoLote,
    normalizarMac
};
