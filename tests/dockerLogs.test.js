const { test } = require("node:test");
const assert = require("node:assert/strict");
const A = require("../public/scripts/dockerAnalise.js");

const log = (data, nivel = "INFO", mensagem = "Mensagem original") => ({ timestamp: Date.parse(data), nivel, mensagem });
const lista = [
    log("2026-11-17T23:59:59.999-03:00"),
    log("2026-11-18T00:00:00.000-03:00", "WARN", "Recurso lento"),
    log("2026-11-18T14:20:59.999-03:00", "ERROR", "Falha original\nsegunda linha <b>texto</b>"),
    log("2026-11-18T14:21:00.000-03:00")
];

test("últimas 24 horas usa relógio real ou o último log da simulação", () => {
    const agora = Date.parse("2026-12-01T12:00:00Z");
    const real = A.ultimas24HorasLogs(lista, false, agora);
    assert.deepEqual(real, { inicio: agora - 86400000, fim: agora });
    const simulado = A.ultimas24HorasLogs(lista, true, agora);
    assert.equal(simulado.fim, lista.at(-1).timestamp);
    assert.equal(simulado.fim - simulado.inicio, 86400000);
    assert.deepEqual(A.ultimas24HorasLogs([], true, agora), real);
});

test("período dos logs usa Brasília e inclui o minuto final completo", () => {
    const periodo = A.periodoLogs("2026-11-18T00:00", "2026-11-18T14:20");
    assert.equal(periodo.inicio, Date.parse("2026-11-18T03:00:00Z"));
    assert.equal(periodo.fim, Date.parse("2026-11-18T17:20:59.999Z"));
    assert.deepEqual(A.filtrarLogs(lista, periodo), [lista[2], lista[1]]);
    assert.deepEqual(A.filtrarLogs(lista, A.periodoLogs("2026-11-18T14:20", "2026-11-18T14:20")), [lista[2]]);
});

test("limites opcionais permitem histórico completo ou intervalo aberto", () => {
    assert.equal(A.filtrarLogs(lista, A.periodoLogs("", "")).length, 4);
    assert.equal(A.filtrarLogs(lista, A.periodoLogs("2026-11-18T00:00", "")).length, 3);
    assert.equal(A.filtrarLogs(lista, A.periodoLogs("", "2026-11-17T23:59")).length, 1);
});

test("datas inválidas e invertidas não são normalizadas silenciosamente", () => {
    for (const [inicio, fim] of [["2026-11-18T14:21", "2026-11-18T14:20"], ["2026-02-30T10:00", ""], ["inválido", ""], ["", "2026-11-18T25:10"]]) {
        assert.throws(() => A.periodoLogs(inicio, fim));
    }
});

test("período combina com nível, conteúdo e ordenação sem alterar mensagens", () => {
    const copia = structuredClone(lista);
    const periodo = A.periodoLogs("2026-11-18T00:00", "2026-11-18T14:21");
    assert.deepEqual(A.filtrarLogs(lista, { ...periodo, nivel: "error", busca: "ORIGINAL" }), [lista[2]]);
    assert.deepEqual(A.filtrarLogs(lista, { ...periodo, maisRecentes: false }), lista.slice(1));
    assert.deepEqual(lista, copia);
    assert.equal(A.filtrarLogs(lista, { busca: "ausente" }).length, 0);
});
