/*
 * Transformação dos históricos de processos. Este arquivo não conhece Chart.js
 * nem elementos da página: apenas recebe amostras reais e devolve séries
 * agregadas. Pode ser usado no navegador (window.ProcessosAgregacao) e em Node
 * (module.exports) para os testes.
 */
(function (global) {
    "use strict";

    // Chaves = valores do seletor "Período dos gráficos" em processos.html.
    // O filtro de 30 dias não existe na página, então o passo de 6 horas não
    // é mapeado: o período máximo disponível (7 dias) usa 1 hora.
    const GRANULARIDADES = Object.freeze({
        60: 1,      // última hora   -> 1 minuto
        360: 5,     // últimas 6 h   -> 5 minutos
        1440: 15,   // últimas 24 h  -> 15 minutos
        10080: 60   // últimos 7 d   -> 1 hora
    });

    const FAIXAS_CPU = Object.freeze(["ate25", "ate50", "ate75", "acima75"]);
    const FUSO = "America/Sao_Paulo";

    function granularidadePara(periodoMinutos) {
        const passo = GRANULARIDADES[Number(periodoMinutos)];
        return passo != null ? passo : null;
    }

    /**
     * Início do intervalo em epoch ms. O fuso de São Paulo tem offset inteiro
     * de horas e todos os passos dividem uma hora, então o limite epoch
     * coincide com o limite local (ex.: 13:00Z == 10:00 em São Paulo).
     */
    function inicioDoIntervalo(instante, minutos) {
        const tempo = typeof instante === "number" ? instante : Date.parse(instante);
        const passo = Number(minutos);
        const largura = passo * 60000;
        if (!Number.isFinite(tempo) || !Number.isFinite(largura) || largura <= 0) return null;
        return Math.floor(tempo / largura) * largura;
    }

    function valorDaLeitura(leitura) {
        if (leitura == null) return null;
        if (typeof leitura === "object") {
            for (const chave of ["valor", "ultimo_valor", "media"]) {
                if (leitura[chave] !== undefined) {
                    const numero = Number(leitura[chave]);
                    return Number.isFinite(numero) ? numero : null;
                }
            }
            return null;
        }
        const numero = Number(leitura);
        return Number.isFinite(numero) ? numero : null;
    }

    /**
     * Converte as amostras do serviço uma única vez. Leituras com status
     * inválido viram null: ausência de dado nunca é tratada como zero.
     */
    function prepararAmostras(amostras) {
        if (!Array.isArray(amostras)) return [];
        return amostras
            .map(amostra => {
                const tempo = typeof amostra.timestamp === "number"
                    ? amostra.timestamp
                    : Date.parse(amostra.timestamp);
                const memoriaValida = amostra.memoriaValida !== false;
                return {
                    timestamp: amostra.timestamp,
                    tempo,
                    cpu: amostra.valido === false ? null : valorDaLeitura(amostra.cpu),
                    memoria: memoriaValida ? valorDaLeitura(amostra.memoria) : null,
                    // RSS em bytes vem do mesmo lote; guardado para o tooltip de RAM.
                    rssBytes: memoriaValida ? valorDaLeitura(amostra.rssBytes) : null
                };
            })
            .filter(amostra => Number.isFinite(amostra.tempo))
            .sort((a, b) => a.tempo - b.tempo);
    }

    function construirIntervalos(amostras, minutos) {
        const largura = Number(minutos) * 60000;
        if (!Number.isFinite(largura) || largura <= 0 || amostras.length === 0) return [];

        const primeiro = inicioDoIntervalo(amostras[0].tempo, minutos);
        const ultimo = inicioDoIntervalo(amostras[amostras.length - 1].tempo, minutos);
        const intervalos = [];

        for (let inicio = primeiro; inicio <= ultimo; inicio += largura) {
            intervalos.push({ inicio, fim: inicio + largura, amostras: [] });
        }

        const porInicio = new Map(intervalos.map(item => [item.inicio, item]));
        for (const amostra of amostras) {
            const intervalo = porInicio.get(inicioDoIntervalo(amostra.tempo, minutos));
            if (intervalo) intervalo.amostras.push(amostra);
        }
        return intervalos;
    }

    /**
     * Duração típica de uma captura (mediana dos intervalos observados). Uma
     * leitura não representa mais do que esse tempo, mesmo que a próxima
     * captura demore; o restante vira lacuna explícita.
     */
    function duracaoRepresentativa(amostras, minutos) {
        const intervalos = [];
        for (let i = 1; i < amostras.length; i++) {
            const delta = amostras[i].tempo - amostras[i - 1].tempo;
            if (delta > 0) intervalos.push(delta);
        }
        if (intervalos.length === 0) return Number(minutos) * 60000;

        intervalos.sort((a, b) => a - b);
        const meio = Math.floor(intervalos.length / 2);
        return intervalos.length % 2 === 1
            ? intervalos[meio]
            : (intervalos[meio - 1] + intervalos[meio]) / 2;
    }

    // CPU de processo pode passar de 100% em servidor multinúcleo: sem clamp.
    function faixaCpu(valor) {
        if (valor == null || !Number.isFinite(valor) || valor < 0) return null;
        if (valor <= 25) return "ate25";
        if (valor <= 50) return "ate50";
        if (valor <= 75) return "ate75";
        return "acima75";
    }

    function distribuicaoComAmostras(amostras, minutos, intervalos, validade) {
        const largura = Number(minutos) * 60000;
        const representativa = validade != null ? validade : duracaoRepresentativa(amostras, minutos);
        const lista = intervalos || construirIntervalos(amostras, minutos);

        return lista.map(intervalo => {
            const temposMs = { ate25: 0, ate50: 0, ate75: 0, acima75: 0 };
            let observadoMs = 0;

            for (let i = 0; i < intervalo.amostras.length; i++) {
                const atual = intervalo.amostras[i];
                const proxima = intervalo.amostras[i + 1];
                const fimCobertura = Math.min(
                    intervalo.fim,
                    proxima ? proxima.tempo : intervalo.fim,
                    atual.tempo + representativa
                );
                const duracao = Math.max(0, fimCobertura - atual.tempo);
                if (duracao === 0) continue;

                const faixa = faixaCpu(atual.cpu);
                // Sem leitura válida o tempo vai para lacuna, nunca para "baixo".
                if (faixa === null) continue;
                temposMs[faixa] += duracao;
                observadoMs += duracao;
            }

            const proporcoes = observadoMs > 0 ? {} : null;
            if (proporcoes) {
                let soma = 0;
                for (const faixa of FAIXAS_CPU) {
                    proporcoes[faixa] = temposMs[faixa] / observadoMs;
                    soma += proporcoes[faixa];
                }
                // Remove apenas o erro de ponto flutuante; a soma é exatamente 1.
                proporcoes[FAIXAS_CPU[FAIXAS_CPU.length - 1]] += 1 - soma;
            }

            return {
                inicio: intervalo.inicio,
                fim: intervalo.fim,
                observadoMs,
                semDadoMs: largura - observadoMs,
                temposMs,
                proporcoes
            };
        });
    }

    function serieComAmostras(intervalos, campo) {
        return intervalos.map(intervalo => {
            const validas = intervalo.amostras.filter(amostra => amostra[campo] != null);
            const ultima = validas.length > 0 ? validas[validas.length - 1] : null;
            return {
                inicio: intervalo.inicio,
                fim: intervalo.fim,
                t: ultima ? ultima.timestamp : null,
                v: ultima ? ultima[campo] : null,
                rssBytes: ultima ? (ultima.rssBytes == null ? null : ultima.rssBytes) : null
            };
        });
    }

    /** Distribuição temporal da CPU por faixa, ponderada pelo tempo observado. */
    function distribuicaoCpuPorIntervalo(amostras, minutos) {
        const preparadas = prepararAmostras(amostras);
        return distribuicaoComAmostras(preparadas, minutos);
    }

    /** Última leitura válida de cada intervalo, na unidade original da métrica. */
    function seriePorIntervalo(amostras, minutos, campo) {
        const preparadas = prepararAmostras(amostras);
        return serieComAmostras(construirIntervalos(preparadas, minutos), campo);
    }

    /**
     * Prepara CPU e RAM em uma única passagem. A distribuição alimenta o
     * gráfico de barras da CPU; os pontos de memória alimentam a área de RAM.
     */
    function prepararHistorico(amostras, periodoMinutos) {
        // Período fora do filtro conhecido usa o passo mais amplo configurado.
        const passo = granularidadePara(periodoMinutos) ||
            Math.max(...Object.values(GRANULARIDADES));
        const preparadas = prepararAmostras(amostras);
        const intervalos = construirIntervalos(preparadas, passo);
        const validade = duracaoRepresentativa(preparadas, passo);

        return {
            passoMinutos: passo,
            fuso: FUSO,
            cpu: {
                pontos: serieComAmostras(intervalos, "cpu"),
                distribuicao: distribuicaoComAmostras(preparadas, passo, intervalos, validade)
            },
            memoria: {
                pontos: serieComAmostras(intervalos, "memoria")
            }
        };
    }

    // Acima disso o gráfico fica denso demais para leitura em tela.
    const MAX_INTERVALOS_VISUAIS = 40;

    /**
     * Agrupa intervalos apenas para exibição. A soma de tempos e a última
     * leitura válida preservam os dados originais; nenhum valor é inventado.
     */
    function agruparBucketsCpu(distribuicao, fator) {
        const buckets = Array.isArray(distribuicao) ? distribuicao : [];
        if (fator <= 1) return buckets;

        const grupos = [];
        for (let i = 0; i < buckets.length; i += fator) {
            const fatia = buckets.slice(i, i + fator);
            if (fatia.length === 0) continue;

            const temposMs = { ate25: 0, ate50: 0, ate75: 0, acima75: 0 };
            let observadoMs = 0;
            let semDadoMs = 0;

            for (const bucket of fatia) {
                observadoMs += Number(bucket.observadoMs || 0);
                semDadoMs += Number(bucket.semDadoMs || 0);
                for (const faixa of FAIXAS_CPU) {
                    temposMs[faixa] += Number(
                        (bucket.temposMs && bucket.temposMs[faixa]) || 0
                    );
                }
            }

            const proporcoes = observadoMs > 0 ? {} : null;
            if (proporcoes) {
                let soma = 0;
                for (const faixa of FAIXAS_CPU) {
                    proporcoes[faixa] = temposMs[faixa] / observadoMs;
                    soma += proporcoes[faixa];
                }
                proporcoes[FAIXAS_CPU[FAIXAS_CPU.length - 1]] += 1 - soma;
            }

            grupos.push({
                inicio: fatia[0].inicio,
                fim: fatia[fatia.length - 1].fim,
                observadoMs,
                semDadoMs,
                temposMs,
                proporcoes
            });
        }
        return grupos;
    }

    function agruparPontosMemoria(pontos, fator) {
        const lista = Array.isArray(pontos) ? pontos : [];
        if (fator <= 1) return lista;

        const grupos = [];
        for (let i = 0; i < lista.length; i += fator) {
            const fatia = lista.slice(i, i + fator);
            if (fatia.length === 0) continue;

            const validas = fatia.filter(ponto => ponto && ponto.v != null);
            const ultima = validas.length > 0 ? validas[validas.length - 1] : null;
            grupos.push({
                inicio: fatia[0].inicio,
                fim: fatia[fatia.length - 1].fim,
                t: ultima ? ultima.t : null,
                v: ultima ? ultima.v : null,
                rssBytes: ultima
                    ? (ultima.rssBytes == null ? null : ultima.rssBytes)
                    : null
            });
        }
        return grupos;
    }

    /**
     * Reduz a densidade visual sem mudar a janela nem a unidade. O mesmo fator
     * é aplicado a CPU e RAM para as duas séries continuarem alinhadas.
     */
    function agruparParaExibicao(distribuicao, pontos, passoMinutos, limite = MAX_INTERVALOS_VISUAIS) {
        const maximo = Number(limite) > 0
            ? Math.max(1, Math.floor(Number(limite)))
            : MAX_INTERVALOS_VISUAIS;
        const comDadosCpu = (Array.isArray(distribuicao) ? distribuicao : [])
            .filter(bucket => bucket && bucket.observadoMs > 0).length;
        const comDadosRam = (Array.isArray(pontos) ? pontos : [])
            .filter(ponto => ponto && ponto.v != null).length;
        const fator = Math.max(1, Math.ceil(Math.max(comDadosCpu, comDadosRam) / maximo));
        const passo = Number(passoMinutos);

        return {
            distribuicao: agruparBucketsCpu(distribuicao, fator),
            pontos: agruparPontosMemoria(pontos, fator),
            passoMinutos: Number.isFinite(passo) && passo > 0 ? passo * fator : passoMinutos,
            passoOriginalMinutos: passoMinutos,
            fator
        };
    }

    /**
     * Variação entre leituras reais consecutivas. Intervalos sem leitura são
     * ignorados (não viram zero nem geram ponto); a diferença continua sendo
     * entre dois valores observados.
     */
    function serieVariacao(pontos) {
        const serie = [];
        let anterior = null;

        for (const ponto of Array.isArray(pontos) ? pontos : []) {
            const valor = ponto && ponto.v != null && Number.isFinite(Number(ponto.v))
                ? Number(ponto.v)
                : null;
            if (valor == null) continue;
            if (anterior != null) {
                serie.push({ t: ponto.t, v: valor - anterior });
            }
            anterior = valor;
        }
        return serie;
    }

    const api = Object.freeze({
        GRANULARIDADES,
        FAIXAS_CPU,
        MAX_INTERVALOS_VISUAIS,
        granularidadePara,
        inicioDoIntervalo,
        distribuicaoCpuPorIntervalo,
        seriePorIntervalo,
        prepararHistorico,
        agruparParaExibicao,
        serieVariacao
    });

    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else global.ProcessosAgregacao = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
