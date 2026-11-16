const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const D = require("../public/scripts/dockerDashboard.js");

const referencia = { nome: "api", container_id: "id-1" };
const ler = (c) => c.contador;
function dia(numero, valor) {
    const data = `2026-11-${String(numero).padStart(2, "0")}`;
    return { data, containers: [{
        ...referencia, started_at: "2026-11-01T08:00:00-03:00",
        ultima_observacao: `${data}T22:00:00-03:00`,
        reinicios: { total: { ultimo_valor: 0 } },
        contador: { ultimo_valor: valor, amostras_validas: 60, ultimo_status: "ok" }
    }] };
}
const valores = (lista) => D.criarPontosIntervalos(lista, referencia, ler).map((p) => p.y);

test("diferenças, zero real e primeiro dia sem valor, sem mutar a entrada", () => {
    const lista = [dia(1, 100), dia(2, 150), dia(3, 150), dia(4, 210)];
    const copia = structuredClone(lista);
    assert.deepEqual(valores(lista), [null, 50, 0, 60]);
    assert.deepEqual(lista, copia);
    const ponto = D.criarPontosIntervalos(lista, referencia, ler, 10)[1];
    assert.equal(ponto.y, 5);
    assert.equal(ponto.inicio, "2026-11-01");
    assert.equal(ponto.fim, "2026-11-02");
});

test("não atravessa dias ausentes, contêiner ausente ou duplicação de data", () => {
    assert.deepEqual(valores([dia(1, 100), dia(3, 150), dia(4, 200)]), [null, null, 50]);
    assert.deepEqual(valores([dia(1, 100), { data: "2026-11-02", containers: [] }, dia(3, 200), dia(4, 250)]), [null, null, null, 50]);
    assert.deepEqual(valores([dia(1, 100), dia(1, 150), dia(2, 200)]), [null, null, 50]);
});

test("reset e recriação invalidam a transição, permitindo retomar no próximo par", () => {
    assert.deepEqual(valores([dia(1, 100), dia(2, 5), dia(3, 25)]), [null, null, 20]);
    const lista = [dia(1, 100), dia(2, 200), dia(3, 250)];
    lista[1].containers[0].container_id = lista[2].containers[0].container_id = "id-recriado";
    assert.deepEqual(valores(lista), [null, null, 50]);
    lista.forEach(d => { d.containers[0].container_id = ""; });
    assert.deepEqual(valores(lista), [null, null, null]);
});

test("reinício invalida delta mesmo se o contador já superou o valor anterior", () => {
    for (const campo of ["reinicios", "started_at"]) {
        const lista = [dia(1, 100), dia(2, 200), dia(3, 250)];
        for (const doc of lista.slice(1)) {
            doc.containers[0][campo] = campo === "reinicios"
                ? { total: { ultimo_valor: 1 } } : "2026-11-02T10:00:00-03:00";
        }
        assert.deepEqual(valores(lista), [null, null, 50]);
    }
});

test("valores inválidos, ausência de amostras e leitura indisponível não geram delta", () => {
    for (const valor of [null, undefined, NaN, Infinity, -1, "100"]) {
        assert.deepEqual(valores([dia(1, 50), dia(2, valor), dia(3, 200)]), [null, null, null]);
    }
    for (const amostras of [0, -1, null, undefined, NaN, Infinity, "60"]) {
        const lista = [dia(1, 50), dia(2, 100), dia(3, 200)];
        lista[1].containers[0].contador.amostras_validas = amostras;
        assert.deepEqual(valores(lista), [null, null, null]);
    }
    const lista = [dia(1, 50), dia(2, 100)];
    lista[1].containers[0].contador.ultimo_status = "indisponivel";
    assert.deepEqual(valores(lista), [null, null]);
});

test("observações repetidas, fora da data e metadados incompletos quebram continuidade", () => {
    for (const data of ["inválido", "2026-11-01T22:00:00-03:00", "2026-11-03T22:00:00-03:00", null]) {
        const lista = [dia(1, 100), dia(2, 200)];
        lista[1].containers[0].ultima_observacao = data;
        assert.deepEqual(valores(lista), [null, null]);
    }
    for (const campo of ["started_at", "reinicios"]) {
        const lista = [dia(1, 100), dia(2, 200)];
        delete lista[1].containers[0][campo];
        assert.deepEqual(valores(lista), [null, null]);
    }
});

test("média exige três intervalos anteriores, exclui última data e respeita filtro", () => {
    const lista = [dia(1, 0), dia(2, 10), dia(3, 30), dia(4, 60), dia(5, 160)];
    const pontos = D.criarPontosIntervalos(lista, referencia, ler);
    assert.deepEqual(D.calcularMediaIntervalos(pontos), { valor: 20, intervalos: 3 });
    assert.equal(D.calcularMediaIntervalos(pontos.slice(0, 4)), null);
    // Última data sem leitura não transforma o penúltimo intervalo em "atual".
    lista[4].containers[0].contador.ultimo_valor = null;
    assert.equal(D.calcularMediaIntervalos(D.criarPontosIntervalos(lista, referencia, ler)).valor, 20);
    const filtrado = D.filtrarPeriodo(lista, 4);
    assert.equal(D.criarPontosIntervalos(filtrado, referencia, ler)[0].y, null);
    assert.equal(D.calcularMediaIntervalos(D.criarPontosIntervalos(filtrado, referencia, ler)), null);
    assert.equal(D.calcularMediaIntervalos([]), null);
});

test("referências por série são independentes e zero não conta como medição", () => {
    const lista = [dia(1, 0), dia(2, 0), dia(3, 0), dia(4, 0), dia(5, 10)];
    const pontos = D.criarPontosIntervalos(lista, referencia, ler);
    const series = [{ nome: "RX", pontos }, { nome: "TX", pontos: pontos.map(p => ({ ...p, y: null })) }];
    const refs = D.criarReferenciasIntervalos(lista, series, true);
    assert.deepEqual(refs.map(s => s.label), ["Média histórica · RX", "Referência · zero segundo"]);
    assert.ok(refs.every(s => s.pointRadius === 0 && s.data.every(p => p.y === 0)));
    assert.deepEqual(refs[0].borderDash, [2, 5]);
    assert.equal(refs[1].referenciaComparativa, true);
});

test("12 JSONs: conversão de cinco contadores, referências e reinício no dia 28", () => {
    const pasta = path.join(__dirname, "../public/data/docker-historico");
    const indice = JSON.parse(fs.readFileSync(path.join(pasta, "indice.json")));
    const lista = indice.arquivos.map(f => D.validar(JSON.parse(fs.readFileSync(path.join(pasta, f)))));
    const java = lista.at(-1).containers.find(c => c.nome === "api-java");
    const pagamento = lista.at(-1).containers.find(c => c.nome === "pay-api-04");
    const metricas = [
        [c => c.rede.recebidos, 1048576, 64.35], [c => c.rede.enviados, 1048576, 49.625],
        [c => c.disco.leitura_acumulada, 1048576, 39.9], [c => c.disco.escrita_acumulada, 1048576, 28.175],
        [c => c.cpu.tempo_throttled, 1e9, 0.39]
    ];
    for (const [leitor, divisor, esperado] of metricas) {
        const pontos = D.criarPontosIntervalos(lista, java, leitor, divisor);
        assert.equal(pontos.filter(p => p.y !== null).length, 11);
        assert.ok(Math.abs(D.calcularMediaIntervalos(pontos).valor - esperado) < 1e-8);
        const outros = D.criarPontosIntervalos(lista, pagamento, leitor, divisor);
        assert.equal(outros[10].y, null);
        assert.notEqual(outros[11].y, null);
        assert.equal(D.calcularMediaIntervalos(outros).intervalos, 9);
        assert.equal(D.calcularMediaIntervalos(D.criarPontosIntervalos(D.filtrarPeriodo(lista, 7), java, leitor, divisor)).intervalos, 5);
        assert.deepEqual(D.criarPontosIntervalos(D.filtrarPeriodo(lista, 1), java, leitor, divisor).map(p => p.y), [null]);
    }
});
