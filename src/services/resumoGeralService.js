// Monta o resumo da dashboard Geral (ver public/scripts/inicioDashboard.js) a partir
// dos resumos diarios reais que o pipeline Python deixa no S3, um por servidor.
//
// Cobre os campos "estado", "cobertura", "indicadores", "perfis", "resumo", "acoes",
// "riscos", "evolucao" e "evolucaoLegenda". So "perguntasProntas" continua vindo do
// mock (public/scripts/geralMock.js)
const servidorModel = require("../models/servidorModel");
const resumoGoldService = require("./resumoGoldService");
const sinaisExternosService = require("./sinaisExternosService");

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

function formatarMinutos(minutos) {
    if (minutos < 60) return `${minutos} min`;
    const horas = Math.floor(minutos / 60);
    const minutosRestantes = minutos % 60;
    return minutosRestantes === 0 ? `${horas}h` : `${horas}h ${minutosRestantes}min`;
}

function formatarDuracaoDesde(instante) {
    const agora = resumoGoldService.agoraOuReferenciaDemo();
    const minutos = Math.max(0, Math.round((agora.getTime() - instante.getTime()) / 60000));
    return formatarMinutos(minutos);
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
    }, resumoGoldService.agoraOuReferenciaDemo());
    const mes = MESES_ABREVIADOS[Number(campos.month) - 1];
    return {
        titulo: `Última leitura: ${campos.hour}h${campos.minute}`,
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
        return { duracao: "—", referencia: "Nenhum dado de duração disponível", categorias: [], maisAntigo: null };
    }

    return {
        duracao: formatarDuracaoDesde(maisAntigo),
        referencia: `Desde ${formatarHorarioDeInstante(maisAntigo)}`,
        categorias: [...categorias],
        maisAntigo
    };
}

function temOomAtivo(servidoresAfetados) {
    return servidoresAfetados.some(servidor => servidor.resumo?.resumos?.ram?.oom?.total_observado > 0);
}

function montarPerfil(nome, servidoresDoPerfil) {
    const total = servidoresDoPerfil.length;
    const criticos = servidoresDoPerfil.filter(servidor => !servidor.semDados && servidor.resumo && servidor.resumo.severidade === "critico");
    const atencao = servidoresDoPerfil.filter(servidor => !servidor.semDados && servidor.resumo && servidor.resumo.severidade === "atencao");
    const semDados = servidoresDoPerfil.filter(servidor => servidor.semDados);
    const normais = total - criticos.length - atencao.length - semDados.length;
    const afetados = criticos.length + atencao.length;

    const servidoresAfetados = [...criticos, ...atencao];
    const { duracao, referencia, categorias, maisAntigo } = calcularDuracaoDoPerfil(servidoresAfetados);
    const temOom = temOomAtivo(servidoresAfetados);

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
        referencia,
        maisAntigo,
        criticidadeNegocio: servidoresDoPerfil[0]?.criticidade_negocio ?? 0,
        temOom
    };
}

function montarPerfis(servidores) {
    const nomesPerfis = [...new Set(servidores.map(servidor => servidor.nome_perfil))];
    return nomesPerfis.map(nome => montarPerfil(nome, servidores.filter(servidor => servidor.nome_perfil === nome)));
}

//2h de baldes de 5 min da 24 pontos pro grafico
const JANELA_EVOLUCAO_MS = 2 * 60 * 60 * 1000;

// a gold agora manda resumo.evolucao (lista de {instante, estado} por servidor, ja
// classificado em baldes de 5 min - ver resumos_gold.AcumuladorEvolucao). mas nem
// todo servidor tem leitura exatamente no mesmo balde que os outros, entao primeiro
// preciso achar todos os instantes que apareceram em QUALQUER servidor, pra montar
// um eixo de tempo so, compartilhado
function construirEixoDeHorarios(servidores, agora) {
    const corte = agora.getTime() - JANELA_EVOLUCAO_MS;
    const instantes = new Set();
    for (const servidor of servidores) {
        for (const ponto of servidor.resumo?.evolucao ?? []) {
            if (Date.parse(ponto.instante) >= corte) instantes.add(ponto.instante);
        }
    }
    return [...instantes].sort();
}

// pra cada servidor, se ele nao tem leitura num balde que outro servidor tem, uso
// "normal" como padrao (nao e "sem dados", e so que naquele balde nao achei nada
// fora do normal pra registrar - se um dia isso virar problema a gente revisita)
function montarEvolucao(servidores, agora) {
    const instantes = construirEixoDeHorarios(servidores, agora);
    const horarios = instantes.map(instante => formatarHorarioDeInstante(new Date(instante)));

    const porServidor = servidores
        .filter(servidor => (servidor.resumo?.evolucao ?? []).length > 0)
        .map(servidor => {
            const estadoPorInstante = new Map(servidor.resumo.evolucao.map(ponto => [ponto.instante, ponto.estado]));
            return {
                nome: servidor.nome,
                nome_perfil: servidor.nome_perfil,
                estados: instantes.map(instante => estadoPorInstante.get(instante) ?? "normal")
            };
        });

    return { horarios, porServidor };
}

function servidoresDaEvolucao(evolucao, nomePerfil) {
    if (!evolucao || !Array.isArray(evolucao.porServidor)) return [];
    if (!nomePerfil) return evolucao.porServidor;
    return evolucao.porServidor.filter(servidor => servidor.nome_perfil === nomePerfil);
}

function contarAfetadosNoBalde(servidores, indice) {
    const criticos = servidores.filter(servidor => servidor.estados[indice] === "critico").length;
    const atencao = servidores.filter(servidor => servidor.estados[indice] === "atencao").length;
    return { criticos, atencao, total: criticos + atencao };
}

function classificarTransicao(antes, depois) {
    if (antes === "atencao" && depois === "critico") return "piorou";
    if (antes === "normal" && depois === "critico") return "criticoDireto";
    if (antes === "normal" && depois === "atencao") return "casoNovo";
    if (antes === "critico" && depois === "atencao") return "voltaramParaAtencao";
    if ((antes === "critico" || antes === "atencao") && depois === "normal") return "voltaramParaNormal";
    return null;
}

const ORDEM_TRANSICOES = ["piorou", "criticoDireto", "casoNovo", "voltaramParaAtencao", "voltaramParaNormal"];

function verbo(quantidade, singular, plural) {
    return quantidade === 1 ? singular : plural;
}

function fraseDaTransicao(tipo, nomes) {
    const quantidade = nomes.length;
    if (quantidade === 0) return "";
    const lista = juntarComE(nomes);
    if (tipo === "piorou") return `${lista} ${verbo(quantidade, "passou", "passaram")} de atenção para crítico.`;
    if (tipo === "criticoDireto") return `${lista} ${verbo(quantidade, "entrou", "entraram")} em crítico sem passar por atenção. Caso grave, sem aviso prévio.`;
    if (tipo === "casoNovo") return `${lista} ${verbo(quantidade, "entrou", "entraram")} em atenção.`;
    if (tipo === "voltaramParaAtencao") return `${lista} ${verbo(quantidade, "voltou", "voltaram")} de crítico para atenção.`;
    return `${lista} ${verbo(quantidade, "voltou", "voltaram")} para a normalidade.`;
}

function complementoDeTotais(antes, depois) {
    if (depois.total === antes.total) return ` O total de afetados continuou em ${depois.total}.`;
    if (depois.total > antes.total) return ` O total de afetados subiu de ${antes.total} para ${depois.total}.`;
    return ` O total de afetados caiu de ${antes.total} para ${depois.total}.`;
}

function complementoDeEstabilidade(evolucao, indice) {
    const ultimo = evolucao.horarios.length - 1;
    return indice < ultimo ? ` Seguiu assim até ${evolucao.horarios[ultimo]}.` : "";
}

function montarLegendaEvolucao(evolucao, nomePerfil) {
    const horarios = evolucao?.horarios ?? [];
    if (horarios.length === 0) return "Nenhuma variação registrada ainda.";

    const servidores = servidoresDaEvolucao(evolucao, nomePerfil);
    if (servidores.length === 0) return "Nenhuma variação registrada ainda.";

    let indice = -1;
    for (let i = horarios.length - 1; i >= 1; i--) {
        if (servidores.some(servidor => classificarTransicao(servidor.estados[i - 1], servidor.estados[i]))) {
            indice = i;
            break;
        }
    }

    if (indice === -1) {
        const primeiro = contarAfetadosNoBalde(servidores, 0);
        if (primeiro.total === 0) return "Nenhuma variação registrada ainda.";
        const partes = [];
        if (primeiro.criticos > 0) partes.push(`${primeiro.criticos} ${primeiro.criticos === 1 ? "crítico" : "críticos"}`);
        if (primeiro.atencao > 0) partes.push(`${primeiro.atencao} em atenção`);
        return `Sem mudança no período: ${juntarComE(partes)} desde ${horarios[0]}.`;
    }

    const grupos = new Map();
    for (const servidor of servidores) {
        const tipo = classificarTransicao(servidor.estados[indice - 1], servidor.estados[indice]);
        if (!tipo) continue;
        if (!grupos.has(tipo)) grupos.set(tipo, []);
        grupos.get(tipo).push(servidor.nome);
    }

    const frases = ORDEM_TRANSICOES
        .filter(tipo => grupos.has(tipo))
        .map(tipo => fraseDaTransicao(tipo, grupos.get(tipo)));

    const antes = contarAfetadosNoBalde(servidores, indice - 1);
    const depois = contarAfetadosNoBalde(servidores, indice);
    return `Às ${horarios[indice]}, ${frases.join(" ")}${complementoDeTotais(antes, depois)}${complementoDeEstabilidade(evolucao, indice)}`;
}

function proporcaoAfetada(perfil) {
    const distribuicao = perfil.distribuicao;
    const total = distribuicao.critico + distribuicao.atencao + distribuicao.normal + distribuicao.semDados;
    return total > 0 ? (distribuicao.critico + distribuicao.atencao) / total : 0;
}

const CRITERIOS_PRIORIDADE = [
    {
        nome: "criticidade",
        motivo: "Prioridade de negócio mais alta entre os perfis com ocorrência, mesmo com proporção parecida.",
        comparar: (a, b) => Number(b.criticidadeNegocio ?? 0) - Number(a.criticidadeNegocio ?? 0),
        ehRelevante: perfil => Number(perfil.criticidadeNegocio ?? 0) > 0
    },
    {
        nome: "duracao",
        motivo: "Situação crítica em aberto há mais tempo que os demais perfis afetados.",
        comparar: (a, b) => {
            if (!a.maisAntigo) return b.maisAntigo ? 1 : 0;
            if (!b.maisAntigo) return -1;
            return new Date(a.maisAntigo).getTime() - new Date(b.maisAntigo).getTime();
        },
        ehRelevante: perfil => Boolean(perfil.maisAntigo)
    },
    {
        nome: "proporcao",
        motivo: "Maior proporção de servidores afetados e crítico mais antigo.",
        comparar: (a, b) => proporcaoAfetada(b) - proporcaoAfetada(a),
        ehRelevante: perfil => proporcaoAfetada(perfil) > 0
    }
];

function perfisAfetadosOrdenados(perfis) {
    return perfis
        .filter(perfil => perfil.distribuicao.critico + perfil.distribuicao.atencao > 0)
        .slice()
        .sort(function (a, b) {
            for (const criterio of CRITERIOS_PRIORIDADE) {
                const diferenca = criterio.comparar(a, b);
                if (diferenca !== 0) return diferenca;
            }
            return 0;
        });
}

function criterioDecisivo(ordenados) {
    const vencedor = ordenados[0];
    if (ordenados.length > 1) {
        for (const criterio of CRITERIOS_PRIORIDADE) {
            if (criterio.comparar(vencedor, ordenados[1]) !== 0) return criterio;
        }
    }
    return CRITERIOS_PRIORIDADE.find(criterio => criterio.ehRelevante(vencedor))
        ?? CRITERIOS_PRIORIDADE[CRITERIOS_PRIORIDADE.length - 1];
}

// Ao contrario de criterioDecisivo (que para no primeiro criterio que ja diferencia o
// vencedor do 2o colocado - o suficiente pro motivo curto do card de resumo), esta
// devolve TODOS os criterios relevantes pro perfil vencedor, mesmo os que nao foram
// precisos pra decidir o desempate. Existe pra alimentar a resposta completa da
// pergunta pronta "Por que o Financeiro e a prioridade?" do assistente (hipotese D,
// ainda nao implementada) - o card de resumo continua enxuto, so com o motivo
// decisivo; aqui e onde entra "tambem esta em maior proporcao" mesmo quando isso nao
// foi o que decidiu o ranking contra o 2o colocado.
function todosCriteriosRelevantes(perfil) {
    return CRITERIOS_PRIORIDADE.filter(criterio => criterio.ehRelevante(perfil)).map(criterio => criterio.motivo);
}

function montarAvisoSemDados(perfis) {
    const afetados = perfis.filter(perfil => perfil.distribuicao.semDados > 0);
    if (afetados.length === 0) return "";
    return ` ${juntarComE(afetados.map(perfil => perfil.nome))} com servidor sem dados recentes.`;
}

function montarResumo(perfis, cobertura) {
    const ordenados = perfisAfetadosOrdenados(perfis);
    const avisoSemDados = montarAvisoSemDados(perfis);
    if (ordenados.length === 0) {
        // Decisao atual: nao montar aqui um "tudo estável, mas X normalizou às Yh".
        // Isso depende de ler client/lotes/.../capturas.json (mesmo trabalho da
        // evolucao real do grafico) - nao e esquecimento.
        return {
            titulo: "Nenhum perfil com servidores afetados no momento",
            motivo: "Não há servidores em crítico ou atenção entre os perfis avaliados.",
            comparacao: [],
            cobertura: `Entre os ${cobertura.esperados} servidores, ${cobertura.avaliados} puderam ser avaliados.${avisoSemDados}`
        };
    }

    const perfilPrioridade = ordenados[0];
    const motivoPrincipal = criterioDecisivo(ordenados).motivo;
    const motivo = perfilPrioridade.temOom === true
        ? `${motivoPrincipal} Também registrou evento de falta de memória (OOM) hoje.`
        : motivoPrincipal;
    return {
        titulo: `${perfilPrioridade.nome} exige atenção primeiro`,
        motivo,
        comparacao: ordenados.slice(0, 2).map(perfil => ({
            perfil: perfil.nome,
            afetados: perfil.afetados,
            duracao: `Crítico há ${perfil.duracao}`
        })),
        cobertura: `Entre os ${cobertura.esperados} servidores, ${cobertura.avaliados} puderam ser avaliados.${avisoSemDados}`
    };
}

function nomesAfetadosDoPerfil(nomePerfil, servidores) {
    return servidores
        .filter(servidor => servidor.nome_perfil === nomePerfil && !servidor.semDados
            && servidor.resumo && (servidor.resumo.severidade === "critico" || servidor.resumo.severidade === "atencao"))
        .map(servidor => servidor.nome);
}

function montarAcoes(servidores, perfis) {
    const ordenados = perfisAfetadosOrdenados(perfis);
    const acoes = [];

    if (ordenados.length > 0) {
        const perfilPrioridade = ordenados[0];
        const nomes = nomesAfetadosDoPerfil(perfilPrioridade.nome, servidores);
        if (nomes.length > 0) {
            acoes.push({
                titulo: `Investigar o ${perfilPrioridade.nome}`,
                destino: `Alertas · ${juntarComE(nomes)}`
            });
        }
    }

    for (const servidor of servidores.filter(item => item.semDados)) {
        const fim = servidor.resumo && servidor.resumo.resumos && servidor.resumo.resumos.fim;
        acoes.push({
            titulo: `Verificar a coleta de ${servidor.nome}`,
            destino: fim
                ? `Servidores · última leitura às ${formatarHorarioDeInstante(interpretarInstante(fim))}`
                : "Servidores · sem leitura registrada"
        });
    }

    if (ordenados.length > 1) {
        const segundoPerfil = ordenados[1];
        const nomes = nomesAfetadosDoPerfil(segundoPerfil.nome, servidores);
        if (nomes.length > 0) {
            acoes.push({
                titulo: `Comparar o pico do ${segundoPerfil.nome}`,
                destino: `Servidores · ${juntarComE(nomes)}`
            });
        }
    }

    return acoes;
}

// Riscos em acompanhamento: percorre as leituras de cada servidor avaliado procurando
// o campo previsao_limite, que a Gold ja calcula e injeta (resumos_gold.calcular_previsao,
// por metrica). So pega os 3 mais urgentes (menor minutosEstimados primeiro).
function montarRiscos(servidores) {
    const riscos = [];

    for (const servidor of servidores) {
        if (servidor.semDados || !servidor.resumo) continue;

        percorrerMedidas(servidor.resumo.resumos, function (leitura) {
            const previsao = leitura.previsao_limite;
            if (!previsao) return;

            const categoria = categoriaDaMetrica(leitura.metrica) ?? "Métrica";
            const valorRecente = leitura.maximo ?? leitura.ultimo_valor;
            const unidadeBruta = leitura.unidade ?? "";
            const unidade = unidadeBruta === "%" ? unidadeBruta : ` ${unidadeBruta}`;

            riscos.push({
                tag: "Projeção de limite",
                tom: previsao.proximo_estado === "critico" ? "critico" : "neutro",
                titulo: `${categoria} · ${servidor.nome}`,
                detalhe: `${valorRecente != null ? `${valorRecente.toFixed(0)}${unidade} hoje · ` : ""}`
                    + `pode cruzar ${previsao.limite}${unidade} em ~${formatarMinutos(previsao.minutos_estimados)}.`,
                acao: `Revisar ${categoria.toLowerCase()} de ${servidor.nome}.`,
                nome_perfil: servidor.nome_perfil,
                minutosEstimados: previsao.minutos_estimados
            });
        });
    }

    return riscos
        .sort((a, b) => a.minutosEstimados - b.minutosEstimados)
        .slice(0, 3)
        .map(({ minutosEstimados, ...risco }) => risco);
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
        perfis: [],
        resumo: montarResumo([], { avaliados: 0, esperados: 0 }),
        acoes: [],
        riscos: [],
        sinaisExternos: sinaisExternosService.obterSinaisExternos(),
        evolucao: { horarios: [], porServidor: [] },
        evolucaoLegenda: montarLegendaEvolucao({ horarios: [], porServidor: [] })
    };
}

async function construirResumoGeral() {
    const servidoresDaEmpresa = await servidorModel.listarServidoresParaMonitoramento(ID_EMPRESA_IFOOD);
    const dataDeHoje = resumoGoldService.dataDeHojeSaoPaulo();
    const agora = resumoGoldService.agoraOuReferenciaDemo();

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

    const perfis = montarPerfis(servidores);
    const cobertura = montarCobertura(servidores, servidoresDaEmpresa.length);
    const evolucao = montarEvolucao(servidores, agora);
    const evolucaoLegenda = montarLegendaEvolucao(evolucao);
    for (const perfil of perfis) perfil.evolucaoLegenda = montarLegendaEvolucao(evolucao, perfil.nome);

    return {
        estado: montarEstado(),
        cobertura,
        indicadores: montarIndicadores(servidores),
        perfis,
        resumo: montarResumo(perfis, cobertura),
        acoes: montarAcoes(servidores, perfis),
        riscos: montarRiscos(servidores),
        sinaisExternos: sinaisExternosService.obterSinaisExternos(),
        evolucao,
        evolucaoLegenda
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
