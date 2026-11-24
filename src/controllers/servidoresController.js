const servidoresModel = require('../models/servidoresModel');
const s3Model = require('../models/s3Model');

const RANK_ESTADO = { normal: 0, atencao: 1, critico: 2 };
const ROTULO_REDE = { net_errors: 'erros', net_drops: 'descartes' };
const METRICAS_REDE = ['net_traffic', 'net_errors', 'net_drops'];

function rank(estado) {

    return RANK_ESTADO[estado] ?? 0;

}

function nivelDe(recurso) {

    return rank(recurso.estado) > 0 ? recurso.estado : 'normal';

}

function semDados() {

    return { valor: null, nivel: 'sem-dados', detalhe: '' };

}

// Maior gravidade primeiro; no empate, o maior valor
function piorRecurso(recursos) {

    return recursos.reduce((pior, atual) => {

        const diferenca = rank(atual.estado) - rank(pior.estado);

        return diferenca > 0 || (diferenca === 0 && atual.valor_atual > pior.valor_atual)
            ? atual
            : pior;

    });

}

function filtrarRecursos(resumo, metrica) {

    return (resumo.recursos_estado || []).filter(recurso => recurso.metrica === metrica);

}

function metricaPercentual(resumo, metrica, detalharSeAlerta = false) {

    const recursos = filtrarRecursos(resumo, metrica);

    if (recursos.length === 0) {
        return semDados();
    }

    const pior = piorRecurso(recursos);
    const nivel = nivelDe(pior);

    return {
        valor: Math.round(pior.valor_atual),
        nivel,
        detalhe: detalharSeAlerta && nivel !== 'normal' ? (pior.recurso?.descricao ?? '') : ''
    };

}

function montarCpu(resumo) {

    const cpu = metricaPercentual(resumo, 'cpu_percent');
    const nucleosEmAlerta = filtrarRecursos(resumo, 'cpu_percent_percpu')
        .filter(nucleo => rank(nucleo.estado) > 0);

    if (nucleosEmAlerta.length > 0) {
        cpu.detalhe = piorRecurso(nucleosEmAlerta).recurso.descricao;
    }

    return cpu;

}

function formatarTrafego(bytesPorSegundo) {

    const unidades = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    let valor = bytesPorSegundo;
    let indice = 0;

    while (valor >= 1024 && indice < unidades.length - 1) {
        valor /= 1024;
        indice++;
    }

    return `${valor.toFixed(1)} ${unidades[indice]}`;

}

// Erro ou descarte em alerta tem prioridade sobre o tráfego (como "erros · eth0" no Figma).
// A interface de loopback (LO) é ignorada.
function montarRede(resumo) {

    const desligada = { valor: '–', nivel: 'desligada', detalhe: '' };

    const recursos = (resumo.recursos_estado || []).filter(recurso =>
        METRICAS_REDE.includes(recurso.metrica)
        && String(recurso.recurso?.identificador).toUpperCase() !== 'LO'
    );

    const emAlerta = recursos.filter(recurso => rank(recurso.estado) > 0);

    if (emAlerta.length > 0) {

        const pior = piorRecurso(emAlerta);
        const rotulo = ROTULO_REDE[pior.metrica];
        const interfaceRede = pior.recurso.identificador;

        return {
            valor: rotulo ? `${pior.valor_atual}/s` : formatarTrafego(pior.valor_atual),
            nivel: nivelDe(pior),
            detalhe: rotulo ? `${rotulo} · ${interfaceRede}` : interfaceRede
        };

    }

    const trafegos = recursos.filter(recurso => recurso.metrica === 'net_traffic');

    if (trafegos.length === 0) {
        return desligada;
    }

    return {
        valor: formatarTrafego(piorRecurso(trafegos).valor_atual),
        nivel: 'normal',
        detalhe: ''
    };

}

function segundosDesde(instante) {

    return Math.max(0, Math.floor((Date.now() - Date.parse(instante)) / 1000));

}

function ehLoopback(nome) {

    const maiusculo = String(nome).toUpperCase();

    return maiusculo === 'LO' || maiusculo.startsWith('LOOPBACK');

}

function maiorValor(valores) {

    const validos = valores.filter(valor => typeof valor === 'number');

    return validos.length ? Math.max(...validos) : null;

}

function metricaBruta(valor) {

    if (valor === null) {
        return semDados();
    }

    return { valor: Math.round(valor), nivel: 'normal', detalhe: '' };

}

// Resumo sem classificação (sem limites): mostra o último valor, sem julgar o estado
function montarMetricasBrutas(resumo) {

    const { cpu, ram, disco, rede } = resumo.resumos ?? {};

    const trafego = maiorValor(
        (rede?.interfaces ?? [])
            .filter(interfaceRede => !ehLoopback(interfaceRede.nome))
            .map(interfaceRede => interfaceRede.trafego?.ultimo_valor)
    );

    return {
        cpu: metricaBruta(cpu?.total?.ultimo_valor ?? null),
        ram: metricaBruta(ram?.uso?.ultimo_valor ?? null),
        dsk: metricaBruta(maiorValor((disco?.volumes ?? []).map(volume => volume.ocupacao?.ultimo_valor))),
        net: trafego === null
            ? { valor: '–', nivel: 'desligada', detalhe: '' }
            : { valor: formatarTrafego(trafego), nivel: 'normal', detalhe: '' }
    };

}

// Tenta o resumo do dia (1 leitura); se não existir, pega o mais recente que houver
async function buscarResumoRecente(mac, data) {

    const resumo = await s3Model.buscarResumoServidor(mac, data);

    return resumo ?? await s3Model.buscarUltimoResumoServidor(mac);

}

async function montarCartao(servidor, data) {

    const cartao = {
        nome: servidor.nome,
        perfil: servidor.nome_perfil,
        endereco_mac: servidor.endereco_mac,
        status: 'sem-dados',
        coletaSegundos: null,
        metricas: {}
    };

    
    try {

        const resumo = await buscarResumoRecente(servidor.endereco_mac, data);
        console.log(
        servidor.nome,
        '| classificacao_disponivel:', resumo.classificacao_disponivel,
        '| recursos_estado:', resumo.recursos_estado?.length,
    '| severidade:', resumo.severidade,
    '| data:', resumo.data,
    '| ultima_coleta:', resumo.ultima_coleta
    );

        if (!resumo) {

            console.warn(`Sem resumo no S3 para ${servidor.nome} (${servidor.endereco_mac})`);

            return cartao;

        }

                const classificado = resumo.classificacao_disponivel && resumo.recursos_estado?.length > 0;

        return {
            ...cartao,
            status: classificado ? resumo.severidade : 'sem-dados',
            coletaSegundos: resumo.ultima_coleta ? segundosDesde(resumo.ultima_coleta) : null,
            metricas: classificado
                ? {
                    cpu: montarCpu(resumo),
                    ram: metricaPercentual(resumo, 'ram_percent'),
                    dsk: metricaPercentual(resumo, 'disk_percent', true),
                    net: montarRede(resumo)
                }
                : montarMetricasBrutas(resumo)
        };

    } catch (erro) {

        // Um servidor com problema no S3 não derruba a lista inteira
        console.error(`Erro ao montar resumo de ${servidor.nome}:`, erro);

        return cartao;

    }

}

async function listarServidores(req, res) {

    const idEmpresa = Number(req.query.idEmpresa);
    const idUsuario = Number(req.query.idUsuario);

    if (!idEmpresa || !idUsuario) {

        return res.status(400).json({
            erro: 'idEmpresa e idUsuario são obrigatórios'
        });

    }

    // ?data=AAAA-MM-DD é opcional (útil para testar com um resumo de outro dia)
    const data = /^\d{4}-\d{2}-\d{2}$/.test(req.query.data)
        ? req.query.data
        : new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

    try {

        const servidores = await servidoresModel.listarServidores(idEmpresa, idUsuario);

        const cartoes = await Promise.all(
            servidores.map(servidor => montarCartao(servidor, data))
        );

        return res.status(200).json(cartoes);

    } catch (erro) {

        console.error(erro);

        return res.status(500).json({
            erro: 'Erro ao listar servidores'
        });

    }
}

module.exports = {
    listarServidores
};