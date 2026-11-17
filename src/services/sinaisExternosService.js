// Essa e a parte de consumir API externa que o curso pede (frente F do backlog).
// Fonte ja decidida antes: feriado nacional (BrasilAPI) + status do Mercado Pago.
// Copiei o mesmo jeito de cachear que o resumoGeralService ja fazia, porque nao faz
// sentido a Geral ficar esperando essas duas APIs responderem toda vez que alguem
// abre a tela - busca uma vez e guarda, atualiza sozinho de tempos em tempos.
const resumoGoldService = require("./resumoGoldService");

const URL_FERIADOS = "https://brasilapi.com.br/api/feriados/v1";
const URL_STATUS_MERCADO_PAGO = "https://status.mercadopago.com/api/v2/status.json";
const INTERVALO_ATUALIZACAO_MS = 5 * 60 * 1000; // mesmos 5 min que o resumoGeralService usa, fiquei nesse mesmo numero

function sinaisPadrao() {
    return {
        proximoFeriado: null,
        statusPagamento: { operacional: true, descricao: "Status do Mercado Pago indisponível no momento." }
    };
}

let sinaisEmCache = sinaisPadrao();

async function buscarFeriadosDoAno(ano) {
    const resposta = await fetch(`${URL_FERIADOS}/${ano}`);
    if (!resposta.ok) throw new Error(`BrasilAPI respondeu ${resposta.status} pro ano ${ano}`);
    return resposta.json();
}

// preciso usar o agoraOuReferenciaDemo aqui, nao um "new Date()" direto - e o mesmo
// "agora" fixo que o resto da Geral usa (27/11/2026 20h30 enquanto a gente testa com
// o cenario). se eu usasse o relogio de verdade so aqui, ia ficar diferente do resto
// da tela, mesma pegadinha que achei antes no estado-titulo.
async function buscarProximoFeriado(hoje) {
    const feriadosDesteAno = await buscarFeriadosDoAno(hoje.getUTCFullYear());
    let candidatos = feriadosDesteAno.filter(feriado => new Date(`${feriado.date}T00:00:00-03:00`) >= hoje);

    // e se nao sobrar nenhum feriado nesse ano (tipo, se fosse rodar isso em
    // dezembro de verdade)? sem isso quebraria todo fim de ano, entao busca o
    // ano que vem tambem
    if (candidatos.length === 0) {
        candidatos = await buscarFeriadosDoAno(hoje.getUTCFullYear() + 1);
    }

    const proximo = candidatos[0];
    if (!proximo) return null;

    const dataDoFeriado = new Date(`${proximo.date}T00:00:00-03:00`);
    const diasRestantes = Math.ceil((dataDoFeriado.getTime() - hoje.getTime()) / (24 * 60 * 60 * 1000));
    return { nome: proximo.name, diasRestantes };
}

// a description que a api devolve vem em ingles ("All Systems Operational") - o
// indicator e que e um codigo fixo (none/minor/major/critical, padrao statuspage.io
// que a mercado pago usa), entao traduzo a partir dele em vez de usar a description
// deles direto, pra ficar em portugues igual o resto da tela
const DESCRICAO_POR_INDICATOR = {
    none: "Operando normalmente.",
    minor: "Instabilidade pontual.",
    major: "Instabilidade significativa.",
    critical: "Fora do ar."
};

async function buscarStatusMercadoPago() {
    const resposta = await fetch(URL_STATUS_MERCADO_PAGO);
    if (!resposta.ok) throw new Error(`Mercado Pago respondeu ${resposta.status}`);
    const corpo = await resposta.json();
    const indicator = corpo.status?.indicator;
    return {
        operacional: indicator === "none",
        descricao: DESCRICAO_POR_INDICATOR[indicator] ?? "Status do Mercado Pago indisponível no momento."
    };
}

async function atualizarCache() {
    const hoje = resumoGoldService.agoraOuReferenciaDemo();

    // usando allSettled e nao all - se uma das duas apis cair (tipo, o mercado pago
    // fora do ar), nao quero perder o feriado que a outra conseguiu buscar. cada
    // uma falha ou funciona por conta propria
    const [resultadoFeriado, resultadoStatus] = await Promise.allSettled([
        buscarProximoFeriado(hoje),
        buscarStatusMercadoPago()
    ]);

    if (resultadoFeriado.status === "rejected") {
        console.warn("Aviso: falha ao buscar feriados na BrasilAPI:", resultadoFeriado.reason.message);
    }
    if (resultadoStatus.status === "rejected") {
        console.warn("Aviso: falha ao buscar status do Mercado Pago:", resultadoStatus.reason.message);
    }

    sinaisEmCache = {
        proximoFeriado: resultadoFeriado.status === "fulfilled" ? resultadoFeriado.value : sinaisEmCache.proximoFeriado,
        statusPagamento: resultadoStatus.status === "fulfilled" ? resultadoStatus.value : sinaisEmCache.statusPagamento
    };
}

function obterSinaisExternos() {
    return sinaisEmCache;
}

function iniciar() {
    atualizarCache();
    setInterval(atualizarCache, INTERVALO_ATUALIZACAO_MS);
}

module.exports = { iniciar, obterSinaisExternos };
