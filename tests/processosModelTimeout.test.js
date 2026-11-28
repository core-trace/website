/*
 * Teste do prazo explícito nas chamadas S3 da dashboard de processos.
 * Execução: node tests/processosModelTimeout.test.js
 */
const assert = require("node:assert/strict");
const aws = require("@aws-sdk/client-s3");

const chamadas = [];
aws.S3Client.prototype.send = async function (comando, opcoes) {
    chamadas.push({ tipo: comando.constructor.name, opcoes });
    if (comando.constructor.name === "ListObjectsV2Command") {
        return { Contents: [], IsTruncated: false };
    }
    return { Body: { transformToString: async () => "{}" } };
};

const model = require("../src/models/processosModel");

(async () => {
    await model.listarServidores();
    await model.buscarResumoDiario("AA:BB", "2026-11-27");
    await model.listarLotesDoDia("AA:BB", "2026-11-27");
    await model.buscarConteudoLote(
        "client/lotes/maquina=AA:BB/data=2026-11-27/capturas.json"
    );

    assert.equal(chamadas.length, 5, "duas listagens de servidores e três leituras");
    assert(chamadas.every(item => item.opcoes && item.opcoes.abortSignal),
        "toda chamada S3 recebe sinal de timeout");
    assert(chamadas.every(item => item.opcoes.abortSignal instanceof AbortSignal),
        "o sinal é um AbortSignal válido");

    console.log("processosModelTimeout: todos os testes passaram.");
})().catch(erro => {
    console.error(erro);
    process.exitCode = 1;
});
