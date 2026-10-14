const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const contexto = vm.createContext({});
vm.runInContext(readFileSync(path.join(__dirname, '../public/scripts/monitoramentoMock.js'), 'utf8'), contexto);
const mock = vm.runInContext('monitoramentoMock', contexto);

test('trocar o período recorta os mesmos dados e preserva a última coleta', () => {
    const completo = mock.historico('cpu', 30);
    const recente = mock.historico('cpu', 15);
    assert.equal(completo.rotulos.length, 31);
    assert.equal(recente.rotulos.length, 16);
    assert.equal(completo.rotulos[0], '14:02');
    assert.equal(recente.rotulos[0], '14:17');
    assert.equal(recente.rotulos.at(-1), '14:32');
    assert.deepEqual(recente.cpu, completo.cpu.slice(-16));
    assert.equal(recente.cpu.at(-1), 97);
    assert.equal(recente.ram.at(-1), 72);
    for (const serie of recente.nucleos) assert.equal(serie.length, 16);
    for (const disco of recente.discos) {
        for (const campo of ['leitura', 'escrita', 'latenciaLeitura', 'latenciaEscrita', 'fila']) {
            assert.equal(disco[campo].length, 16);
        }
    }
    for (const rede of recente.redes) {
        for (const campo of ['recebimento', 'envio', 'errosEntrada', 'errosSaida', 'descartesEntrada', 'descartesSaida']) {
            assert.equal(rede[campo].length, 16);
        }
    }
});

test('a contagem de OOM considera somente os eventos do período selecionado', () => {
    assert.equal(mock.historico('cpu', 30).oom.length, 2);
    const recente = mock.historico('cpu', 15);
    assert.equal(recente.oom.length, 1);
    assert.equal(recente.oom[0], '14:29');
});

test('as séries e o resumo correspondem ao servidor selecionado', () => {
    for (const id of [1, 2]) {
        const servidor = mock.aplicar({ id_servidor: id, nome: 'Servidor', id_perfil_servidor: 1, nome_perfil: 'Perfil' });
        const historico = mock.historico(servidor.modelo, 30);
        assert.equal(`${historico.cpu.at(-1)}%`, servidor.cpu);
        assert.equal(`${historico.ram.at(-1)}%`, servidor.ram);
        const cenario = mock.cenario(servidor.modelo);
        assert.equal(cenario.containers.filter(item => item.estado === 'Executando').length, parseInt(servidor.docker));
        assert.ok(cenario.containers.some(item => item.estado === 'Parado'));
    }
});

test('períodos inválidos não retornam um histórico com duração incorreta', () => {
    for (const periodo of [0, -1, 60, NaN]) {
        assert.throws(() => mock.historico('cpu', periodo), /período/i);
    }
});

test('o risco de armazenamento usa o menor prazo entre servidores e volumes, incluindo inodes', () => {
    const servidores = [
        { nome: 'api', volumes: [{ nome: '/dados', diasEspaco: 37, diasInodes: 220 }] },
        { nome: 'db', volumes: [
            { nome: '/dados', diasEspaco: 14, diasInodes: 80 },
            { nome: '/', diasEspaco: null, diasInodes: 7 }
        ] }
    ];
    const risco = mock.menorPrevisao(servidores);
    assert.equal(risco.servidor.nome, 'db');
    assert.equal(risco.volume, '/');
    assert.equal(risco.dias, 7);
    assert.equal(risco.recurso, 'inodes');
    assert.equal(mock.menorPrevisao(servidores.slice(0, 1)).dias, 37);
});

test('não inventa prazo quando não há previsão válida e preserva esgotamento em zero dias', () => {
    assert.equal(mock.menorPrevisao([]), null);
    assert.equal(mock.menorPrevisao([{ volumes: [{ nome: '/', diasEspaco: null, diasInodes: null }] }]), null);
    assert.equal(mock.menorPrevisao([{ volumes: [{ nome: '/', diasEspaco: NaN, diasInodes: -1 }] }]), null);
    assert.equal(mock.menorPrevisao([{ volumes: [{ nome: '/', diasEspaco: 0, diasInodes: null }] }]).dias, 0);
});
