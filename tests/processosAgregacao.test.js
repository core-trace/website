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
assert.equal(serieRamVazia[1].rssBytes, null, "RSS ausente não vira zero");
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
    amostra(em(13, 0), 10, 40, { rssBytes: 1073741824 }),
    amostra(em(13, 30), 10, 45, { rssBytes: 1610612736 }),
    amostra(em(13, 45), 10, 99, { memoriaValida: false, rssBytes: 999 }),
    amostra(em(13, 59), 10, 50, { rssBytes: 2147483648 })
];
const serieRam = ag.seriePorIntervalo(amostrasRam, 60, "memoria");
assert.equal(serieRam.length, 1);
assert.equal(serieRam[0].v, 50, "usa a última leitura válida, não a inválida posterior");
assert.equal(serieRam[0].rssBytes, 2147483648, "RSS acompanha a mesma última leitura válida");
assert.equal(serieRam[0].t, new Date(em(13, 59)).toISOString());
assert.ok(serieRam.every((ponto, i) => i === 0 || Date.parse(ponto.t) >= Date.parse(serieRam[i - 1].t)));
const semMemoria = ag.seriePorIntervalo(
    [amostra(em(13, 0), 10, 0, { memoriaValida: false, rssBytes: 123 })], 60, "memoria"
)[0];
assert.equal(semMemoria.v, null);
assert.equal(semMemoria.rssBytes, null, "leitura inválida não fornece RSS");

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

// 11. Agrupamento visual: reduz densidade sem inventar valores.
assert.equal(ag.MAX_INTERVALOS_VISUAIS, 40);
const muitasAmostras = [];
for (let i = 0; i < 165; i++) {
    muitasAmostras.push(amostra(em(13, 0) + i * HORA, i % 100, 30 + (i % 20), {
        rssBytes: (512 + (i % 10) * 128) * 1024 * 1024
    }));
}
const historicoGrande = ag.prepararHistorico(muitasAmostras, 10080);
assert.equal(historicoGrande.passoMinutos, 60);
const visualGrande = ag.agruparParaExibicao(
    historicoGrande.cpu.distribuicao,
    historicoGrande.memoria.pontos,
    60
);
assert.equal(visualGrande.fator, 5, "165 intervalos com dados usam fator 5");
assert.equal(visualGrande.passoMinutos, 300, "passo visual de 5 horas");
assert.equal(visualGrande.distribuicao.length, 33);
assert.equal(visualGrande.pontos.length, 33);
assert.ok(visualGrande.distribuicao.length <= ag.MAX_INTERVALOS_VISUAIS);

const somaAcimaOriginal = historicoGrande.cpu.distribuicao
    .reduce((soma, bucket) => soma + bucket.temposMs.acima75, 0);
const somaAcimaVisual = visualGrande.distribuicao
    .reduce((soma, bucket) => soma + bucket.temposMs.acima75, 0);
assert.equal(somaAcimaVisual, somaAcimaOriginal, "tempo acima de 75% preservado");
const observadoOriginal = historicoGrande.cpu.distribuicao
    .reduce((soma, bucket) => soma + bucket.observadoMs, 0);
const observadoVisual = visualGrande.distribuicao
    .reduce((soma, bucket) => soma + bucket.observadoMs, 0);
assert.equal(observadoVisual, observadoOriginal, "tempo observado preservado");

for (const bucket of visualGrande.distribuicao) {
    assert.equal(
        Object.values(bucket.temposMs).reduce((soma, valor) => soma + valor, 0),
        bucket.observadoMs,
        "faixas do bloco somam o tempo observado do bloco"
    );
    assert.equal(bucket.observadoMs + bucket.semDadoMs, bucket.fim - bucket.inicio);
    if (bucket.observadoMs > 0) {
        const soma = Object.values(bucket.proporcoes).reduce((total, valor) => total + valor, 0);
        assert.equal(soma, 1, "proporções do bloco somam 1");
    }
}

for (let i = 0; i < visualGrande.pontos.length; i++) {
    const fatia = historicoGrande.memoria.pontos
        .slice(i * 5, i * 5 + 5)
        .filter(ponto => ponto.v != null);
    const ultima = fatia[fatia.length - 1] || null;
    assert.equal(visualGrande.pontos[i].v, ultima ? ultima.v : null,
        "bloco de RAM mantém a última leitura válida");
    assert.equal(visualGrande.pontos[i].rssBytes, ultima ? ultima.rssBytes : null,
        "RSS do bloco acompanha a última leitura válida");
}

// 12. Poucos intervalos com dados não são agrupados.
const visualCurto = ag.agruparParaExibicao(
    historicoGrande.cpu.distribuicao.slice(0, 3),
    historicoGrande.memoria.pontos.slice(0, 3),
    60
);
assert.equal(visualCurto.fator, 1);
assert.equal(visualCurto.distribuicao.length, 3);
assert.equal(visualCurto.pontos.length, 3);

// 13. Bloco inteiro sem leitura continua sendo lacuna, não zero.
const pontosComLacunaVisual = [
    { inicio: 0, fim: MIN, t: null, v: null, rssBytes: null },
    { inicio: MIN, fim: 2 * MIN, t: null, v: null, rssBytes: null },
    { inicio: 2 * MIN, fim: 3 * MIN, t: new Date(em(13, 2)).toISOString(), v: 42, rssBytes: 123 },
    { inicio: 3 * MIN, fim: 4 * MIN, t: new Date(em(13, 3)).toISOString(), v: 43, rssBytes: 456 }
];
const visualLacuna = ag.agruparParaExibicao(
    historicoGrande.cpu.distribuicao.slice(0, 2),
    pontosComLacunaVisual,
    60,
    1
);
assert.equal(visualLacuna.fator, 2);
assert.equal(visualLacuna.pontos[0].v, null);
assert.equal(visualLacuna.pontos[0].rssBytes, null);
assert.equal(visualLacuna.pontos[1].v, 43);

console.log("processosAgregacao: todos os testes passaram.");
