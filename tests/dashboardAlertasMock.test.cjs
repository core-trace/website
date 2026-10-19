const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const contexto = vm.createContext({});
vm.runInContext(fs.readFileSync('public/scripts/dashboardAlertasMock.js', 'utf8'), contexto);
const mock = vm.runInContext('dashboardAlertasMock', contexto);
const minuto = 60_000;
const fim = Date.parse('2026-10-15T14:30:00-03:00');
const base = mock.criarBase(fim);
const simples = valor => JSON.parse(JSON.stringify(valor));

test('barras contam cada servidor/recurso uma vez, pela maior severidade histórica', () => {
    const registro = (servidor, perfil, recurso, severidade, timestamp) => ({ servidor, perfil, recurso, severidade, timestamp });
    const registros = [
        registro('a', '1', 'CPU', 'atencao', 0),
        registro('a', '1', 'CPU', 'critico', minuto),
        registro('a', '1', 'CPU', 'critico', minuto),
        registro('a', '1', 'RAM', 'atencao', minuto),
        registro('a', '1', 'CPU', 'normal', 2 * minuto),
        registro('b', '1', 'CPU', 'atencao', minuto),
        registro('c', '2', 'CPU', 'critico', minuto),
        registro('fora', '1', 'Disco', 'critico', -1),
        registro('futuro', '1', 'Rede', 'critico', 2 * minuto + 1)
    ];
    const resumo = mock.agregar(registros, { inicio: 0, fim: 2 * minuto, perfil: '1' });
    assert.deepEqual(simples(resumo.recursos.CPU), { atencao: 1, critico: 1 });
    assert.deepEqual(simples(resumo.recursos.RAM), { atencao: 1, critico: 0 });
    assert.deepEqual(simples(resumo.recursos.Disco), { atencao: 0, critico: 0 });
    assert.deepEqual(simples(resumo.recursos.Rede), { atencao: 0, critico: 0 });
    assert.deepEqual(simples(resumo.evolucao), [
        { instante: 0, atencao: 1, critico: 0 },
        { instante: minuto, atencao: 1, critico: 1 },
        { instante: 2 * minuto, atencao: 0, critico: 0 }
    ]);
});

test('todos os períodos e perfis usam o mesmo histórico estável e respeitam os limites', () => {
    assert.equal(base[0].timestamp, fim - 10080 * minuto);
    assert.equal(base.at(-1).timestamp, fim);
    assert.deepEqual(simples(mock.criarBase(fim)), simples(base));
    for (const periodo of [60, 360, 720, 1440, 10080]) {
        for (const perfil of ['', '1', '2', '3', 'inexistente']) {
            const inicio = fim - periodo * minuto;
            const resumo = mock.agregar(base, { inicio, fim, perfil });
            const selecionados = base.filter(item => item.timestamp >= inicio && (!perfil || item.perfil === perfil));
            const total = new Set(selecionados.map(item => item.servidor)).size;
            assert.equal(resumo.totalServidores, total);
            assert.ok(resumo.evolucao.length <= 120);
            for (const ponto of resumo.evolucao) {
                assert.ok(ponto.instante >= inicio && ponto.instante <= fim);
                assert.ok(ponto.atencao + ponto.critico <= total);
            }
            for (const recurso of mock.recursos) {
                const criticos = new Set(selecionados.filter(item => item.recurso === recurso && item.severidade === 'critico').map(item => item.servidor));
                const atencao = new Set(selecionados.filter(item => item.recurso === recurso && item.severidade === 'atencao' && !criticos.has(item.servidor)).map(item => item.servidor));
                assert.deepEqual(simples(resumo.recursos[recurso]), { atencao: atencao.size, critico: criticos.size });
            }
        }
    }
});

test('cenário tem madrugada estável, almoço pressionado, jantar maior e recuperação', () => {
    const investigar = (inicio, final) => mock.agregar(base, {
        inicio: Date.parse(`2026-10-14T${inicio}:00-03:00`),
        fim: Date.parse(`2026-10-14T${final}:00-03:00`)
    });
    const pico = resumo => Math.max(...resumo.evolucao.map(ponto => ponto.critico));
    assert.equal(pico(investigar('00:00', '06:00')), 0);
    assert.ok(pico(investigar('11:00', '14:00')) > 0);
    assert.ok(pico(investigar('18:00', '21:00')) > pico(investigar('11:00', '14:00')));
    assert.ok(pico(investigar('14:00', '17:00')) < pico(investigar('11:00', '14:00')));
    assert.ok(pico(investigar('22:00', '23:55')) < pico(investigar('18:00', '21:00')));
    const almoco = investigar('11:00', '14:00');
    assert.ok(almoco.recursos.CPU.critico + almoco.recursos.CPU.atencao > 0);
    assert.ok(almoco.recursos.RAM.critico + almoco.recursos.RAM.atencao > 0);
});

test('redução temporal preserva os picos e vales reais das duas linhas', () => {
    const registros = [];
    for (let i = 0; i <= 10080; i += 5) {
        registros.push({ servidor: 'a', perfil: '1', recurso: 'CPU', timestamp: i * minuto, severidade: i === 125 ? 'critico' : i === 135 ? 'atencao' : 'normal' });
    }
    const resumo = mock.agregar(registros, { inicio: 0, fim: 10080 * minuto });
    assert.equal(resumo.granularidade, 360);
    assert.ok(resumo.evolucao.some(ponto => ponto.instante === 125 * minuto && ponto.critico === 1));
    assert.ok(resumo.evolucao.some(ponto => ponto.instante === 135 * minuto && ponto.atencao === 1));
    assert.equal(resumo.evolucao[0].instante, 0);
    assert.equal(resumo.evolucao.at(-1).instante, 10080 * minuto);
});
