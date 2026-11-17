const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const D = require("../public/scripts/dockerDashboard.js");
const pasta = path.join(__dirname, "../public/data/docker-horario");
const indice = JSON.parse(fs.readFileSync(path.join(pasta, "indice.json")));
const historico = indice.arquivos.map((nome) => D.validar(JSON.parse(fs.readFileSync(path.join(pasta, nome)))));

test("janela móvel contém 24 resumos horários e atravessa a meia-noite", () => {
    const janela = D.filtrar24Horas(historico);
    assert.equal(historico.length, 48);
    assert.equal(janela.length, 24);
    assert.equal(new Set(janela.map((doc) => doc.data)).size, 2);
    const fim = Date.parse(historico[35].intervalo.fim);
    assert.equal(D.filtrar24Horas(historico, fim).at(-1), historico[35]);
    assert.equal(D.filtrar24Horas(historico, fim).length, 24);
});

test("gráficos têm pontos horários distintos e preservam lacunas e reinícios", () => {
    const janela = D.filtrar24Horas(historico);
    const c = janela.at(-1).containers[1];
    const pontos = D.criarPontosDiarios(janela, c, (v) => v.cpu.uso.media);
    assert.equal(new Set(pontos.map((p) => p.x)).size, 24);
    assert.ok(new Set(pontos.map((p) => p.y)).size > 1);
    const rede = D.criarPontosIntervalos(janela, c, (v) => v.rede.recebidos);
    assert.equal(rede[0].y, null);
    assert.equal(rede[12].y, null); // Reinício na hora 36.
    assert.ok(rede[13].y > 0);
    const lacuna = D.criarPontosIntervalos([janela[0], janela[2]], c, (v) => v.rede.recebidos);
    assert.equal(lacuna[1].y, null);
});

test("KPIs contam falha uma vez, reinício e logs dentro da janela selecionada", () => {
    const janela = D.filtrar24Horas(historico);
    const c = janela.at(-1).containers[1];
    assert.equal(D.contarFalhas(janela, c), 1);
    assert.equal(D.reiniciosDetectados(janela, c), 1);
    assert.ok(D.contarErros(janela, c) > 0);
    assert.equal(D.contarFalhas(janela, janela.at(-1).containers[0]), 0);
    const repetido = structuredClone(janela);
    repetido[12].containers[1].finished_at = repetido[11].containers[1].finished_at;
    repetido[12].containers[1].exit_code = 1;
    assert.equal(D.contarFalhas(repetido, c), 1);
});
