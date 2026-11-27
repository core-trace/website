/*
 * Testes da transformação de históricos de processos.
 * Execução: node tests/processosAgregacao.test.js
 */
const assert = require("node:assert/strict");
const ag = require("../public/scripts/processosAgregacao.js");

const MIN = 60000;
const HORA = 60 * MIN;
const em = (hora, minuto = 0) => Date.parse(`2026-11-27T${hora}:${String(minuto).padStart(2, "0")}:00Z`);

function amostra(tempo, cpu, memoria = 10, extra = {}) {
    return {
        timestamp: new Date(tempo).toISOString(),
        pid: 1,
        nome: "app",
        cpu,
        memoria,
        valido: true,
        memoriaValida: true,
        ...extra
    };
}

function conferirConsistencia(buckets, minutos) {
    const largura = minutos * MIN;
    for (const bucket of buckets) {
        assert.equal(bucket.fim - bucket.inicio, largura);
        assert.equal(
            Object.values(bucket.temposMs).reduce((a, b) => a + b, 0),
            bucket.observadoMs,
            "tempos por faixa somam o tempo observado"
        );
        assert.equal(bucket.observadoMs + bucket.semDadoMs, largura, "observado + lacuna = intervalo");
        assert.ok(bucket.observadoMs >= 0 && bucket.semDadoMs >= 0);
        if (bucket.observadoMs === 0) {
            assert.equal(bucket.proporcoes, null, "sem dados não produz proporção");
        } else {
            const soma = Object.values(bucket.proporcoes).reduce((a, b) => a + b, 0);
            assert.equal(soma, 1, "proporções somam exatamente 1 do tempo observado");
            assert.ok(Object.values(bucket.proporcoes).every(p => p >= 0 && p <= 1));
        }
    }
}

// 1. Granularidade adaptativa (o filtro de 30 dias não existe na página).
assert.equal(ag.granularidadePara(60), 1);
assert.equal(ag.granularidadePara(360), 5);
assert.equal(ag.granularidadePara(1440), 15);
assert.equal(ag.granularidadePara(10080), 60);
assert.equal(ag.granularidadePara(43200), null);

// 2. Capturas regulares: cada leitura representa 1 minuto, sem lacuna.
const regulares = [];
for (let i = 0; i < 60; i++) {
    const faixas = [10, 30, 60, 90];
    regulares.push(amostra(em(13, 0) + i * MIN, faixas[i % 4]));
}
const distribuicaoRegular = ag.distribuicaoCpuPorIntervalo(regulares, 60);
assert.equal(distribuicaoRegular.length, 1);
assert.equal(distribuicaoRegular[0].observadoMs, HORA);
assert.equal(distribuicaoRegular[0].semDadoMs, 0);
assert.deepEqual(distribuicaoRegular[0].temposMs, {
    ate25: 15 * MIN, ate50: 15 * MIN, ate75: 15 * MIN, acima75: 15 * MIN
});
conferirConsistencia(distribuicaoRegular, 60);

// 3. Intervalos irregulares: a lacuna não é atribuída à leitura antiga.
const irregulares = [
    amostra(em(13, 0), 10),
    amostra(em(13, 1), 30),
    amostra(em(13, 10), 60),
    amostra(em(13, 11), 90)
];
const distribuicaoIrregular = ag.distribuicaoCpuPorIntervalo(irregulares, 60);
assert.equal(distribuicaoIrregular[0].observadoMs, 4 * MIN);
assert.equal(distribuicaoIrregular[0].semDadoMs, HORA - 4 * MIN);
assert.deepEqual(distribuicaoIrregular[0].temposMs, {
    ate25: MIN, ate50: MIN, ate75: MIN, acima75: MIN
});
assert.ok(distribuicaoIrregular[0].semDadoMs > 0, "lacuna de coleta permanece explícita");
conferirConsistencia(distribuicaoIrregular, 60);

// Limite do intervalo: a leitura das 10:59 não cobre o intervalo seguinte.
const limiteIntervalo = [
    amostra(em(13, 59), 10),
    amostra(em(14, 5), 90)
];
const bucketsLimite = ag.distribuicaoCpuPorIntervalo(limiteIntervalo, 60);
assert.equal(bucketsLimite[0].observadoMs, MIN, "última leitura para no fim do intervalo");
assert.equal(bucketsLimite[1].observadoMs, 6 * MIN, "a leitura cobre apenas a duração típica");
assert.equal(bucketsLimite[1].semDadoMs, HORA - 6 * MIN, "lacuna inicial do intervalo");
conferirConsistencia(bucketsLimite, 60);

// 4. Valores nulos e leituras inválidas viram lacuna, nunca "baixo consumo".
const comNulos = [
    amostra(em(13, 0), null),
    amostra(em(13, 1), 10),
    amostra(em(13, 2), 80, 10, { valido: false }),
    amostra(em(13, 3), null)
];
const distribuicaoNulos = ag.distribuicaoCpuPorIntervalo(comNulos, 60);
assert.equal(distribuicaoNulos[0].observadoMs, MIN);
assert.equal(distribuicaoNulos[0].temposMs.ate25, MIN);
assert.equal(distribuicaoNulos[0].temposMs.acima75, 0);
assert.equal(distribuicaoNulos[0].semDadoMs, HORA - MIN);
conferirConsistencia(distribuicaoNulos, 60);

// 5. Intervalo sem amostras não é exibido como período de baixo consumo.
const comLacuna = [amostra(em(13, 0), 10), amostra(em(15, 0), 90)];
const bucketsVazios = ag.distribuicaoCpuPorIntervalo(comLacuna, 60);
assert.equal(bucketsVazios.length, 3);
assert.equal(bucketsVazios[1].observadoMs, 0);
assert.equal(bucketsVazios[1].semDadoMs, HORA);
assert.equal(bucketsVazios[1].proporcoes, null);
const serieRamVazia = ag.seriePorIntervalo(comLacuna, 60, "memoria");
assert.equal(serieRamVazia[1].v, null, "RAM ausente não vira zero");
conferirConsistencia(bucketsVazios, 60);

// 6. Limites das faixas e CPU acima de 100% (multinúcleo).
const limites = [0, 25, 25.0001, 50, 50.1, 75, 75.1, 150];
const amostrasLimite = limites.map((valor, i) => amostra(em(13, 0) + i * MIN, valor));
const distLimites = ag.distribuicaoCpuPorIntervalo(amostrasLimite, 60);
assert.deepEqual(distLimites[0].temposMs, {
    ate25: 2 * MIN, ate50: 2 * MIN, ate75: 2 * MIN, acima75: 2 * MIN
});
assert.equal(distLimites[0].proporcoes.acima75, 0.25);
conferirConsistencia(distLimites, 60);

// 7. Limites temporais e fuso horário (13:00Z = 10:00 em São Paulo).
assert.equal(ag.inicioDoIntervalo("2026-11-27T13:59:59Z", 60), em(13, 0));
assert.equal(ag.inicioDoIntervalo("2026-11-27T14:00:00Z", 60), em(14, 0));
assert.equal(ag.inicioDoIntervalo("2026-11-27T13:07:00Z", 15), em(13, 0));
assert.equal(ag.inicioDoIntervalo("2026-11-27T13:16:00Z", 15), em(13, 15));

// 8. RAM: última leitura válida, unidade original e ordem cronológica.
const amostrasRam = [
    amostra(em(13, 0), 10, 40),
    amostra(em(13, 30), 10, 45),
    amostra(em(13, 45), 10, 99, { memoriaValida: false }),
    amostra(em(13, 59), 10, 50)
];
const serieRam = ag.seriePorIntervalo(amostrasRam, 60, "memoria");
assert.equal(serieRam.length, 1);
assert.equal(serieRam[0].v, 50, "usa a última leitura válida, não a inválida posterior");
assert.equal(serieRam[0].t, new Date(em(13, 59)).toISOString());
assert.ok(serieRam.every((ponto, i) => i === 0 || Date.parse(ponto.t) >= Date.parse(serieRam[i - 1].t)));
assert.equal(ag.seriePorIntervalo([amostra(em(13, 0), 10, 0, { memoriaValida: false })], 60, "memoria")[0].v, null);

// 9. Seleção de processos diferentes: cada chamada recebe só as amostras do processo.
const processoA = [amostra(em(13, 0), 10, 20, { pid: 10, nome: "app" })];
const processoB = [amostra(em(13, 0), 70, 80, { pid: 20, nome: "worker" })];
const historicoA = ag.prepararHistorico(processoA, 60);
const historicoB = ag.prepararHistorico(processoB, 60);
assert.equal(historicoA.cpu.pontos[0].v, 10);
assert.equal(historicoB.cpu.pontos[0].v, 70);
assert.equal(historicoB.memoria.pontos[0].v, 80);
assert.equal(historicoA.passoMinutos, 1, "período de 1 hora usa passo de 1 minuto");

// 10. Intervalos vazios não viram zero nem geram ponto de variação.
const comBuraco = [
    { t: new Date(em(13, 0)).toISOString(), v: 10 },
    { t: new Date(em(13, 1)).toISOString(), v: null },
    { t: new Date(em(13, 2)).toISOString(), v: 30 },
    { t: new Date(em(13, 3)).toISOString(), v: 40 }
];
assert.deepEqual(ag.serieVariacao(comBuraco), [
    { t: new Date(em(13, 2)).toISOString(), v: 20 },
    { t: new Date(em(13, 3)).toISOString(), v: 10 }
]);

console.log("processosAgregacao: todos os testes passaram.");
