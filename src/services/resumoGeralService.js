// Monta o resumo da dashboard Geral (ver public/scripts/inicioDashboard.js) a partir
// dos resumos diarios reais que o pipeline Python deixa no S3, um por servidor.
//
// So cobre os campos "estado", "cobertura", "indicadores" e "perfis". Os outros campos
// que a dashboard usa (resumo, acoes, evolucao, evolucaoLegenda, riscos,
// perguntasProntas) continuam vindo do mock (public/scripts/geralMock.js) porque
// dependem de hipoteses ainda nao implementadas (resumo investigativo, assistente,
// previsao de tendencia) - isso e intencional, nao uma lacuna esquecida.
const servidorModel = require("../models/servidorModel");
const resumoGoldService = require("./resumoGoldService");

// iFood e a unica empresa cliente desta demonstracao (ver database/script.sql,
// INSERT INTO empresa - a ordem de insercao garante o id 2).
const ID_EMPRESA_IFOOD = 2;

const INTERVALO_ATUALIZACAO_MS = 5 * 60 * 1000; // 5 minutos

const MESES_ABREVIADOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

let resumoEmCache = null;

// Percorre o resumo (mistura de objetos e listas) e chama "funcao" em cada bloco de
// metrica, isto e, todo objeto que tem "metrica" e "tipo" juntos. E a mesma regra do
// para_cada_medida usado no pipeline Python (scripts-captura/formato_gold.py) - precisa
// ser igual, porque e so assim que achamos onde o tempo_no_estado foi colocado.
function percorrerMedidas(estrutura, funcao) {
    if (Array.isArray(estrutura)) {
        for (const item of estrutura) percorrerMedidas(item, funcao);
        return;
    }
    if (estrutura && typeof estrutura === "object") {
        if ("metrica" in estrutura && "tipo" in estrutura) funcao(estrutura);
        for (const valor of Object.values(estrutura)) percorrerMedidas(valor, funcao);
    }
}

// Classifica o nome tecnico da metrica (ex.: "cpu_percent") num recurso que faz
// sentido mostrar na tela. So reconhece os prefixos usados no catalogo de
// componentes (database/script.sql); metricas fora desses grupos ficam sem categoria.
function categoriaDaMetrica(nomeMetrica) {
    if (!nomeMetrica) return null;
    if (nomeMetrica.startsWith("cpu") || nomeMetrica.startsWith("load_avg")) return "CPU";
    if (nomeMetrica.startsWith("ram") || nomeMetrica.startsWith("swap")) return "RAM";
    if (nomeMetrica.startsWith("disk")) return "Disco";
    if (nomeMetrica.startsWith("net")) return "Rede";
    return null;
}

// As datas dentro do resumo (ex.: "em_atencao_desde") nao trazem fuso horario quando
// vem de uma captura tradicional. Nesse caso o pipeline Python considera que o
// horario e de Sao Paulo (ver resumos_gold.instante_comparavel) - precisamos repetir
// a mesma convencao aqui, senao a conta de "ha quanto tempo" sai errada.
function interpretarInstante(textoIso) {
    const temFuso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(textoIso);
    const textoAteMilissegundos = textoIso.replace(/(\.\d{3})\d+$/, "$1");
    return new Date(temFuso ? textoAteMilissegundos : `${textoAteMilissegundos}-03:00`);
}

function formatarHorarioDeInstante(instante) {
    const partes = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false
    }).formatToParts(instante);
    const campos = {};
    for (const parte of partes) campos[parte.type] = parte.value;
    return `${campos.hour}h${campos.minute}`;
}

function formatarDuracaoDesde(instante) {
    const agora = resumoGoldService.agoraOuReferenciaDemo();
    const minutos = Math.max(0, Math.round((agora.getTime() - instante.getTime()) / 60000));
    if (minutos < 60) return `${minutos} min`;
    const horas = Math.floor(minutos / 60);
    const minutosRestantes = minutos % 60;
    return minutosRestantes === 0 ? `${horas}h` : `${horas}h ${minutosRestantes}min`;
}

// Junta nomes em texto corrido: "A", "A e B" ou "A, B e C".
function juntarComE(itens) {
    if (itens.length === 0) return "";
    if (itens.length === 1) return itens[0];
    return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

function montarEstado() {
    const campos = resumoGoldService.camposDoRelogio("America/Sao_Paulo", {
        year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
    });
    const mes = MESES_ABREVIADOS[Number(campos.month) - 1];
    return {
        titulo: `Estado às ${campos.hour}h${campos.minute}`,
        data: `${campos.day} ${mes} ${campos.year}`
    };
}

// Regra decidida na Fase 3 (12/11): 3 ciclos de ETL de ~5 min. Um resumo pode existir
// (a busca no S3 deu certo) mas ter a ultima leitura velha demais - por exemplo, um
// servidor que parou de reportar no meio do dia. "Sem dados recentes" e sobre a ultima
// leitura, nao sobre o arquivo existir ou nao.
const RECENCIA_MAXIMA_MINUTOS = 15;

function foraDoPrazoDeRecencia(resumo) {
    const fimTexto = resumo.resumos && resumo.resumos.fim;
    if (!fimTexto) return true;
    const ultimaLeitura = interpretarInstante(fimTexto);
    const agora = resumoGoldService.agoraOuReferenciaDemo();
    const minutosDesdeAUltimaLeitura = (agora.getTime() - ultimaLeitura.getTime()) / 60000;
    return minutosDesdeAUltimaLeitura > RECENCIA_MAXIMA_MINUTOS;
}

function montarCobertura(servidores, esperados) {
    // "Avaliados" significa leitura recente, nao so "o arquivo existe" (ver legenda do
    // card na tela: "Servidores com leitura recente").
    const avaliados = servidores.filter(servidor => servidor.resumo !== null && !servidor.semDados).length;
    return { avaliados, esperados };
}

function legendaDePerfis(servidores) {
    const nomes = [...new Set(servidores.map(servidor => servidor.nome_perfil))];
    return nomes.length === 0 ? "Nenhum perfil afetado" : juntarComE(nomes);
}

function montarIndicadores(servidores) {
    // "!servidor.semDados" garante que as 3 categorias nao se sobrepoem: um servidor
    // com leitura desatualizada conta so como "sem dados", mesmo que a ultima
    // severidade conhecida dele fosse critico ou atencao.
    const criticos = servidores.filter(servidor => !servidor.semDados && servidor.resumo && servidor.resumo.severidade === "critico");
    const atencao = servidores.filter(servidor => !servidor.semDados && servidor.resumo && servidor.resumo.severidade === "atencao");
    // "Sem dados" cobre tanto quem falhou ao buscar no S3 quanto quem respondeu mas
    // nao tinha o campo "severidade", quanto quem respondeu mas com leitura antiga
    // demais (ver foraDoPrazoDeRecencia).
    const semDados = servidores.filter(servidor => servidor.semDados);

    return {
        criticos: criticos.length,
        criticosLegenda: legendaDePerfis(criticos),
        atencao: atencao.length,
        atencaoLegenda: legendaDePerfis(atencao),
        semDadosRecentes: semDados.length,
        semDadosLegenda: legendaDePerfis(semDados)
    };
}

function montarDescricaoPerfil(critico, atencao, normal, semDados) {
    const partes = [];
    if (critico > 0) partes.push(`${critico} ${critico === 1 ? "crítico" : "críticos"}`);
    if (atencao > 0) partes.push(`${atencao} atenção`);
    if (normal > 0) partes.push(`${normal} ${normal === 1 ? "normal" : "normais"}`);
    if (semDados > 0) partes.push(`${semDados} sem dados recentes`);
    return partes.length > 0 ? partes.join(" · ") : "Nenhum servidor avaliado";
}

// Olha so para os servidores JA AFETADOS (criticos + atencao) de um perfil e procura,
// entre as metricas deles, a mais antiga em atencao (em_atencao_desde) - isso diz desde
// quando a situacao do perfil comecou. Tambem junta as categorias de metrica
// envolvidas, usadas no campo "sinal".
function calcularDuracaoDoPerfil(servidoresAfetados) {
    let maisAntigo = null;
    const categorias = new Set();

    for (const servidor of servidoresAfetados) {
        if (!servidor.resumo) continue;
        percorrerMedidas(servidor.resumo.resumos, function (leitura) {
            const tempo = leitura.tempo_no_estado;
            if (!tempo || tempo.estado_atual === "normal" || !tempo.em_atencao_desde) return;

            const categoria = categoriaDaMetrica(leitura.metrica);
            if (categoria) categorias.add(categoria);

            const instante = interpretarInstante(tempo.em_atencao_desde);
            if (maisAntigo === null || instante < maisAntigo) maisAntigo = instante;
        });
    }

    if (maisAntigo === null) {
        // Nenhuma leitura tinha tempo_no_estado utilizavel - por exemplo, quando a
        // severidade veio so da regra de OOM (ram_oom_kills nao tem limite configurado
        // em nenhum perfil, entao nunca gera tempo_no_estado). Nao inventamos um numero.
        return { duracao: "—", referencia: "Nenhum dado de duração disponível", categorias: [] };
    }

    return {
        duracao: formatarDuracaoDesde(maisAntigo),
        referencia: `Desde ${formatarHorarioDeInstante(maisAntigo)}`,
        categorias: [...categorias]
    };
}

function montarPerfil(nome, servidoresDoPerfil) {
    const total = servidoresDoPerfil.length;
    const criticos = servidoresDoPerfil.filter(servidor => !servidor.semDados && servidor.resumo && servidor.resumo.severidade === "critico");
    const atencao = servidoresDoPerfil.filter(servidor => !servidor.semDados && servidor.resumo && servidor.resumo.severidade === "atencao");
    const semDados = servidoresDoPerfil.filter(servidor => servidor.semDados);
    const normais = total - criticos.length - atencao.length - semDados.length;
    const afetados = criticos.length + atencao.length;

    const { duracao, referencia, categorias } = calcularDuracaoDoPerfil([...criticos, ...atencao]);

    let sinal = "Nenhum sinal de risco no momento";
    if (afetados > 0) sinal = categorias.length > 0 ? juntarComE(categorias) : "Severidade do dia";

    return {
        nome,
        sinal,
        afetados: `${afetados} de ${total}`,
        proporcao: `${total > 0 ? Math.round((afetados / total) * 100) : 0}% do perfil`,
        distribuicao: { critico: criticos.length, atencao: atencao.length, normal: normais, semDados: semDados.length },
        descricao: montarDescricaoPerfil(criticos.length, atencao.length, normais, semDados.length),
        duracao,
        referencia
    };
}

function montarPerfis(servidores) {
    const nomesPerfis = [...new Set(servidores.map(servidor => servidor.nome_perfil))];
    return nomesPerfis.map(nome => montarPerfil(nome, servidores.filter(servidor => servidor.nome_perfil === nome)));
}

// Monta um resumo vazio, usado quando ainda nao conseguimos buscar nenhum dado real
// (ex.: na primeira tentativa, se o bucket estiver fora do ar). Assim a rota sempre
// devolve um formato valido, em vez de travar ou devolver undefined.
function resumoSemDados() {
    return {
        estado: montarEstado(),
        cobertura: { avaliados: 0, esperados: 0 },
        indicadores: {
            criticos: 0, criticosLegenda: "Sem dados",
            atencao: 0, atencaoLegenda: "Sem dados",
            semDadosRecentes: 0, semDadosLegenda: "Ainda não temos dados do resumo diário."
        },
        perfis: []
    };
}

async function construirResumoGeral() {
    const servidoresDaEmpresa = await servidorModel.listarServidoresParaMonitoramento(ID_EMPRESA_IFOOD);
    const dataDeHoje = resumoGoldService.dataDeHojeSaoPaulo();

    const servidores = await Promise.all(servidoresDaEmpresa.map(async function (servidor) {
        try {
            const resumo = await resumoGoldService.buscarResumoDoServidor(servidor.endereco_mac, dataDeHoje);
            const semDados = resumo.severidade === undefined || foraDoPrazoDeRecencia(resumo);
            return { ...servidor, resumo, semDados };
        } catch (erro) {
            // Esperado enquanto o pipeline Python ainda nao processou o dia para esse
            // servidor (ex.: NoSuchKey) - nao deve derrubar a agregacao inteira.
            console.warn(`Aviso: sem resumo de hoje (${dataDeHoje}) para ${servidor.nome} (${servidor.endereco_mac}): ${erro.message}`);
            return { ...servidor, resumo: null, semDados: true };
        }
    }));

    return {
        estado: montarEstado(),
        cobertura: montarCobertura(servidores, servidoresDaEmpresa.length),
        indicadores: montarIndicadores(servidores),
        perfis: montarPerfis(servidores)
    };
}

async function atualizarCache() {
    try {
        resumoEmCache = await construirResumoGeral();
    } catch (erro) {
        console.error("Erro ao atualizar o resumo geral da dashboard:", erro.message);
        // Se ja tinhamos um resumo de uma atualizacao anterior, mantemos ele no ar
        // (dado desatualizado e melhor do que a rota ficar sem nada). So cai no
        // "sem dados" se essa falha aconteceu na primeira tentativa.
        if (resumoEmCache === null) resumoEmCache = resumoSemDados();
    }
}

function obterResumoGeral() {
    return resumoEmCache ?? resumoSemDados();
}

// Busca os dados uma vez, imediatamente, para o primeiro usuario nao precisar esperar
// os 5 minutos do intervalo - e depois repete essa busca periodicamente em segundo
// plano (em vez de buscar a cada requisicao, que deixaria a dashboard lenta).
function iniciar() {
    atualizarCache();
    setInterval(atualizarCache, INTERVALO_ATUALIZACAO_MS);
}

module.exports = { iniciar, obterResumoGeral };
