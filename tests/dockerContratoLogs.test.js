const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const D = require("../public/scripts/dockerDashboard.js");
const A = require("../public/scripts/dockerAnalise.js");
const raiz = path.join(__dirname, "../public/data");
const documentos = ["docker-historico", "docker-horario"].flatMap((pasta) => {
    const indice = JSON.parse(fs.readFileSync(path.join(raiz, pasta, "indice.json")));
    return indice.arquivos.map((nome) => JSON.parse(fs.readFileSync(path.join(raiz, pasta, nome))));
});

test("60 JSONs seguem o contrato: mensagens na raiz e contagens consistentes por nível", () => {
    assert.equal(documentos.length, 60);
    for (const doc of documentos) {
        assert.equal(doc.dados_simulados, true);
        assert.ok(doc.logs.length > 0);
        assert.equal(new Set(doc.logs.map((r) => r.id_captura)).size, doc.logs.length);
        for (const registro of doc.logs) {
            assert.deepEqual(Object.keys(registro).sort(), ["timestamp", "container_id", "nome", "nivel", "mensagem", "id_captura"].sort());
            assert.match(registro.id_captura, /^[a-f0-9]{64}$/);
            assert.ok(Date.parse(registro.timestamp) > Date.parse(doc.resumos.inicio));
            assert.ok(Date.parse(registro.timestamp) <= Date.parse(doc.resumos.fim));
        }
        for (const resumo of doc.resumos.logs) {
            const linhas = doc.logs.filter((r) => r.container_id === resumo.container_id);
            assert.equal(linhas.length, resumo.total.total_observado);
            assert.equal(linhas.length, resumo.total.amostras_validas);
            for (const [nivel, medida] of Object.entries(resumo.niveis)) {
                assert.equal(linhas.filter((r) => r.nivel.toLowerCase() === nivel).length, medida.total_observado);
            }
        }
    }
});

test("diário e horário compartilham capturas sem duplicar o terminal", () => {
    const normalizados = documentos.map(D.validar);
    const c = normalizados.at(-1).containers[0];
    const ids = new Set(documentos.flatMap((d) => d.logs).filter((r) => r.container_id === c.container_id).map((r) => r.id_captura));
    assert.equal(A.registros(normalizados, "logs", c).length, ids.size);
    const diarios = new Map(documentos.filter((d) => !d.intervalo).flatMap((d) => d.logs).map((r) => [r.id_captura, r]));
    for (const h of documentos.filter((d) => d.intervalo)) for (const registro of h.logs) {
        assert.deepEqual(diarios.get(registro.id_captura), registro);
    }
});

test("contrato real preserva UNKNOWN, mensagem nula e capturas distintas no mesmo milissegundo", () => {
    const c = { container_id: "id-1", nome: "api-java" };
    const doc = { schema_version: 1, tipo_documento: "resumo_diario", data: "2026-11-08",
        resumos: { containers: [c], logs: [{ ...c, niveis: { unknown: { total_observado: 2 } } }] },
        logs: [
            { ...c, id_captura: "a", timestamp: "2026-11-08T22:06:07.246066879Z", nivel: "UNKNOWN", mensagem: "Erro de configuração" },
            { ...c, id_captura: "b", timestamp: "2026-11-08T22:06:07.246128906Z", nivel: "UNKNOWN", mensagem: null }
        ] };
    const d = D.validar(doc);
    const registros = A.registros([d, d], "logs", c);
    assert.equal(registros.length, 2);
    assert.equal(registros[0].timestampOriginal, doc.logs[0].timestamp);
    assert.equal(registros[1].mensagem, null);
    assert.equal(D.resumoLog(d.logs[0]).erros, null);
    assert.equal(A.filtrarLogs(registros, { busca: "erro" }).length, 1);
});
