const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    validar, filtrarPeriodo, calcularMediaHistorica, criarDatasetReferencia, criarPontosDiarios
} = require("../public/scripts/dockerDashboard.js");

const pasta = path.join(__dirname, "../public/data/docker-historico");
const indice = JSON.parse(fs.readFileSync(path.join(pasta, "indice.json")));
const historico = indice.arquivos.map((arquivo) => validar(JSON.parse(fs.readFileSync(path.join(pasta, arquivo)))));
const java = historico.at(-1).containers.find((container) => container.nome === "api-java");
const metricas = {
    cpu: (c) => c.cpu?.uso,
    ram: (c) => c.memoria?.uso,
    pids: (c) => c.pids?.atuais
};
const perto = (atual, esperado) => assert.ok(Math.abs(atual - esperado) < 1e-10, `${atual} ≠ ${esperado}`);

test("12 JSONs Black Friday: CPU, RAM e PIDs em 30 e 7 dias", () => {
    assert.equal(historico.length, 12);
    assert.equal(indice.demonstracao, true);
    const esperados = {
        30: { cpu: 364 / 11, ram: 423 / 11, pids: 204 / 11 },
        7: { cpu: 43, ram: 281 / 6, pids: 21 }
    };
    for (const periodo of [30, 7]) {
        for (const [nome, ler] of Object.entries(metricas)) {
            const resultado = calcularMediaHistorica(filtrarPeriodo(historico, periodo), java, ler);
            perto(resultado.valor, esperados[periodo][nome]);
            assert.equal(resultado.dias, periodo === 30 ? 11 : 6);
            assert.equal(resultado.amostras, resultado.dias * 60);
            assert.equal(resultado.dataExcluida, "2026-11-29");
        }
    }
});

test("dia mais recente e períodos curtos não geram referência", () => {
    for (const periodo of [1, 2, 3]) {
        for (const ler of Object.values(metricas)) {
            assert.equal(calcularMediaHistorica(filtrarPeriodo(historico, periodo), java, ler), null);
        }
    }
    assert.equal(calcularMediaHistorica(filtrarPeriodo(historico, 4), java, metricas.cpu).dias, 3);
});

// Fixture pequena com pesos diferentes: os 12 JSONs têm 60 amostras por dia,
// portanto sozinhos não distinguiriam média simples de média ponderada.
const referencia = { nome: "api", container_id: "id-atual" };
const ler = (c) => c.medida;
function dia(numero, media, amostras_validas = 60) {
    return {
        data: `2026-11-${String(numero).padStart(2, "0")}`,
        containers: [{ ...referencia, medida: { media, amostras_validas } }]
    };
}
const ponderado = () => [dia(1, 10, 60), dia(2, 20, 5), dia(3, 30, 35), dia(4, 90, 1000)];

test("pondera as amostras e exclui o último dia válido, sem mutar o histórico", () => {
    const lista = ponderado().reverse();
    const original = structuredClone(lista);
    assert.deepEqual(calcularMediaHistorica(lista, referencia, ler), {
        valor: 17.5, dias: 3, amostras: 100, dataExcluida: "2026-11-04"
    });
    assert.deepEqual(lista, original);
});

test("ignora null, não finitos, strings, contêiner ausente e pesos inválidos", () => {
    const lista = [
        ...ponderado(), dia(5, null), dia(6, NaN), dia(7, Infinity), dia(8, "50"),
        dia(9, 50, 0), dia(10, 50, -1), dia(11, 50, null), dia(12, 50, "60"),
        dia(13, 50, NaN), dia(14, 50, Infinity),
        { data: "2026-11-15", containers: [] },
        { data: "2026-11-16", containers: [{ ...referencia }] }
    ];
    const resultado = calcularMediaHistorica(lista, referencia, ler);
    assert.equal(resultado.valor, 17.5);
    assert.equal(resultado.dataExcluida, "2026-11-04");
    assert.equal(resultado.dias, 3);
    assert.equal(calcularMediaHistorica([dia(1, 10), dia(2, null), dia(3, 30), dia(4, 90)], referencia, ler), null);
});

test("zero medido é válido e pode gerar uma referência igual a zero", () => {
    const lista = [dia(1, 0), dia(2, 0), dia(3, 0), dia(4, 90)];
    const resultado = calcularMediaHistorica(lista, referencia, ler);
    assert.equal(resultado.valor, 0);
    assert.ok(criarDatasetReferencia(lista, resultado).data.every((ponto) => ponto.y === 0));
});

test("troca de contêiner e recriação por nome respeitam a seleção", () => {
    const outro = historico.at(-1).containers.find((container) => container.nome === "mysql");
    for (const metrica of Object.values(metricas)) {
        assert.notEqual(calcularMediaHistorica(historico, java, metrica).valor,
            calcularMediaHistorica(historico, outro, metrica).valor);
    }
    const lista = ponderado();
    lista[0].containers[0].container_id = "id-antigo";
    lista.forEach((doc) => doc.containers.push({ nome: "outro", container_id: "outro", medida: { media: 1000, amostras_validas: 1000 } }));
    assert.equal(calcularMediaHistorica(lista, referencia, ler).valor, 17.5);
    assert.equal(calcularMediaHistorica(lista, { nome: "ausente", container_id: "ausente" }, ler), null);
});

test("um novo resumo recalcula a referência sem reutilizar o resultado anterior", () => {
    const lista = ponderado();
    const antes = calcularMediaHistorica(lista, referencia, ler);
    lista.push(dia(5, 99));
    const depois = calcularMediaHistorica(lista, referencia, ler);
    perto(depois.valor, (1750 + 90000) / 1100);
    assert.equal(depois.dias, 4);
    assert.equal(depois.dataExcluida, "2026-11-05");
    assert.equal(antes.valor, 17.5);
});

test("dataset discreto usa as mesmas datas sem preencher lacunas das medições", () => {
    const lista = [...ponderado(), dia(5, null)];
    const observados = criarPontosDiarios(lista, referencia, (c) => c.medida.media);
    const dataset = criarDatasetReferencia(lista, calcularMediaHistorica(lista, referencia, ler));
    assert.deepEqual(dataset.data.map((p) => p.x), observados.map((p) => p.x));
    assert.ok(dataset.data.every((p) => p.y === 17.5));
    assert.equal(observados.at(-1).y, null);
    assert.equal(dataset.label, "Média histórica");
    assert.equal(dataset.borderColor, "#888888");
    assert.deepEqual(dataset.borderDash, [6, 6]);
    assert.equal(dataset.pointRadius, 0);
    assert.equal(dataset.pointHoverRadius, 0);
    assert.equal(dataset.fill, false);
    assert.equal(criarDatasetReferencia(lista, null), null);
});
