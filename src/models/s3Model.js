const {
    S3Client,
    GetObjectCommand,
    paginateListObjectsV2
} = require("@aws-sdk/client-s3");

// Credenciais pelo padrão do SDK (AWS_ACCESS_KEY_ID etc. no .env.dev, nunca versionado)
const s3 = new S3Client({
    region: process.env.AWS_REGION
});

const BUCKET = process.env.BUCKET_DADOS_GOLD;
const PASTA_RESUMOS = "client/resumos/";

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

async function buscarConteudoS3(chave) {

    const resposta = await s3.send(
        new GetObjectCommand({
            Bucket: BUCKET,
            Key: chave
        })
    );

    return await resposta.Body.transformToString();
}

// Para a dashboard: sem listar nada, a chave é montada pelo MAC e pelo dia.
// O MAC segue o mesmo formato da Gold (maiúsculo, com dois-pontos).
function normalizarMac(mac) {

    return mac.trim().toUpperCase().replace(/-/g, ":");

}

async function buscarResumoServidor(mac, data) {

    const chave = `${PASTA_RESUMOS}maquina=${normalizarMac(mac)}/data=${data}/resumo.json`;

    try {
        return JSON.parse(await buscarConteudoS3(chave));
    } catch (erro) {
        if (erro.name === "NoSuchKey") {
            return null;
        }
        throw erro;
    }
}

// Resumo mais recente da máquina, não importa há quanto tempo foi gerado.
// As pastas data=AAAA-MM-DD ordenam corretamente em ordem alfabética.
async function buscarUltimoResumoServidor(mac) {

    const prefixo = `${PASTA_RESUMOS}maquina=${normalizarMac(mac)}/`;
    const pastas = [];

    const paginas = paginateListObjectsV2(
        { client: s3 },
        { Bucket: BUCKET, Prefix: prefixo, Delimiter: "/" }
    );

    for await (const pagina of paginas) {
        for (const pasta of pagina.CommonPrefixes || []) {
            pastas.push(pasta.Prefix);
        }
    }

    // Da data mais nova para a mais antiga, até achar uma pasta que tenha o resumo.json
    pastas.sort().reverse();

    for (const pasta of pastas) {

        try {
            return JSON.parse(await buscarConteudoS3(`${pasta}resumo.json`));
        } catch (erro) {
            if (erro.name !== "NoSuchKey") {
                throw erro;
            }
        }

    }

    return null;
}

module.exports = {
    listarResumosS3,
    buscarConteudoS3,
    buscarResumoServidor,
    buscarUltimoResumoServidor
};