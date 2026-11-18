const { test } = require("node:test");
const assert = require("node:assert/strict");
const A = require("../public/scripts/dockerAnalise.js");
const fim = Date.parse("2026-11-17T14:30:00-03:00");
const iso = (t) => new Date(t).toISOString();
const ref = { container_id: "api-1", nome: "api" };
function resumo(minuto, bytes, opcoes = {}) {
    const t = fim + minuto * 60000;
    return {
        data: "2026-11-17", intervalo: { inicio: iso(t - 60000), fim: iso(t) },
        containers: [{ ...ref, status: "running", started_at: "2026-11-15T00:00:00Z", ultima_observacao: iso(t),
            reinicios: { total: { ultimo_valor: 2 } }, cpu: { uso: { media: 20, maximo: 35 } },
            memoria: { uso: { maximo: 55 } },
            rede: { recebidos: { ultimo_valor: bytes, amostras_validas: 1, ultimo_status: "ok" } }, ...opcoes }],
        logs: [{ ...ref, niveis: { error: { total_observado: 1 } } }], eventos: []
    };
}
const lista = Array.from({ length: 62 }, (_, i) => resumo(i - 61, i * 120 * 1048576));

test("intervalos anterior e atual são adjacentes, completos e não duplicam a fronteira", () => {
    const inicio = fim - 30 * 60000;
    const atual = A.indicadores(lista, inicio, fim);
    const anterior = A.indicadores(lista, inicio - 30 * 60000, inicio);
    assert.equal(atual.errosLogs, 30);
    assert.equal(anterior.errosLogs, 30);
    assert.equal(atual.reiniciosNoPeriodo, 0);
    assert.equal(atual.falhasConhecidas, 0);
    assert.equal(atual.picoCpu.valor, 35);
    assert.equal(A.janela(lista, inicio, fim).length, 30);
});

test("resumo de uma hora não é dividido artificialmente em 30 minutos", () => {
    const doc = resumo(0, 100);
    doc.intervalo.inicio = iso(fim - 3600000);
    const resultado = A.indicadores([doc], fim - 1800000, fim);
    assert.equal(resultado.completo, false);
    assert.equal(resultado.errosLogs, null);
    assert.equal(resultado.falhasConhecidas, null);
    assert.equal(A.pontos([doc], ref, (c) => c.cpu.uso.media, fim - 1800000, fim).length, 0);
});

test("estado em falha anterior ao período não é uma falha nova; OOM e saída são deduplicados", () => {
    const docs = structuredClone(lista);
    docs.forEach((d) => Object.assign(d.containers[0], { status: "exited", exit_code: 1, oom_killed: true, finished_at: iso(fim - 40 * 60000) }));
    assert.equal(A.indicadores(docs, fim - 30 * 60000, fim).falhasConhecidas, 0);
    docs.forEach((d) => { d.containers[0].finished_at = iso(fim - 10 * 60000); });
    assert.equal(A.indicadores(docs, fim - 30 * 60000, fim).falhasConhecidas, 1);
});

test("taxas dividem delta de bytes pelo tempo real e interrompem reinícios, resets e lacunas", () => {
    const ler = (c) => c.rede.recebidos;
    assert.equal(A.taxas(lista, ref, ler, fim - 30 * 60000, fim)[0].y, 2);
    const docs = structuredClone(lista);
    docs.at(-1).containers[0].reinicios.total.ultimo_valor = 3;
    assert.equal(A.taxas(docs, ref, ler, fim - 30 * 60000, fim).at(-1).y, null);
    docs.at(-1).containers[0].reinicios.total.ultimo_valor = 2;
    docs.at(-1).containers[0].rede.recebidos.ultimo_valor = 0;
    assert.equal(A.taxas(docs, ref, ler, fim - 30 * 60000, fim).at(-1).y, null);
    const lacuna = lista.filter((_, i) => i !== 60);
    assert.equal(A.taxas(lacuna, ref, ler, fim - 30 * 60000, fim).at(-1).y, null);
    assert.equal(A.cobertura(lacuna, fim - 30 * 60000, fim), false);
    assert.ok(A.pontos(lacuna, ref, (c) => c.cpu.uso.media, fim - 30 * 60000, fim).some((p) => p.y === null));
});

test("logs e eventos exigem registros originais e isolam IDs mesmo com nome igual", () => {
    const doc = resumo(0, 100);
    assert.deepEqual(A.registros([doc], "logs", ref), []);
    doc.logs[0].registros = [{ timestamp: iso(fim), nivel: "ERROR", mensagem: "<script>original</script>" }];
    doc.logs.push({ container_id: "outro-id", nome: "api", timestamp: iso(fim), nivel: "INFO", mensagem: "outro container" });
    doc.eventos = [{ ...ref, registros: [{ timestamp: iso(fim), tipo: "restart", descricao: "Implantação" }] }];
    assert.equal(A.registros([doc, doc], "logs", ref).length, 1);
    assert.equal(A.registros([doc], "logs", ref)[0].mensagem, "<script>original</script>");
    assert.equal(A.registros([doc], "eventos", ref)[0].tipo, "restart");
});

test("marcas do eixo preservam início e fim exatos em todos os filtros", () => {
    for (const minutos of [30, 60, 1440]) {
        const inicio = fim - minutos * 60000;
        const eixo = A.eixo(inicio, fim);
        assert.equal(eixo[0], inicio);
        assert.equal(eixo.at(-1), fim);
        assert.ok(eixo.every((v, i) => i === 0 || v > eixo[i - 1]));
    }
});

test("erros confirmados continuam visíveis com níveis desconhecidos, sem comparação completa", () => {
    const docs = structuredClone(lista);
    docs.at(-1).logs[0].niveis.unknown = { total_observado: 5 };
    const resultado = A.indicadores(docs, fim - 30 * 60000, fim);
    assert.equal(resultado.errosLogs, 30);
    assert.equal(resultado.errosCompletos, false);
    docs.forEach((d) => { d.logs[0].niveis.error.total_observado = 0; });
    assert.equal(A.indicadores(docs, fim - 30 * 60000, fim).errosLogs, null);
});

test("sem leitura inicial reinícios ficam indisponíveis, não são confundidos com zero", () => {
    const inicio = fim - 30 * 60000;
    const semBase = lista.filter((d) => A.intervalo(d).fim > inicio);
    const resultado = A.indicadores(semBase, inicio, fim);
    assert.equal(resultado.completo, true);
    assert.equal(resultado.reiniciosNoPeriodo, null);
});
