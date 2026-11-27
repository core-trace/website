const servidoresModel = require('../models/servidoresModel');
const s3Model = require('../models/s3Model');
const resumoGoldService = require('../services/resumoGoldService');

// Cache simples por empresa/usuário/dia - sem isso, toda abertura da tela de
// Servidores busca tudo de novo no S3 (1 leitura por servidor). A Geral já faz
// algo parecido (resumoGeralService.js), só que com um cache único (tela de 1
// empresa só); aqui cada empresa/usuário/dia tem sua própria entrada porque o
// resultado muda de acordo com quem pede.
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos
const cachePorChave = new Map();

const RANK_ESTADO = { normal: 0, atencao: 1, critico: 2 };
const LIMITE_SEM_DADOS_SEGUNDOS = 15 * 60; // mesma regra do front

// Métrica principal de cada categoria: é a que o card mostra quando nada está em alerta.
const PRINCIPAL = {
    cpu: 'cpu_percent',
    ram: 'ram_percent',
    disco: 'disk_percent',
    rede: 'net_traffic'
};

// Nome curto de cada métrica do catálogo (cabe no detalhe do card).
// A ordem das chaves é o critério de desempate entre métricas no mesmo estado.
// '' = o nome do recurso já basta (ex.: "núcleo 3").
const ROTULO_METRICA = {
    cpu_percent_percpu: '',
    cpu_percent: 'uso total',
    cpu_iowait: 'espera I/O',
    cpu_user: 'modo usuário',
    cpu_system: 'modo sistema',
    cpu_idle: 'ociosa',
    cpu_interrupts_per_second: 'interrupções',
    cpu_context_switches_per_second: 'trocas de contexto',
    cpu_freq_current: 'frequência',
    ram_percent: 'uso',
    ram_available: 'disponível',
    ram_used: 'em uso',
    ram_free: 'livre',
    ram_cached: 'cache',
    ram_oom_kills: 'OOM kill',
    disk_percent: 'ocupação',
    disk_inodes_percent: 'inodes',
    disk_free: 'livre',
    disk_used: 'ocupado',
    disk_queue: 'fila I/O',
    disk_io_time: 'latência I/O',
    disk_read_bytes: 'leitura',
    disk_write_bytes: 'escrita',
    disk_read_count: 'IOPS leitura',
    disk_write_count: 'IOPS escrita',
    net_traffic: 'tráfego',
    net_errors: 'erros',
    net_drops: 'descartes',
    net_isup: 'estado',
    net_packets_recv: 'pacotes recebidos',
    net_packets_sent: 'pacotes enviados',
    swap_percent: 'uso de swap',
    swap_used: 'swap em uso',
    swap_free: 'swap livre',
    swap_sin: 'entrada de swap',
    swap_sout: 'saída de swap',
    load_avg_1: 'carga 1 min',
    load_avg_5: 'carga 5 min',
    load_avg_15: 'carga 15 min'
};

// Sufixos curtos: o valor do card tem white-space: nowrap e a coluna é estreita.
const SUFIXO_UNIDADE = {
    GB: ' GB', ms: ' ms', MHz: ' MHz', IOPS: ' IOPS',
    'eventos/s': '/s', 'pacotes/s': '/s'
};

// Componentes que entram na KPI "Componente mais crítico"
const COMPONENTE_KPI = { cpu: 'CPU', ram: 'RAM', disco: 'DISCO', rede: 'REDE' };

// Categorias sem slot no card: viram uma linha extra
const ROTULO_EXTRA = { swap: 'SWAP', carga: 'CARGA' };

function rank(estado) {

    return RANK_ESTADO[estado] ?? 0;

}

function nivelDe(recurso) {

    return rank(recurso.estado) > 0 ? recurso.estado : 'normal';

}

function semDados() {

    return { valor: null, nivel: 'sem-dados', detalhe: '' };

}

function rotuloDe(metrica) {

    return ROTULO_METRICA[metrica] ?? metrica.replace(/_/g, ' ');

}

// A Silver põe as colunas em maiúsculas, então devolvemos uma forma legível
function formatarInterface(nome) {

    const texto = String(nome);

    return texto.toUpperCase() === 'WI-FI' ? 'Wi-Fi' : texto.toLowerCase();

}

function nomeDoRecurso(recurso) {

    if (!recurso) {
        return '';
    }

    if (recurso.tipo === 'nucleo') {
        return recurso.descricao; // "núcleo 3"
    }

    if (recurso.tipo === 'interface') {
        return formatarInterface(recurso.identificador);
    }

    return String(recurso.identificador); // volume ("/") ou dispositivo ("nvme1n1")

}

function formatarValor(valor, unidade) {

    if (typeof valor !== 'number') {
        return '–';
    }

    if (unidade === '%') {
        return `${Math.round(valor)}%`;
    }

    if (unidade === 'bytes/s') {
        return formatarTrafego(valor);
    }

    if (unidade === 'estado') {
        return valor === 1 ? 'ativa' : 'inativa';
    }

    return `${Math.round(valor * 10) / 10}${SUFIXO_UNIDADE[unidade] ?? ''}`;

}

// Percentual vira número (o front desenha a barra); o resto vira texto já formatado
function valorDoCartao(valor, unidade) {

    return unidade === '%' ? Math.round(valor) : formatarValor(valor, unidade);

}

// Em métricas com operador "<" (espaço livre, RAM disponível, interface ativa) quanto MENOR, pior
function gravidadeNumerica(causa) {

    const menorEPior = ['<', '<='].includes(String(causa.operador ?? '').trim());

    return menorEPior ? -causa.valor_atual : causa.valor_atual;

}

function ordemDaMetrica(metrica) {

    const indice = Object.keys(ROTULO_METRICA).indexOf(metrica);

    return indice === -1 ? 999 : indice;

}

// Mais grave primeiro; no empate, ordem do catálogo; depois o pior valor da mesma métrica
function compararCausas(a, b) {

    return rank(b.estado) - rank(a.estado)
        || ordemDaMetrica(a.metrica) - ordemDaMetrica(b.metrica)
        || gravidadeNumerica(b) - gravidadeNumerica(a);

}

function textoDaCausa(causa) {

    const alvo = nomeDoRecurso(causa.recurso);

    // Métrica principal e núcleo: o nome do recurso basta ("/", "núcleo 3", "eth0")
    if (causa.principal || causa.metrica === 'cpu_percent_percpu') {
        return alvo;
    }

    const rotulo = rotuloDe(causa.metrica);

    return alvo ? `${rotulo} · ${alvo}` : rotulo;

}

// Todas as métricas em atenção/crítico, de todas as categorias. Só existem aqui métricas
// com limite no perfil, porque a Gold só classifica essas. A interface de loopback é ignorada.
function listarCausas(resumo) {

    const causas = [];

    for (const recurso of resumo.recursos_estado || []) {

        if (rank(recurso.estado) === 0) {
            continue;
        }

        if (recurso.categoria === 'rede' && ehLoopback(recurso.recurso?.identificador)) {
            continue;
        }

        causas.push({
            categoria: recurso.categoria,
            metrica: recurso.metrica,
            estado: recurso.estado,
            valor_atual: recurso.valor_atual,
            unidade: recurso.unidade,
            operador: recurso.limites?.operador,
            recurso: recurso.recurso,
            desde: recurso.estado === 'critico' ? recurso.em_critico_desde : recurso.em_atencao_desde,
            principal: PRINCIPAL[recurso.categoria] === recurso.metrica
        });

    }

    // OOM não tem limite no catálogo, mas a Gold já torna o servidor crítico por ele
    const oom = resumo.resumos?.ram?.oom?.total_observado;

    if (typeof oom === 'number' && oom > 0) {

        causas.push({
            categoria: 'ram',
            metrica: 'ram_oom_kills',
            estado: 'critico',
            valor_atual: oom,
            unidade: 'ocorrências',
            recurso: null,
            desde: resumo.ultimo_oom_em ?? null,
            principal: false
        });

    }

    return causas.sort(compararCausas);

}

// Valor normal (nada em alerta): o maior valor da métrica principal da categoria
function valorNormal(resumo, metrica, ausente = semDados()) {

    const recursos = filtrarRecursos(resumo, metrica)
        .filter(recurso => !(recurso.categoria === 'rede' && ehLoopback(recurso.recurso?.identificador)));

    if (recursos.length === 0) {
        return ausente;
    }

    const maior = recursos.reduce((pior, atual) => atual.valor_atual > pior.valor_atual ? atual : pior);

    return { valor: valorDoCartao(maior.valor_atual, maior.unidade), nivel: 'normal', detalhe: '' };

}

// Um slot mostra a pior causa da categoria; as outras viram "(+N)"
function montarSlot(causas, normal) {

    if (causas.length === 0) {
        return normal;
    }

    const [causa] = causas;
    const mais = causas.length > 1 ? ` (+${causas.length - 1})` : '';

    return {
        valor: valorDoCartao(causa.valor_atual, causa.unidade),
        nivel: nivelDe(causa),
        detalhe: textoDaCausa(causa) + mais
    };

}

function montarMetricasClassificadas(resumo, causas) {

    const de = categoria => causas.filter(causa => causa.categoria === categoria);
    const redeDesligada = { valor: '–', nivel: 'desligada', detalhe: '' };

    return {
        cpu: montarSlot(de('cpu'), valorNormal(resumo, PRINCIPAL.cpu)),
        ram: montarSlot(de('ram'), valorNormal(resumo, PRINCIPAL.ram)),
        dsk: montarSlot(de('disco'), valorNormal(resumo, PRINCIPAL.disco)),
        net: montarSlot(de('rede'), valorNormal(resumo, PRINCIPAL.rede, redeDesligada))
    };

}

// Swap e carga não têm slot: uma linha por categoria que estiver em alerta
function montarExtras(causas) {

    const extras = [];

    for (const [categoria, rotulo] of Object.entries(ROTULO_EXTRA)) {

        const lista = causas.filter(causa => causa.categoria === categoria);

        if (lista.length > 0) {
            extras.push({ rotulo, ...montarSlot(lista) });
        }

    }

    return extras;

}

// Lista completa, sem descartar nada (serve para tooltip ou drill-down)
function montarAlertas(causas) {

    return causas.map(causa => ({
        categoria: causa.categoria,
        metrica: causa.metrica,
        rotulo: rotuloDe(causa.metrica),
        recurso: nomeDoRecurso(causa.recurso),
        estado: causa.estado,
        valor: formatarValor(causa.valor_atual, causa.unidade),
        desde: causa.desde ?? null
    }));

}

// A KPI usa a mesma lista do card, então os dois não discordam
function montarComponentesCriticos(causas) {

    const categorias = new Set(
        causas.filter(causa => causa.estado === 'critico').map(causa => causa.categoria)
    );

    return Object.keys(COMPONENTE_KPI)
        .filter(categoria => categorias.has(categoria))
        .map(categoria => COMPONENTE_KPI[categoria]);

}

function filtrarRecursos(resumo, metrica) {

    return (resumo.recursos_estado || []).filter(recurso => recurso.metrica === metrica);

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




function segundosDesde(instante) {

    // Mesma data/hora fixa da demonstração que o resto do site usa (respeita
    // DATA_DEMO_FIXA) - antes usava Date.now() (hora real do relógio), e como
    // o cenário é datado de 27/11 (no futuro em relação ao relógio real),
    // a conta dava negativo e o Math.max(0, ...) travava em 0 - um servidor
    // com a última leitura de horas atrás aparecia como "0 segundos atrás".
    const agora = resumoGoldService.agoraOuReferenciaDemo().getTime();
    return Math.max(0, Math.floor((agora - Date.parse(instante)) / 1000));

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
        ultimaColeta: null,
        componentesCriticos: [],
        extras: [],
        alertas: [],
        metricas: {}
    };

    try {

        const resumo = await buscarResumoRecente(servidor.endereco_mac, data);

        if (!resumo) {

            console.warn(`Sem resumo no S3 para ${servidor.nome} (${servidor.endereco_mac})`);

            return cartao;

        }

        const coletaSegundos = resumo.ultima_coleta ? segundosDesde(resumo.ultima_coleta) : null;
        const desatualizado = coletaSegundos === null || coletaSegundos > LIMITE_SEM_DADOS_SEGUNDOS;

        const classificado = resumo.classificacao_disponivel
            && resumo.recursos_estado?.length > 0
            && !desatualizado;

        // Sem classificação ou com coleta velha: só o último valor, sem estado nem detalhe
        if (!classificado) {

            return {
                ...cartao,
                coletaSegundos,
                ultimaColeta: resumo.ultima_coleta ?? null,
                metricas: montarMetricasBrutas(resumo)
            };

        }

        const causas = listarCausas(resumo);
        const extras = montarExtras(causas);
        const status = resumo.severidade ?? 'sem-dados';

        // Servidor em alerta cuja causa não tem posição no card (ex.: métrica de inventário
        // com limite): não deixamos o card vermelho sem explicação
        if (rank(status) > 0 && causas.length === 0) {
            extras.push({ rotulo: 'CAUSA', valor: '', nivel: status, detalhe: 'métrica sem posição no card' });
        }

        return {
            ...cartao,
            status,
            coletaSegundos,
            ultimaColeta: resumo.ultima_coleta ?? null,
            componentesCriticos: montarComponentesCriticos(causas),
            extras,
            alertas: montarAlertas(causas),
            metricas: montarMetricasClassificadas(resumo, causas)
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

    // ?data=AAAA-MM-DD é opcional (útil para testar com um resumo de outro dia).
    // Sem isso, usa a mesma data "de hoje" que o resto do site usa (respeita
    // DATA_DEMO_FIXA no cenário de demonstração) - antes calculava a data real
    // do relógio aqui, direto, e ignorava a data fixa da apresentação.
    const data = /^\d{4}-\d{2}-\d{2}$/.test(req.query.data)
        ? req.query.data
        : resumoGoldService.dataDeHojeSaoPaulo();

    const chaveCache = `${idEmpresa}:${idUsuario}:${data}`;
    const emCache = cachePorChave.get(chaveCache);
    if (emCache && Date.now() - emCache.quando < CACHE_TTL_MS) {
        return res.status(200).json(emCache.cartoes);
    }

    try {

        const servidores = await servidoresModel.listarServidores(idEmpresa, idUsuario);

        const cartoes = await Promise.all(
            servidores.map(servidor => montarCartao(servidor, data))
        );

        cachePorChave.set(chaveCache, { quando: Date.now(), cartoes });

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