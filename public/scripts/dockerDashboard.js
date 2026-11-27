/* Dashboard de investigação de Docker.
 * Lê os resumos da fonte configurada por meio dos endpoints Node.
 * Filtros superiores limitados a sete dias; personalizado escolhe a granularidade pela duração.
 * Nenhuma credencial AWS fica no navegador.
 */
(function () {
    "use strict";
    const A = typeof module !== "undefined" && module.exports ? require("./dockerAnalise.js") : window.CoreTraceDockerAnalise;

    const N = typeof module !== "undefined" && module.exports ? require("./dockerNormalizacao.js") : window.CoreTraceDockerNormalizacao;

    const P = typeof module !== "undefined" && module.exports ? require("./dockerPeriodos.js") : window.CoreTraceDockerPeriodos;

    // Funções locais: não precisamos importar dockerDados.js para ler o JSON.
    // Não convertemos null em zero, pois a ausência da métrica não significa 0%.
    const D = (() => {
        const numero = (valor) => typeof valor === "number" && Number.isFinite(valor) ? valor : null;
        const total = (medida) => numero(medida?.total_observado);

        function instante(valor) {
            if (!valor) return null;
            const normalizado = String(valor).trim().replace(" ", "T")
                .replace(/\.(\d{3})\d+(?=Z|[+-]\d\d:\d\d$)/, ".$1");
            const data = new Date(normalizado);
            return Number.isNaN(data.getTime()) ? null : data;
        }
        function diaSaoPaulo(data) {
            if (!(data instanceof Date) || Number.isNaN(data.getTime())) return null;
            const partes = new Intl.DateTimeFormat("en-US", {
                timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
            }).formatToParts(data);
            const campo = (tipo) => partes.find((parte) => parte.type === tipo)?.value;
            return `${campo("year")}-${campo("month")}-${campo("day")}`;
        }
        function falhouNaData(container, data) {
            const ocorreu = diaSaoPaulo(instante(container?.finished_at)) === data;
            const codigo = numero(container?.exit_code);
            const oom = container?.oom_killed === true || String(container?.oom_killed).toLowerCase() === "true";
            return Boolean(ocorreu && ((codigo !== null && codigo !== 0) || oom));
        }
        function estado(container) {
            const status = String(container?.status || "unknown").toLowerCase();
            const codigo = numero(container?.exit_code);
            if (status === "running") return { rotulo: "Executando", classe: "" };
            if (status === "created") return { rotulo: "Criado · não iniciado", classe: "aviso" };
            if (status === "restarting") return { rotulo: "Reiniciando", classe: "aviso" };
            if (status === "paused") return { rotulo: "Pausado", classe: "aviso" };
            if (status === "exited" && codigo !== null && codigo !== 0) return { rotulo: `Falha · saída ${codigo}`, classe: "erro" };
            if (status === "exited") return { rotulo: "Encerrado", classe: "parado" };
            if (status === "dead") return { rotulo: "Inativo", classe: "erro" };
            return { rotulo: "Não identificado", classe: "parado" };
        }
        function resumoLog(log) {
            if (!log) return { total: null, erros: null, niveis: [], incompleto: true };
            const niveis = Object.entries(log.niveis || {}).map(([nome, medida]) => ({ nome, quantidade: total(medida) || 0 }));
            const desconhecidos = niveis.some(({ nome, quantidade }) => quantidade > 0 && !/^(error|err|warn|warning|info|debug|trace|fatal)$/i.test(nome));
            const erros = niveis.filter(({ nome }) => /^(error|err)$/i.test(nome)).reduce((soma, item) => soma + item.quantidade, 0);
            // Mesmo com níveis UNKNOWN podemos confirmar as mensagens marcadas
            // ERROR. Se não houve ERROR explícito e há UNKNOWN, o zero seria
            // enganoso: nesses casos continuamos mostrando "—".
            return {
                total: total(log.total),
                erros: desconhecidos && erros === 0 ? null : erros,
                niveis,
                incompleto: desconhecidos
            };
        }
        function validar(documento) {
            if (!documento || documento.tipo_documento !== "resumo_diario" ||
                !/^\d{4}-\d{2}-\d{2}$/.test(documento.data || "") ||
                !Array.isArray(documento.resumos?.containers)) {
                throw new Error("Esperado um resumo_diario com data e resumos.containers[].");
            }
            return {
                data: documento.data,
                intervalo: documento.granularidade === "hora" ? documento.intervalo : null,
                mac: documento.endereco_mac,
                hostOriginal: { cpu: documento.resumos.cpu?.inventario?.quantidade_logicas, ram: documento.resumos.ram?.capacidade_total },
                coberturaLocal: documento.prototipo_docker,
                seriesMinuto: documento.series_minuto?.versao === 1 ? documento.series_minuto.containers : null,
                containers: documento.resumos.containers,
                logs: documento.resumos.logs || [],
                logsIndividuais: Array.isArray(documento.logs) ? documento.logs : [],
                eventos: documento.resumos.eventos || []
            };
        }
        return { numero, total, instante, diaSaoPaulo, falhouNaData, estado, resumoLog, validar };
    })();

    const $ = (id) => document.getElementById(id);
    const formatoNumero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
    const formatoData = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
    let requisicaoHistorico = 0;
    let referenciaLocal = null;
    let historico = [];
    let historicoHorario = [];
    let historicoAtivo = [];
    let periodoDias = 7;
    let periodoPersonalizado = null;
    let intervaloAtivo = null;
    const usarHorario = () => periodoPersonalizado ? P.granularidade(periodoPersonalizado) !== "dia" : periodoDias <= 1;
    function referenciaSuperior() {
        if (Number.isFinite(referenciaLocal)) return referenciaLocal;
        const instantes = [...historico, ...historicoHorario].flatMap(doc => doc.containers.map(c => D.instante(c.ultima_observacao)?.getTime())).filter(Number.isFinite);
        return instantes.length ? Math.max(...instantes) : null;
    }

    function validarPeriodoPersonalizado(inicio, fim, referencia = referenciaSuperior()) {
        if (!inicio || !fim) throw new Error("Informe o início e o fim do período.");
        const periodo = A.periodoLogs(inicio, fim);
        // O formulário seleciona minutos exatos, sem estender o minuto final.
        periodo.fim -= 59999;
        if (periodo.fim <= periodo.inicio) throw new Error("O fim deve ser posterior ao início.");
        if (periodo.fim - periodo.inicio > 7 * 86400000) throw new Error("Selecione um intervalo de no máximo 7 dias corridos (168 horas).");
        if (!Number.isFinite(referencia)) throw new Error("Aguarde os dados do servidor para validar o período.");
        if (periodo.fim > referencia) throw new Error(`O período não pode ultrapassar o instante de referência: ${hora(new Date(referencia).toISOString())}.`);
        return periodo;
    }

    function filtrarIntervalo(lista, inicio, fim) {
        // Um resumo não pode ser repartido para inventar uma medição menor.
        return lista.filter((doc) => Date.parse(doc.intervalo?.inicio) >= inicio
            && instanteResumo(doc) > inicio && instanteResumo(doc) <= fim);
    }
    let graficosAtivos = [];
    let dados = null;
    let indicadores = null;
    let selecionadoId = null;
    let tipoPico = "cpu";
    let logsMaisRecentes = true;
    let logsPeriodo = { inicio: null, fim: null };
    let logsUltimas24h = true;
    let logsExibidos = [];
    let perfisDisponiveis = [];
    let servidoresDisponiveis = [];

    async function carregarContextos() {
        const idEmpresa = Number(sessionStorage.getItem("ID_EMPRESA"));
        const idUsuario = Number(sessionStorage.getItem("ID_USUARIO"));
        const perfilSelect = $("docker-perfil");
        const servidorSelect = $("docker-servidor");

        if (!Number.isSafeInteger(idEmpresa) || idEmpresa <= 0
            || !Number.isSafeInteger(idUsuario) || idUsuario <= 0) {
            throw new Error("Faça login para consultar os perfis e servidores disponíveis.");
        }

        const [respostaPerfis, respostaServidores] = await Promise.all([
            fetch(`/servidor/perfis?empresa=${encodeURIComponent(idEmpresa)}`, { cache: "no-store" }),
            fetch(`/servidor/lista?empresa=${encodeURIComponent(idEmpresa)}&usuario=${encodeURIComponent(idUsuario)}`, { cache: "no-store" })
        ]);
        if (!respostaPerfis.ok || !respostaServidores.ok) {
            throw new Error("Não foi possível consultar os perfis e servidores da empresa.");
        }
        [perfisDisponiveis, servidoresDisponiveis] = await Promise.all([respostaPerfis.json(), respostaServidores.json()]);
        if (!Array.isArray(perfisDisponiveis) || !Array.isArray(servidoresDisponiveis)) {
            throw new Error("A API retornou uma lista inválida de perfis ou servidores.");
        }

        perfilSelect.replaceChildren(...perfisDisponiveis.map((perfil) =>
            new Option(perfil.nome, String(perfil.id_perfil_servidor))));
        if (!perfisDisponiveis.length) perfilSelect.replaceChildren(new Option("Nenhum perfil disponível", ""));
        perfilSelect.disabled = !perfisDisponiveis.length;
        servidorSelect.replaceChildren(new Option("Selecione um servidor", ""), ...servidoresDisponiveis.map((servidor) =>
            new Option(servidor.nome, servidor.endereco_mac)));

        perfilSelect.addEventListener("change", () => {
            atualizarServidoresDoPerfil();
            trocarServidorSelecionado();
        });
        servidorSelect.addEventListener("change", trocarServidorSelecionado);
        atualizarServidoresDoPerfil();
    }

    function atualizarServidoresDoPerfil() {
        const perfilId = $("docker-perfil").value;
        const disponiveis = perfilId
            ? servidoresDisponiveis.filter((servidor) => String(servidor.id_perfil_servidor) === perfilId)
            : [];
        const atual = $("docker-servidor").value;
        $("docker-servidor").replaceChildren(new Option("Selecione um servidor", ""), ...disponiveis.map((servidor) =>
            new Option(servidor.nome, servidor.endereco_mac)));
        if (disponiveis.some((servidor) => servidor.endereco_mac === atual)) $("docker-servidor").value = atual;
        else if (disponiveis.length) $("docker-servidor").value = disponiveis[0].endereco_mac;
        atualizarServidorSelecionado();
    }

    function atualizarServidorSelecionado() {
        const servidor = servidoresDisponiveis.find((item) => item.endereco_mac === $("docker-servidor").value);
        if (!servidor) return;
        const perfil = perfisDisponiveis.find((item) => String(item.id_perfil_servidor) === String(servidor.id_perfil_servidor));
        $("docker-perfil").value = perfil ? String(perfil.id_perfil_servidor) : "";
        const resultado = $("docker-contexto-resultado");
        resultado.hidden = true;
        resultado.textContent = "";
    }

    async function trocarServidorSelecionado() {
        atualizarServidorSelecionado();
        const requisicao = ++requisicaoHistorico;
        selecionadoId = null;
        historico = [];
        historicoHorario = [];
        atualizarPeriodo();
        const feedback = $("docker-feedback");
        if (!$("docker-servidor").value) return;
        feedback.hidden = false;
        feedback.textContent = "Carregando resumos do servidor...";
        try {
            const documentos = await carregarHistorico();
            if (requisicao !== requisicaoHistorico) return;
            historico = documentos.filter((doc) => !doc.intervalo).sort((a, b) => a.data.localeCompare(b.data));
            historicoHorario = documentos.filter((doc) => doc.intervalo)
                .sort((a, b) => Date.parse(a.intervalo.fim) - Date.parse(b.intervalo.fim));
            atualizarPeriodo();
        } catch (erro) {
            if (requisicao !== requisicaoHistorico) return;
            feedback.hidden = false;
            feedback.textContent = `Não foi possível carregar os resumos do S3: ${erro.message}`;
            console.error("CoreTrace Docker:", erro);
        }
    }

    function n(valor, unidade = "") {
        return D.numero(valor) === null ? "—" : `${formatoNumero.format(valor)}${unidade}`;
    }
    function mb(valor) {
        return D.numero(valor) === null ? "—" : n(valor / (1024 * 1024), " MB");
    }
    function hora(valor) {
        const data = D.instante(valor);
        return data ? formatoData.format(data) + " BRT" : "—";
    }
    function encontrar(containerId, lista) {
        return lista.find((item) => item.container_id === containerId);
    }
    function adicionarTexto(pai, tag, texto, classe) {
        const elemento = document.createElement(tag);
        if (classe) elemento.className = classe;
        elemento.textContent = texto;
        pai.appendChild(elemento);
        return elemento;
    }

    async function carregarHistorico() {
        const mac = $("docker-servidor").value;
        const prefixo = `client/resumos/maquina=${mac}/`;
        const resposta = await fetch(`/s3Routes/arquivos?dashboard=docker&prefixo=${encodeURIComponent(prefixo)}`, { cache: "no-store" });
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status} ao listar os resumos.`);
        referenciaLocal = D.instante(resposta.headers.get("X-Docker-Referencia"))?.getTime() ?? null;
        const arquivos = await resposta.json();
        if (!Array.isArray(arquivos)) throw new Error("A API retornou uma lista inválida de arquivos.");
        const chaves = [...new Set(arquivos.map((arquivo) => arquivo.Key)
            .filter((chave) => typeof chave === "string" && chave.startsWith(prefixo) && chave.endsWith(".json")))];
        const documentos = [];
        // Limita as consultas simultâneas ao carregar o histórico do servidor.
        for (let indice = 0; indice < chaves.length; indice += 6) {
            const lote = await Promise.all(chaves.slice(indice, indice + 6).map(async (chave) => {
                const resultado = await fetch(`/s3Routes/conteudo?dashboard=docker&arquivo=${encodeURIComponent(chave)}`, { cache: "no-store" });
                if (!resultado.ok) throw new Error(`HTTP ${resultado.status} ao buscar um resumo.`);
                const corpo = await resultado.json();
                const original = typeof corpo.conteudo === "string" ? JSON.parse(corpo.conteudo) : corpo.conteudo;
                const documento = D.validar(original);
                if (documento.mac !== mac) throw new Error("O resumo não corresponde ao servidor selecionado.");
                if (original.granularidade === "hora" && (!documento.intervalo
                    || !D.instante(documento.intervalo.inicio) || !D.instante(documento.intervalo.fim)
                    || Date.parse(documento.intervalo.fim) - Date.parse(documento.intervalo.inicio) !== 3600000)) {
                    throw new Error("Resumo horário sem intervalo válido de uma hora.");
                }
                return documento;
            }));
            documentos.push(...lote);
        }
        return N.apresentar([...new Map(documentos.map((doc) => [doc.intervalo?.fim || doc.data, doc])).values()]);
    }

    function instanteResumo(doc) {
        return Date.parse(doc.intervalo?.fim || doc.data + "T12:00:00Z");
    }

    function filtrar24Horas(lista, fim = instanteResumo(lista.at(-1) || {})) {
        return lista.filter((doc) => instanteResumo(doc) > fim - 86400000 && instanteResumo(doc) <= fim);
    }

    function falhouNoResumo(container, doc) {
        if (!D.falhouNaData(container, doc.data)) return false;
        if (!doc.intervalo) return true;
        const fim = D.instante(container.finished_at)?.getTime();
        return fim > Date.parse(doc.intervalo.inicio) && fim <= Date.parse(doc.intervalo.fim);
    }

    function filtrarPeriodo(lista, dias) {
        if (!lista.length) return [];
        // Âncora na última data realmente disponível, não no dia de hoje:
        // isso mantém a janela relativa aos resumos disponíveis no S3.
        const dataFinal = Date.parse(lista.at(-1).data + "T00:00:00Z");
        const dataInicial = new Date(dataFinal - (dias - 1) * 86400000).toISOString().slice(0, 10);
        return lista.filter((doc) => doc.data >= dataInicial);
    }

    function containerNoDia(doc, referencia) {
        // Nome é o identificador estável da aplicação: IDs Docker podem mudar
        // quando um contêiner é recriado, e nosso histórico deve continuar.
        return doc.containers.find((c) => referencia.nome && c.nome === referencia.nome)
            || doc.containers.find((c) => c.container_id === referencia.container_id);
    }

    function reiniciosDetectados(lista, referencia) {
        if (temTotaisObservados(lista, referencia, c => c.reinicios?.total)) {
            const medidas = lista.map(doc => containerNoDia(doc, referencia)?.reinicios?.total?.observado_local);
            if (!medidas.length || medidas.some(m => !m || m.intervalos_desconhecidos > 0 || m.total === null)) return null;
            return medidas.reduce((soma, m) => soma + m.total, 0);
        }
        let anterior = null;
        let idAnterior = null;
        let diferencas = 0;
        let comparacoes = 0;
        for (const doc of lista) {
            const atual = containerNoDia(doc, referencia);
            const contador = D.numero(atual?.reinicios?.total?.ultimo_valor);
            if (contador === null) continue;
            if (anterior !== null && atual.container_id === idAnterior && contador >= anterior) {
                diferencas += contador - anterior;
                comparacoes++;
            }
            anterior = contador;
            idAnterior = atual.container_id;
        }
        return comparacoes ? diferencas : null;
    }

    function contarFalhas(lista, referencia) {
        return lista.reduce((soma, doc) => {
            const c = containerNoDia(doc, referencia);
            return soma + (c && falhouNoResumo(c, doc) ? 1 : 0);
        }, 0);
    }

    function contarErros(lista, referencia) {
        let resultado = 0;
        let houveLog = false;
        let desconhecidos = false;
        for (const doc of lista) {
            // Os arquivos Gold de dias anteriores podem trazer somente LOGS,
            // sem resumos.containers. A relação é feita pelo nome e ID do log.
            const log = doc.logs.find((l) => (referencia.nome && l.nome === referencia.nome)
                || l.container_id === referencia.container_id);
            if (!log) continue;
            houveLog = true;
            const resumo = D.resumoLog(log);
            desconhecidos ||= resumo.incompleto;
            if (resumo.erros !== null) resultado += resumo.erros;
        }
        return houveLog && (!desconhecidos || resultado > 0) ? resultado : null;
    }

    function identificarPicosHorarios(lista, referencia, lerMedida) {
        const picos = new Map();
        for (const doc of lista) {
            const container = containerNoDia(doc, referencia);
            const maximo = D.numero(container ? lerMedida(container)?.maximo : null);
            if (maximo === null) continue;

            const inicio = D.instante(container.primeira_observacao);
            const fim = D.instante(container.ultima_observacao);
            const ordem = inicio || D.instante(doc.intervalo.inicio);
            const dia = D.diaSaoPaulo(ordem);
            const anterior = picos.get(dia);
            if (!anterior || maximo > anterior.maximo || (maximo === anterior.maximo && ordem < anterior.ordem)) {
                picos.set(dia, { maximo, ordem, inicio, fim });
            }
        }
        return picos;
    }

    function criarPontosDiarios(lista, referencia, ler) {
        return lista.map((doc) => {
            const c = containerNoDia(doc, referencia);
            // Sem dados nesse dia: y=null, nunca 0 artificial.
            return { x: instanteResumo(doc), y: c ? D.numero(ler(c)) : null };
        });
    }

    function calcularMediaHistorica(lista, referencia, lerMedida) {
        // O histórico normalizado tem um resumo por data. Filtramos antes de
        // excluir o último dia: um resumo recente sem medição não é referência.
        const diasValidos = lista.flatMap((doc) => {
            const container = containerNoDia(doc, referencia);
            const medida = container ? lerMedida(container) : null;
            const media = D.numero(medida?.media);
            const amostras = D.numero(medida?.amostras_validas);
            if (media === null || amostras === null || amostras <= 0) return [];
            return [{ data: doc.intervalo?.fim || doc.data, media, amostras }];
        }).sort((a, b) => a.data.localeCompare(b.data));
        if (diasValidos.length < 4) return null;

        const maisRecente = diasValidos.pop();
        // Ponderação por amostras válidas: dias com mais leituras têm mais peso.
        // Zero medido é válido; dias ausentes e null nunca recebem peso artificial.
        const amostras = diasValidos.reduce((soma, dia) => soma + dia.amostras, 0);
        const somaPonderada = diasValidos.reduce((soma, dia) => soma + dia.media * dia.amostras, 0);
        const valor = somaPonderada / amostras;
        if (!Number.isFinite(valor)) return null;
        return { valor, dias: diasValidos.length, amostras, dataExcluida: maisRecente.data };
    }

    function criarDatasetReferencia(lista, mediaHistorica) {
        if (!mediaHistorica) return null;
        return {
            label: "Média histórica",
            referenciaHistorica: true,
            // São pontos de uma comparação constante, não medições interpoladas.
            // As séries observadas continuam preservando suas lacunas com null.
            data: lista.map((doc) => ({
                x: instanteResumo(doc), y: mediaHistorica.valor
            })),
            borderColor: "#888888",
            backgroundColor: "#888888",
            borderDash: [6, 6],
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 0,
            tension: 0,
            fill: false
        };
    }

    function leiturasContinuas(anterior, atual, dataAnterior, dataAtual, intervaloAnterior = null, intervaloAtual = null) {
        // O nome pode sobreviver à recriação; contadores só podem ser subtraídos
        // entre leituras do MESMO ID Docker em datas consecutivas.
        if (!anterior?.container_id || anterior.container_id !== atual?.container_id) return false;
        if (intervaloAtual || intervaloAnterior) {
            if (!intervaloAtual || !intervaloAnterior || Date.parse(intervaloAtual.fim) - Date.parse(intervaloAnterior.fim) !== 3600000) return false;
        } else if (Date.parse(dataAtual + "T00:00:00Z") - Date.parse(dataAnterior + "T00:00:00Z") !== 86400000) return false;

        // Um reinício pode zerar e depois superar o contador antigo. A simples
        // comparação numérica não detecta isso: verificamos também o ciclo de vida.
        const reiniciosAntes = anterior.reinicios?.total?.ultimo_valor;
        const reiniciosDepois = atual.reinicios?.total?.ultimo_valor;
        if (reiniciosAntes !== undefined || reiniciosDepois !== undefined) {
            if (D.numero(reiniciosAntes) === null || reiniciosAntes < 0 || reiniciosAntes !== reiniciosDepois) return false;
        }
        if (anterior.started_at != null || atual.started_at != null) {
            const inicioAntes = D.instante(anterior.started_at);
            const inicioDepois = D.instante(atual.started_at);
            if (!inicioAntes || !inicioDepois || inicioAntes.getTime() !== inicioDepois.getTime()) return false;
        }
        if (anterior.ultima_observacao != null || atual.ultima_observacao != null) {
            const antes = D.instante(anterior.ultima_observacao);
            const depois = D.instante(atual.ultima_observacao);
            if (!antes || !depois || depois <= antes || D.diaSaoPaulo(antes) !== dataAnterior || D.diaSaoPaulo(depois) !== dataAtual) return false;
        }
        return true;
    }

    function criarPontosIntervalos(lista, referencia, lerContador, divisor = 1) {
        const leituraValida = (medida) => D.numero(medida?.ultimo_valor) !== null
            && medida.ultimo_valor >= 0 && D.numero(medida.amostras_validas) > 0
            && (medida.ultimo_status === undefined || medida.ultimo_status === "ok");
        return lista.map((doc, indice) => {
            const ponto = { x: instanteResumo(doc), y: null };
            const docAnterior = lista[indice - 1];
            if (!docAnterior || !Number.isFinite(divisor) || divisor <= 0) return ponto;
            const atual = containerNoDia(doc, referencia);
            const anterior = containerNoDia(docAnterior, referencia);
            if (!leiturasContinuas(anterior, atual, docAnterior.data, doc.data, docAnterior.intervalo, doc.intervalo)) return ponto;
            const medidaAtual = lerContador(atual);
            const medidaAnterior = lerContador(anterior);
            if (!leituraValida(medidaAtual) || !leituraValida(medidaAnterior)) return ponto;
            const diferenca = medidaAtual.ultimo_valor - medidaAnterior.ultimo_valor;
            // Queda do contador indica reset, não consumo negativo nem zero.
            // O primeiro dia do filtro fica sem delta: não buscamos fora dele.
            if (diferenca < 0 || !Number.isFinite(diferenca / divisor)) return ponto;
            return { ...ponto, y: diferenca / divisor, inicio: docAnterior.intervalo?.fim || docAnterior.data, fim: doc.intervalo?.fim || doc.data };
        });
    }

    // Dados de origem opcionais; sem eles, os gráficos seguem usando resumos.
    function pontosMinuto(lista, referencia, inicio, fim, ler, divisor = null) {
        const linhas = lista.flatMap(doc => doc.seriesMinuto?.find(c => c.container_id === referencia.container_id)?.amostras || [])
            .filter(r => Date.parse(r[0]) >= inicio - 60000 && Date.parse(r[0]) <= fim)
            .sort((a, b) => Date.parse(a[0]) - Date.parse(b[0]));
        const medida = v => ({ media: v, ultimo_valor: v });
        const container = r => ({
            cpu: { uso: medida(r[1]), tempo_throttled: medida(r[8]) },
            memoria: { uso: medida(r[2]) }, pids: { atuais: medida(r[3]) },
            rede: { recebidos: medida(r[4]), enviados: medida(r[5]) },
            disco: { leitura_acumulada: medida(r[6]), escrita_acumulada: medida(r[7]) }
        });
        return linhas.flatMap((r, i) => {
            const x = Date.parse(r[0]);
            if (x <= inicio) return [];
            const valor = D.numero(ler(container(r)));
            if (divisor === null) return [{ x, y: valor }];
            const anterior = linhas[i - 1];
            const base = anterior ? D.numero(ler(container(anterior))) : null;
            const continuo = anterior && x - Date.parse(anterior[0]) === 60000
                && r[9] === anterior[9] && r[10] === anterior[10];
            return [{ x, y: continuo && base !== null && valor !== null && valor >= base
                ? (valor - base) / divisor : null, inicio: anterior?.[0], fim: r[0] }];
        });
    }
    function agruparCincoMinutos(pontos, inicio, fim, somar = false) {
        const grupos = new Map();
        for (const ponto of pontos) {
            const indice = Math.ceil((ponto.x - inicio) / 300000);
            if (!grupos.has(indice)) grupos.set(indice, []);
            grupos.get(indice).push(ponto);
        }
        const resultado = [];
        for (let a = inicio; a < fim; a += 300000) {
            const b = Math.min(a + 300000, fim);
            const grupo = grupos.get(Math.round((a - inicio) / 300000) + 1) || [];
            const completo = grupo.length === Math.floor((b - a) / 60000)
                && grupo.length > 0 && grupo.every(p => D.numero(p.y) !== null);
            const valores = grupo.map(p => p.y).filter(v => D.numero(v) !== null);
            const disponivel = valores.length > 0;
            resultado.push({ x: b, parcial: !completo, intervalosValidos: valores.length, intervalosDesconhecidos: Math.floor((b-a)/60000)-valores.length, y: disponivel ? valores.reduce((s, v) => s + v, 0) / (somar ? 1 : valores.length) : null,
                minimo: disponivel ? Math.min(...valores) : null,
                maximo: disponivel ? Math.max(...valores) : null,
                inicio: new Date(a).toISOString(), fim: new Date(b).toISOString() });
        }
        return resultado;
    }

    const usarMinuto = () => (periodoPersonalizado ? P.granularidade(periodoPersonalizado) === "cinco" : periodoDias === 1 / 24)
        && historicoHorario.some(doc => Array.isArray(doc.seriesMinuto));

    // A capacidade pertence ao documento, não ao transporte ou ao relógio local.
    // Em históricos mistos, os intervalos sem este campo permanecem desconhecidos.
    function temTotaisObservados(lista, referencia, ler) {
        return lista.some(doc => {
            const c = containerNoDia(doc, referencia);
            return c && ler(c)?.observado_local != null;
        });
    }

    function pontosVolumesLocais(lista, referencia, ler, divisor) {
        return lista.map(doc => {
            const c = containerNoDia(doc, referencia);
            const observado = c ? ler(c)?.observado_local : null;
            return { x: instanteResumo(doc), y: observado?.total == null ? null : observado.total / divisor,
                parcial: !observado || observado.intervalos_desconhecidos > 0 || Boolean(doc.coberturaLocal?.parcial),
                intervalosValidos: observado?.intervalos_validos || 0,
                intervalosDesconhecidos: observado?.intervalos_desconhecidos,
                inicio: doc.intervalo?.inicio || doc.data + "T00:00:00-03:00",
                fim: c?.ultima_observacao,
                inicioObservado: c ? D.instante(c.primeira_observacao) : null,
                fimObservado: c ? D.instante(c.ultima_observacao) : null };
        });
    }

    function calcularMediaIntervalos(pontos) {
        // Volumes por intervalo têm peso igual, não peso por número de coletas.
        // Excluímos o dia final do filtro, mesmo quando seu delta é indisponível.
        const anteriores = pontos.filter((ponto) => ponto.x < pontos.at(-1).x
            && D.numero(ponto.y) !== null && ponto.y >= 0);
        if (anteriores.length < 3) return null;
        const valor = anteriores.reduce((soma, ponto) => soma + ponto.y, 0) / anteriores.length;
        return Number.isFinite(valor) ? { valor, intervalos: anteriores.length } : null;
    }

    function criarReferenciasIntervalos(lista, series, incluirZero = false) {
        const referencias = series.flatMap((serie) => {
            const media = calcularMediaIntervalos(serie.pontos);
            if (!media) return [];
            return [{
                ...criarDatasetReferencia(lista, media),
                label: `Média histórica · ${serie.nome}`,
                borderColor: serie.corReferencia || "#888888",
                backgroundColor: serie.corReferencia || "#888888",
                borderDash: [2, 5], borderWidth: 1.5,
                intervalos: media.intervalos
            }];
        });
        if (incluirZero) referencias.push({
            ...criarDatasetReferencia(lista, { valor: 0 }),
            label: "Referência · zero segundo", referenciaHistorica: false,
            referenciaComparativa: true, borderColor: "#a6abb1", backgroundColor: "#a6abb1",
            borderDash: [2, 5], borderWidth: 1.5
        });
        return referencias;
    }

    function calcularIndicadores(referencia = null) {
        const registros = historicoAtivo.flatMap((doc) => {
            const containers = referencia ? [containerNoDia(doc, referencia)].filter(Boolean) : doc.containers;
            return containers.map((c) => ({ container: c, data: doc.data, doc }));
        });
        const falhasConhecidas = registros.filter(({ container, doc }) => falhouNoResumo(container, doc)).length;
        const registrosLog = historicoAtivo.flatMap((doc) => {
            const logs = referencia ? [doc.logs.find((l) => (referencia.nome && l.nome === referencia.nome)
                || l.container_id === referencia.container_id)].filter(Boolean) : doc.logs;
            return logs.map(D.resumoLog);
        });
        const errosConfirmados = registrosLog.reduce((soma, log) => soma + (log.erros ?? 0), 0);
        const algumSemNivel = registrosLog.some((log) => log.incompleto);
        const errosLogs = registrosLog.length && (!algumSemNivel || errosConfirmados > 0)
            ? errosConfirmados : null;
        const picos = (tipo) => registros.map(({ container, data, doc }) => ({
            container, data, intervalo: doc.intervalo,
            instante: (tipo === "cpu" ? container.cpu : container.memoria)?.uso?.maximo_instante ?? null,
            valor: D.numero(tipo === "cpu" ? container.cpu?.uso?.maximo : container.memoria?.uso?.maximo)
        })).filter((item) => item.valor !== null).sort((a, b) => b.valor - a.valor);

        // O primeiro resumo de um período não informa quantos reinícios houve
        // antes dele; somamos apenas aumentos observáveis entre dois resumos.
        const nomes = new Map(registros.map(({ container }) => [container.nome || container.container_id, container]));
        const contagens = [...nomes.values()].map((c) => reiniciosDetectados(historicoAtivo, c)).filter((v) => v !== null);
        return {
            falhasConhecidas,
            reiniciosNoPeriodo: contagens.length ? contagens.reduce((soma, v) => soma + v, 0) : null,
            errosLogs,
            logsSemNivel: registrosLog.reduce((soma, log) => soma + log.niveis
                .filter((nivel) => nivel.nome.toLowerCase() === "unknown")
                .reduce((parcial, nivel) => parcial + nivel.quantidade, 0), 0),
            picoCpu: picos("cpu")[0] || null,
            picoRam: picos("ram")[0] || null
        };
    }

    function renderizarContexto() {
        // Identifica o servidor associado aos resumos carregados.
        const nomeServidor = dados.mac
            ? `Servidor · ${dados.mac}` : "Servidor selecionado";
        if (!servidoresDisponiveis.length) $("docker-servidor").replaceChildren(new Option(nomeServidor, dados.mac || ""));
        const primeiro = historicoAtivo[0]?.data.split("-").reverse().join("/") || "—";
        const ultimo = historicoAtivo.at(-1)?.data.split("-").reverse().join("/") || "—";
        const diasComMetricas = historicoAtivo.filter((doc) => doc.containers.length > 0).length;
        $("docker-periodo-info").textContent =
            `${historicoAtivo.length} dia(s) com resumo (${primeiro} a ${ultimo}); ` +
            `métricas de contêineres em ${diasComMetricas} dia(s). ` +
            "Datas sem medições não são tratadas como zero.";
        $("docker-total-containers").textContent = `(${dados.containers.length})`;
        $("docker-ultima-coleta").textContent = `Dados até ${ultimo}`;
        if (usarHorario()) {
            $("docker-periodo-info").textContent = `Período: ${formatoData.format(intervaloAtivo.inicio)} a ${formatoData.format(intervaloAtivo.fim)} · ${historicoAtivo.length} ${periodoPersonalizado && usarMinuto() ? "intervalos de 5 minutos disponíveis" : "resumos horários disponíveis"}. ${periodoPersonalizado ? "Horário de Brasília." : "Contado a partir da última leitura disponível."}`;
            $("docker-ultima-coleta").textContent = `Dados até ${hora(dados.intervalo.fim)}`;
        }
        if (periodoPersonalizado) {
            $("docker-periodo-info").textContent += " Somente dados contidos no recorte; limites sem precisão suficiente ficam sem dados.";
        }
    }

    function horarioPico(pico) {
        return pico.instante ? hora(pico.instante)
            : pico.intervalo ? `${hora(pico.intervalo.inicio)} a ${hora(pico.intervalo.fim)}`
            : pico.data.split("-").reverse().join("/");
    }

    function renderizarKpis() {
        if (!indicadores) {
            for (const id of ["kpi-falhas", "kpi-reinicios", "kpi-erros", "kpi-pico"]) $(id).textContent = "—";
            for (const id of ["kpi-falhas-nota", "kpi-reinicios-nota", "kpi-erros-nota", "kpi-pico-descricao"]) {
                $(id).textContent = "Selecione um contêiner para visualizar.";
            }
            $("kpi-erros-nota").removeAttribute("title");
            return;
        }
        $("kpi-falhas").textContent = n(indicadores.falhasConhecidas);
        $("kpi-falhas-nota").textContent = "Erros ou falta de memória (OOM)";
        $("kpi-reinicios").textContent = n(indicadores.reiniciosNoPeriodo);
        $("kpi-reinicios-nota").textContent = "Reinícios detectados no período";
        $("kpi-erros").textContent = n(indicadores.errosLogs);
        $("kpi-erros-nota").textContent = "Mensagens de nível ERROR";
        $("kpi-erros-nota").title = indicadores.logsSemNivel > 0
            ? `${n(indicadores.logsSemNivel)} mensagem(ns) sem nível classificado; ERROR mostra apenas as confirmadas.`
            : "Registros ERROR no período";
        const pico = tipoPico === "ram" ? indicadores.picoRam : indicadores.picoCpu;
        $("kpi-pico").textContent = pico ? n(pico.valor, "%") : "—";
        $("kpi-pico").title = pico ? ["Percentual da capacidade do host", ...N.detalhes(tipoPico, pico.valor, pico.container.apresentacaoHost)].join("\n") : "Métrica ou capacidade do host indisponível";
        $("kpi-pico-descricao").textContent = pico ? `${pico.container.nome || pico.container.container_id.slice(0, 12)} · ${horarioPico(pico)}` : "Nenhuma medição válida para esta métrica.";
        document.querySelectorAll("[data-pico]").forEach((botao) => {
            const ativo = botao.dataset.pico === tipoPico;
            botao.classList.toggle("ativo", ativo);
            botao.setAttribute("aria-pressed", String(ativo));
        });
    }

    function renderizarLista() {
        const busca = $("docker-busca").value.toLocaleLowerCase("pt-BR").trim();
        const encontrados = dados.containers.filter((c) => `${c.nome} ${c.imagem} ${c.container_id}`.toLocaleLowerCase("pt-BR").includes(busca));
        const corpo = $("docker-linhas");
        corpo.replaceChildren();
        for (const container of encontrados) {
            const tr = document.createElement("tr");
            const ativo = container.container_id === selecionadoId;
            tr.classList.toggle("selecionado", ativo);
            const nomeTd = document.createElement("td");
            const botao = adicionarTexto(nomeTd, "button", "", "docker-container-escolha");
            botao.type = "button";
            botao.setAttribute("aria-label", `Investigar contêiner ${container.nome || container.container_id.slice(0, 12)}`);
            botao.setAttribute("aria-pressed", String(ativo));
            adicionarTexto(botao, "span", container.nome || "Sem nome", "docker-container-nome");
            // IDs reais ficam abreviados; IDs fictícios devem mostrar o sufixo,
            // senão os nove exemplos aparecem com o mesmo prefixo na tabela.
            const idVisivel = container.container_id.startsWith("demo-container-")
                ? container.container_id : container.container_id.slice(0, 12);
            adicionarTexto(botao, "span", idVisivel + (ativo ? " · selecionado" : ""), "docker-container-id");
            tr.appendChild(nomeTd);
            const tdStatus = document.createElement("td");
            const situacao = D.estado(container);
            adicionarTexto(tdStatus, "span", situacao.rotulo, `docker-estado ${situacao.classe}`);
            tr.appendChild(tdStatus);
            adicionarTexto(tr, "td", n(contarFalhas(historicoAtivo, container)));
            adicionarTexto(tr, "td", n(reiniciosDetectados(historicoAtivo, container)));
            adicionarTexto(tr, "td", n(contarErros(historicoAtivo, container)));
            tr.addEventListener("click", () => selecionar(container.container_id));
            corpo.appendChild(tr);
        }
        if (!encontrados.length) {
            const tr = document.createElement("tr");
            const td = adicionarTexto(tr, "td", "Nenhum contêiner corresponde à busca.", "docker-nenhum");
            td.colSpan = 5;
            corpo.appendChild(tr);
        }
        $("docker-selecao-descricao").textContent = selecionadoId
            ? `Investigando ${dados.containers.find((c) => c.container_id === selecionadoId)?.nome || "contêiner"} · KPIs do contêiner selecionado.`
            : "Selecione um contêiner para investigar suas métricas e registros.";
        $("docker-limpar").disabled = !selecionadoId;
    }

    function atributo(pai, titulo, valor, detalhes = []) {
        const div = document.createElement("div");
        div.className = "docker-atributo";
        if (detalhes.length) div.title = detalhes.join("\n");
        adicionarTexto(div, "dt", titulo);
        adicionarTexto(div, "dd", valor);
        pai.appendChild(div);
    }

    function renderizarDetalhe(container) {
        const s = D.estado(container);
        $("docker-detalhe-titulo").textContent = container.nome || "Contêiner sem nome";
        $("docker-detalhe-id").textContent = `ID: ${container.container_id.slice(0, 12)}`;
        $("docker-detalhe-id").title = `${container.container_id} · Última observação: ${hora(container.ultima_observacao)}`;
        $("docker-detalhe-estado").textContent = s.rotulo;
        $("docker-detalhe-estado").className = `docker-estado ${s.classe}`;
        const campos = $("docker-detalhe-campos");
        campos.replaceChildren();
        const metricas = $("docker-detalhe-metricas");
        metricas.replaceChildren();
        atributo(metricas, "CPU média (% do host)", n(container.cpu?.uso?.media, "%"), N.detalhes("cpu", container.cpu?.uso?.media, container.apresentacaoHost));
        atributo(metricas, "Memória média (% do host)", n(container.memoria?.uso?.media, "%"), N.detalhes("ram", container.memoria?.uso?.media, container.apresentacaoHost));
        atributo(metricas, "Limite de memória", container.apresentacaoHost?.limiteBytes ? n(container.apresentacaoHost.limiteBytes / 1024 ** 3, " GiB") : "—");
        const saude = { healthy: "Saudável", unhealthy: "Não saudável", starting: "Inicializando" }[container.health_status] || "Não informado";
        atributo(campos, "Imagem", container.imagem || "—");
        atributo(campos, "Healthcheck", saude);
        atributo(campos, "Início da execução", hora(container.started_at));
        atributo(campos, "Reinícios totais", `${n(container.reinicios?.total?.ultimo_valor)} desde a criação`);
        atributo(campos, "Saída", container.status === "exited" ? n(container.exit_code) : "Não aplicável");
        atributo(campos, "OOM", container.oom_killed == null ? "Não informado" : String(container.oom_killed).toLowerCase() === "true" ? "Sim" : "Não");
        $("docker-eventos-health").textContent = `Healthcheck · ${saude.toLowerCase()}`;
        $("docker-eventos-health").className = `docker-estado ${container.health_status === "healthy" ? "" : container.health_status === "unhealthy" ? "erro" : "parado"}`;
    }

    function criarGraficoVazio(pai, nota) {
        const vazio = adicionarTexto(pai, "div", "", "docker-grafico-sem-serie");
        adicionarTexto(vazio, "strong", "Sem medições disponíveis");
        adicionarTexto(vazio, "span", nota || "Não há medições suficientes para este gráfico.");
    }

    function grafico(titulo, subtitulo, destaque, referencia, series, unidade, porcentagem = false, lerMedidaReferencia = null, opcoes = {}) {
        if (!usarHorario() && lerMedidaReferencia) {
            subtitulo = "Média e faixa entre mínimo e máximo de cada dia";
            series = [
                series[0],
                { nome: "Mínimo diário", cor: "#706b6d", ler: (c) => lerMedidaReferencia(c)?.minimo },
                { ...series[1], nome: "Faixa mínima–máxima", cor: "#e49b26" }
            ];
        }
        const tipoRecurso = porcentagem ? (titulo.startsWith("CPU") ? "cpu" : "ram") : null;
        const minuto = usarMinuto();
        const faixaHoraria = usarHorario() && !minuto && lerMedidaReferencia;
        const faixa = Boolean(lerMedidaReferencia);
        let historicoReferencia = historicoAtivo;
        let lerReferencia = lerMedidaReferencia;
        const barrasDiarias = !usarHorario() && opcoes.barras;
        if (usarHorario()) {
            subtitulo = subtitulo.replaceAll("cada dia", "cada hora").replaceAll("dias consecutivos", "horas consecutivas");
            series = series.map((serie) => ({ ...serie, nome: serie.nome.replace("diária", "horária").replace("diário", "horário") }));
        }
        if (faixaHoraria) {
            subtitulo = "Média e faixa entre mínimo e máximo de cada hora";
            series = [
                series[0],
                { nome: "Mínimo horário", ler: (c) => lerMedidaReferencia(c)?.minimo },
                { ...series[1], nome: "Faixa mínima–máxima" }
            ];
        }
        if (faixa) {
            let somaPonderada = 0;
            let amostrasValidas = 0;
            let pico = null;
            for (const doc of historicoAtivo) {
                const container = containerNoDia(doc, referencia);
                const medida = container ? lerMedidaReferencia(container) : null;
                const media = D.numero(medida?.media);
                const amostras = D.numero(medida?.amostras_validas);
                const maximo = D.numero(medida?.maximo);
                if (media !== null && amostras > 0) {
                    somaPonderada += media * amostras;
                    amostrasValidas += amostras;
                }
                if (maximo !== null && (pico === null || maximo > pico)) pico = maximo;
            }
            const mediaGeral = amostrasValidas ? somaPonderada / amostrasValidas : null;
            const rotuloMedia = "Média";
            const rotuloPico = "Pico";
            destaque = `${rotuloMedia}: ${n(mediaGeral, unidade)} · ${rotuloPico}: ${n(pico, unidade)}`;
        }
        if (minuto && lerMedidaReferencia) {
            const pontos = pontosMinuto(historicoHorario, referencia, intervaloAtivo.inicio, intervaloAtivo.fim,
                c => lerMedidaReferencia(c)?.media);
            const agrupados = agruparCincoMinutos(pontos, intervaloAtivo.inicio, intervaloAtivo.fim);
            series = [
                { ...series[0], nome: "Média · 5 minutos", pontos: agrupados },
                { nome: "Mínimo · 5 minutos", pontos: agrupados.map(p => ({ ...p, y: p.minimo })) },
                { ...series[1], nome: "Faixa mínima–máxima", pontos: agrupados.map(p => ({ ...p, y: p.maximo })) }
            ];
            subtitulo = "Média e faixa entre mínimo e máximo a cada 5 minutos · horário de Brasília";
            // A mesma média ponderada do recorte, excluindo o último intervalo válido.
            // Aqui os intervalos são de cinco minutos, derivados das capturas reais.
            historicoReferencia = agrupados.map(p => ({
                data: D.diaSaoPaulo(new Date(p.x)), intervalo: { inicio: p.inicio, fim: p.fim },
                containers: [{ container_id: referencia.container_id, nome: referencia.nome,
                    apresentacaoHost: N.hostComum(historicoHorario.filter(doc => Date.parse(doc.intervalo.inicio) < p.x
                        && Date.parse(doc.intervalo.fim) > Date.parse(p.inicio)).map(doc => containerNoDia(doc, referencia)), tipoRecurso),
                    medidaGrafico: { media: p.y, minimo: p.minimo, maximo: p.maximo, amostras_validas: p.intervalosValidos } }]
            }));
            lerReferencia = c => c.medidaGrafico;
            const valores = pontos.map(p => p.y).filter(v => v !== null);
            destaque = valores.length ? `Média: ${n(valores.reduce((a, b) => a + b, 0) / valores.length, unidade)} · Pico: ${n(Math.max(...valores), unidade)}` : "Sem capturas no período";
        }
        const artigo = adicionarTexto($("docker-graficos"), "article", "", "docker-card docker-grafico-card");
        const topo = adicionarTexto(artigo, "div", "", "docker-grafico-topo");
        const texto = adicionarTexto(topo, "div", "");
        adicionarTexto(texto, "h3", titulo);
        adicionarTexto(texto, "p", subtitulo);
        adicionarTexto(topo, "span", destaque, "docker-grafico-destaque");

        // O x é uma data numérica: distâncias entre 28/10 e 30/10, por exemplo,
        // são proporcionais aos dias de diferença. Não inventamos datas nem zeros.
        const conjuntos = series.map((serie, indice) => ({
            label: serie.nome,
            data: serie.pontos || criarPontosDiarios(historicoAtivo, referencia, serie.ler),
            borderColor: serie.cor || (indice === 0 ? "#d00000" : "#e49b26"),
            backgroundColor: serie.cor || (indice === 0 ? "#d00000" : "#e49b26"),
            borderDash: serie.tracejada ? [6, 4] : [],
            tension: 0,
            borderWidth: 1.8,
            pointRadius: 1.5,
            pointHoverRadius: 5,
            spanGaps: false
        }));
        if (faixa) {
            const [, minimo, maximo] = conjuntos;
            const estiloFaixa = { borderWidth: 0, pointRadius: 0, pointHoverRadius: 0, order: 1, backgroundColor: "#e49b2650" };
            Object.assign(minimo, estiloFaixa);
            Object.assign(maximo, estiloFaixa, { fill: "-1" });
        }
        if (opcoes.barras) {
            const [tempoLimitado] = conjuntos;
            tempoLimitado.type = "bar";
            tempoLimitado.order = 1;
            if (barrasDiarias) {
                // Mantém o zero visível e deixa os intervalos sem leitura sem barra.
                tempoLimitado.minBarLength = 2;
            } else {
                // Centraliza a barra no intervalo que ela representa.
                tempoLimitado.data = tempoLimitado.data.map((ponto) => ({
                    ...ponto, x: ponto.y === null ? ponto.x : (Date.parse(ponto.inicio) + ponto.x) / 2
                }));
            }
        }
        const temMedicoes = conjuntos.some((serie) => serie.data.some((ponto) => ponto.y !== null));
        if (lerMedidaReferencia) {
            const mediaHistorica = calcularMediaHistorica(historicoReferencia, referencia, lerReferencia);
            const datasetReferencia = criarDatasetReferencia(historicoReferencia, mediaHistorica);
            if (datasetReferencia) conjuntos.push(datasetReferencia);
            adicionarTexto(artigo, "p", mediaHistorica
                ? `Média histórica: ${n(mediaHistorica.valor, unidade)} · ponderada por ${n(mediaHistorica.amostras)} amostras em ${mediaHistorica.dias} ${minuto ? "intervalos de 5 minutos" : usarHorario() ? "horas" : "dias"} anteriores, excluindo ${usarHorario() ? hora(mediaHistorica.dataExcluida) : mediaHistorica.dataExcluida.split("-").reverse().join("/")}. Referência de comparação, sem limite de alerta.`
                : "Histórico insuficiente para calcular a média de referência.", "docker-grafico-observacao");
        }
        if (tipoRecurso) {
            for (const conjunto of conjuntos) {
                conjunto.data = conjunto.data.map((ponto, indice) => {
                    let containers;
                    if (conjunto.referenciaHistorica) {
                        const validos = historicoReferencia.filter(doc => {
                            const c = containerNoDia(doc, referencia);
                            const m = c && lerReferencia(c);
                            return D.numero(m?.media) !== null && m.amostras_validas > 0;
                        }).slice(0, -1);
                        containers = validos.map(doc => containerNoDia(doc, referencia));
                    } else if (minuto) {
                        containers = historicoHorario.filter(doc => Date.parse(doc.intervalo.inicio) < ponto.x
                            && Date.parse(doc.intervalo.fim) >= Date.parse(ponto.inicio || ponto.x))
                            .map(doc => containerNoDia(doc, referencia));
                    } else containers = [containerNoDia(historicoAtivo[indice], referencia)];
                    return { ...ponto, hostTooltip: N.hostComum(containers, tipoRecurso) };
                });
            }
            if (conjuntos.some(c => c.data.some(p => p.y > 100))) {
                adicionarTexto(artigo, "p", "Há medições acima da capacidade informada do host. Valores preservados para investigação.", "docker-grafico-observacao");
            }
        }
        conjuntos.push(...(opcoes.referencias || []));
        if (opcoes.nota) adicionarTexto(artigo, "p", opcoes.nota, "docker-grafico-observacao");
        if (!temMedicoes) {
            criarGraficoVazio(artigo, opcoes.intervalos ? "Sem pares de leituras válidas e contínuas no período. Ausência de dados não significa consumo zero." : (tipoRecurso ? "Métrica ou capacidade do host indisponível para normalização." : "Nenhum resumo do período contém essa métrica."));
            return artigo;
        }
        if (!usarHorario() && conjuntos.some((serie) => serie.data.some((ponto) => ponto.y === null))) {
            adicionarTexto(artigo, "p", "Lacunas indicam leituras indisponíveis. O zero é exibido quando medido.", "docker-grafico-observacao");
        }
        if (!window.Chart) {
            criarGraficoVazio(artigo, "A biblioteca Chart.js não foi carregada.");
            return artigo;
        }

        const area = adicionarTexto(artigo, "div", "", "docker-grafico-area");
        const canvas = document.createElement("canvas");
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `Gráfico histórico: ${titulo} do contêiner ${referencia.nome}`);
        area.appendChild(canvas);
        const formatarDia = (milissegundos) => usarHorario() ? new Date(milissegundos).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
        }) : new Date(milissegundos).toLocaleDateString("pt-BR", {
            timeZone: "UTC", day: "2-digit", month: "2-digit"
        });
        const horario = usarHorario();
        const picosHorarios = !horario && faixa
            ? identificarPicosHorarios(historicoHorario, referencia, lerMedidaReferencia) : null;
        const formatoHoraPico = picosHorarios && new Intl.DateTimeFormat("pt-BR", {
            timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
        });
        const fimEixo = horario ? intervaloAtivo.fim : instanteResumo(historicoAtivo.at(-1));
        const inicioEixo = horario ? intervaloAtivo.inicio : instanteResumo(historicoAtivo[0]);
        // Evita o arredondamento decimal de timestamps da escala linear.
        // Nos filtros horários, cinco marcas dividem o intervalo selecionado.
        const passoEixo = horario ? (fimEixo - inicioEixo) / 4
            : Math.max(1, Math.ceil((fimEixo - inicioEixo) / 86400000 / 4)) * 86400000;
        const marcasEixo = [];
        for (let instante = inicioEixo; instante < fimEixo; instante += passoEixo) marcasEixo.push(instante);
        marcasEixo.push(fimEixo);
        window.Chart.defaults.font.size = 15;
        const chart = new window.Chart(canvas, {
            type: "line",
            data: { datasets: conjuntos },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                parsing: false,
                interaction: { mode: barrasDiarias ? "x" : (faixa || !horario ? "index" : "nearest"), intersect: false, ...(faixa ? { axis: "x" } : {}) },
                plugins: {
                    legend: {
                        display: true, position: "bottom", align: "start",
                        labels: {
                            boxWidth: 14, boxHeight: 2, color: "#555056", font: { size: 14 }, padding: 16,
                            ...(faixa ? { filter: (item) => item.datasetIndex !== 1 } : {})
                        },
                        ...(faixa ? {
                            onClick(evento, item, legenda) {
                                if (item.datasetIndex === 2) legenda.chart.setDatasetVisibility(1, item.hidden);
                                window.Chart.defaults.plugins.legend.onClick(evento, item, legenda);
                            }
                        } : {})
                    },
                    tooltip: {
                        ...(barrasDiarias ? { filter: (item) => item.parsed.y !== null } : {}),
                        ...(faixa ? {
                            itemSort: (a, b) => [1, 0, 2, 3][a.datasetIndex] - [1, 0, 2, 3][b.datasetIndex]
                        } : {}),
                        callbacks: {
                            ...(picosHorarios ? {
                                afterBody(itens) {
                                    if (!itens.length) return "";
                                    const dia = historicoAtivo[itens[0].dataIndex].data;
                                    const pico = picosHorarios.get(dia);
                                    if (!pico?.inicio || !pico.fim || pico.fim < pico.inicio) return "Horário indisponível";
                                    return `Intervalo do pico: ${formatoHoraPico.format(pico.inicio)}–${formatoHoraPico.format(pico.fim)}`;
                                }
                            } : {}),
                            title: (itens) => {
                                if (!itens.length) return "";
                                if (faixaHoraria) {
                                    const intervalo = historicoAtivo[itens[0].dataIndex]?.intervalo;
                                    if (intervalo) return `${hora(intervalo.inicio)} → ${hora(intervalo.fim)}`;
                                }
                                const ponto = itens[0].raw;
                                if (!horario) {
                                    const data = historicoAtivo[itens[0].dataIndex].data.split("-").reverse().join("/");
                                    return ponto?.inicioObservado
                                        ? [data, `${formatoData.format(ponto.inicioObservado)} → ${formatoData.format(ponto.fimObservado)}`]
                                        : data;
                                }
                                if (ponto?.inicioObservado) return `${formatoData.format(ponto.inicioObservado)} → ${formatoData.format(ponto.fimObservado)}`;
                                return ponto?.inicio ? (usarHorario() ? `${hora(ponto.inicio)} → ${hora(ponto.fim)}` : `${ponto.inicio.split("-").reverse().join("/")} → ${ponto.fim.split("-").reverse().join("/")}`) : formatarDia(itens[0].parsed.x);
                            },
                            label: (item) => {
                                const nome = faixa && item.datasetIndex === 2
                                    ? (minuto ? "Máximo · 5 minutos" : horario ? "Máximo horário" : "Máximo diário") : item.dataset.label;
                                const valor = n(item.parsed.y, unidade) + (item.raw?.parcial ? ` · parcial (${item.raw.intervalosValidos} intervalos medidos; ${item.raw.intervalosDesconhecidos ?? "?"} desconhecidos)` : "");
                                const linha = `${nome}: ${valor}${item.dataset.referenciaHistorica || item.dataset.referenciaComparativa ? " (referência de comparação)" : ""}`;
                                return tipoRecurso ? [linha, ...(item.raw?.hostTooltip
                                    ? N.detalhes(tipoRecurso, item.parsed.y, item.raw.hostTooltip)
                                    : ["Capacidade variável ou indisponível no intervalo; detalhes técnicos não comparáveis."])] : linha;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: "linear",
                        min: barrasDiarias ? inicioEixo - 43200000 : inicioEixo,
                        max: barrasDiarias ? fimEixo + 43200000 : fimEixo,
                        afterBuildTicks: (escala) => {
                            escala.ticks = marcasEixo.map((value) => ({ value }));
                        },
                        grid: { display: false },
                        title: { display: true, text: horario ? "Tempo · horário de Brasília" : "Data", color: "#706b6d" },
                        ticks: {
                            color: "#706b6d", autoSkip: false, maxRotation: 0,
                            callback: (valor) => horario ? [
                                new Date(valor).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }),
                                new Date(valor).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
                            ] : formatarDia(valor)
                        }
                    },
                    y: {
                        beginAtZero: true,
                        max: porcentagem ? Math.max(100, ...conjuntos.flatMap(c => c.data.map(p => p.y ?? 0))) : undefined,
                        grid: { color: "#f0eeeb" },
                        ticks: { color: "#706b6d", callback: (valor) => `${formatoNumero.format(valor)}${unidade}` }
                    }
                }
            }
        });
        graficosAtivos.push(chart);
        const diasMedidos = conjuntos.filter((serie) => !serie.referenciaHistorica && !serie.referenciaComparativa).reduce((datas, serie) => {
            serie.data.filter((ponto) => ponto.y !== null).forEach((ponto) => datas.add(ponto.x));
            return datas;
        }, new Set()).size;
        if (diasMedidos === 1) {
            adicionarTexto(artigo, "p", "Somente um resumo ou intervalo válido para esta métrica no período.", "docker-grafico-observacao");
        }
        return artigo;
    }

    function graficoContadores(titulo, container, series, unidade, divisor, incluirZero = false, barras = false) {
        const observados = serie => temTotaisObservados(historicoAtivo, container, serie.ler);
        const usaCapturas = usarMinuto() || series.some(observados);
        if (usaCapturas) { titulo = titulo.replace("MB", "MiB"); unidade = unidade.replace("MB", "MiB"); }
        let intervalos = series.map((serie) => ({
            ...serie, observado: observados(serie), pontos: usarMinuto()
                ? agruparCincoMinutos(pontosMinuto(historicoHorario, container, intervaloAtivo.inicio, intervaloAtivo.fim, c => serie.ler(c)?.ultimo_valor, divisor), intervaloAtivo.inicio, intervaloAtivo.fim, true)
                : observados(serie) ? pontosVolumesLocais(historicoAtivo, container, serie.ler, divisor)
                : criarPontosIntervalos(historicoAtivo, container, serie.ler, divisor)
        }));
        if (!usarHorario()) {
            intervalos = intervalos.map((serie) => ({
                ...serie, pontos: serie.pontos.map((ponto, indice) => {
                    if (serie.observado || ponto.y === null) return ponto;
                    const anterior = containerNoDia(historicoAtivo[indice - 1], container);
                    const atual = containerNoDia(historicoAtivo[indice], container);
                    const inicioObservado = D.instante(anterior.ultima_observacao);
                    const fimObservado = D.instante(atual.ultima_observacao);
                    const reiniciosAntes = anterior.restart_count;
                    const reiniciosDepois = atual.restart_count;
                    const reiniciosInformados = reiniciosAntes != null || reiniciosDepois != null;
                    if (!inicioObservado || !fimObservado
                        || (reiniciosInformados && (!Number.isInteger(reiniciosAntes) || reiniciosAntes < 0 || reiniciosAntes !== reiniciosDepois))) {
                        return { x: ponto.x, y: null };
                    }
                    return { ...ponto, inicioObservado, fimObservado };
                })
            }));
        }
        const referencias = criarReferenciasIntervalos(historicoAtivo, intervalos, incluirZero && !barras);
        const historicas = referencias.filter((serie) => serie.referenciaHistorica);
        const nota = historicas.map((serie) => `${serie.label}: ${n(serie.data[0].y, unidade)} (${serie.intervalos} intervalos anteriores)`).join(" · ");
        const insuficientes = intervalos.filter((serie) => !calcularMediaIntervalos(serie.pontos)).map((serie) => serie.nome);
        const diario = !usarHorario();
        const destaque = intervalos.map((serie) => n(serie.pontos.at(-1)?.y, unidade)).join(" / ") + (diario ? " · último dia" : " · último intervalo");
        if (usarMinuto()) titulo = titulo.replace("por intervalo", "por 5 minutos");
        const tituloGrafico = diario ? titulo.replace("por intervalo", "por dia") + (incluirZero ? " (s por dia)" : "") : titulo;
        grafico(tituloGrafico, usaCapturas ? "Soma dos deltas conhecidos das capturas por minuto" : diario ? "Total observado entre leituras, por data final" : usarMinuto() ? "Total observado em cada intervalo de 5 minutos" : "Diferenças entre leituras horárias consecutivas", destaque, container,
            intervalos, unidade, false, null, {
                intervalos: true, referencias, barras,
                nota: [nota ? nota + "." : "", insuficientes.length ? `Histórico insuficiente para referência: ${insuficientes.join(", ")}.` : "",
                    "Comparação por intervalo; exclui a última data do período. Lacunas e reinícios não são considerados zero."].filter(Boolean).join(" ")
            });
    }

    function renderizarGraficos(c) {
        $("docker-desempenho-titulo").textContent = `Desempenho — ${c.nome || c.container_id.slice(0, 12)}`;
        $("docker-desempenho-descricao").textContent = `Histórico de ${c.nome || "contêiner"} · período compartilhado · resumos ${usarMinuto() ? "de 5 minutos · BRT" : usarHorario() ? "horários · BRT" : "diários"}`;
        // Chart.js mantém instâncias associadas aos canvas; destrua-as antes de
        // redesenhar quando mudar o contêiner ou o filtro de período.
        graficosAtivos.forEach((chart) => chart.destroy());
        graficosAtivos = [];
        $("docker-graficos").replaceChildren();
        document.querySelector(".docker-aviso-medicoes").textContent = "Rede, disco e throttling mostram o total observado desde a última leitura do dia anterior, na data da leitura final. Os horários aparecem ao passar o mouse. Os resumos não permitem calcular totais exatos de meia-noite a meia-noite. O primeiro dia, lacunas, reinícios e resets detectados ficam sem valor. Referências são comparativas, sem limites de alerta.";
        if (usarHorario()) document.querySelector(".docker-aviso-medicoes").textContent = "Cada ponto resume uma hora. Rede, disco e throttling mostram diferenças entre leituras horárias consecutivas. A primeira leitura, lacunas e reinícios ficam sem valor; não são tratados como zero. Horários em BRT.";
        if (usarMinuto()) document.querySelector(".docker-aviso-medicoes").textContent = "CPU, memória e PIDs mostram média e pico a cada 5 minutos. Rede e disco mostram MiB transferidos em cada intervalo; throttling mostra segundos acumulados em 5 minutos. Lacunas, reinícios e uso após encerramento ficam sem valor. KPIs e referências de CPU, memória e PIDs continuam baseados nos resumos horários.";
        if ([v => v.rede?.recebidos, v => v.rede?.enviados, v => v.disco?.leitura_acumulada, v => v.disco?.escrita_acumulada, v => v.cpu?.tempo_throttled]
            .some(ler => temTotaisObservados(historicoAtivo, c, ler))) document.querySelector(".docker-aviso-medicoes").textContent = "Volumes em MiB e throttling em segundos somam os deltas conhecidos das capturas por minuto. Reinícios preservam o consumo medido; totais parciais são identificados no tooltip. Zero indica ausência de incremento observada; lacunas desconhecidas não são zero. CPU, RAM e PIDs mantêm médias e picos na granularidade selecionada.";
        grafico("CPU (% da capacidade do host)", "Média e pico registrados em cada dia", n(c.cpu?.uso?.media, "%") + " média", c, [
            { nome: "Média diária", ler: (v) => v.cpu?.uso?.media },
            { nome: "Pico diário", ler: (v) => v.cpu?.uso?.maximo }
        ], "%", true, (v) => v.cpu?.uso);
        grafico("Memória (% da capacidade do host)", "Média e pico registrados em cada dia", n(c.memoria?.uso?.media, "%") + " média", c, [
            { nome: "Média diária", ler: (v) => v.memoria?.uso?.media },
            { nome: "Pico diário", ler: (v) => v.memoria?.uso?.maximo }
        ], "%", true, (v) => v.memoria?.uso);
        graficoContadores("Rede (MB por intervalo)", c, [
            { nome: "RX · recebidos", cor: "#346b9f", corReferencia: "#8197a9", ler: (v) => v.rede?.recebidos },
            { nome: "TX · enviados", cor: "#8663a6", corReferencia: "#a395af", ler: (v) => v.rede?.enviados }
        ], " MB", 1024 * 1024);
        graficoContadores("Disco (MB por intervalo)", c, [
            { nome: "Leitura", cor: "#346b9f", corReferencia: "#8197a9", ler: (v) => v.disco?.leitura_acumulada },
            { nome: "Escrita", cor: "#8663a6", corReferencia: "#a395af", ler: (v) => v.disco?.escrita_acumulada }
        ], " MB", 1024 * 1024);
        grafico("PIDs / Threads", "Média e máximo registrados em cada dia", n(c.pids?.atuais?.media) + " média", c, [
            { nome: "Média diária", ler: (v) => v.pids?.atuais?.media },
            { nome: "Pico diário", ler: (v) => v.pids?.atuais?.maximo }
        ], "", false, (v) => v.pids?.atuais);
        graficoContadores("CPU Throttling", c, [
            { nome: "Tempo limitado", ler: (v) => v.cpu?.tempo_throttled }
        ], " s", 1e9, true, true);
    }

    function renderizarLogs(c) {
        const painel = $("docker-logs-conteudo");
        painel.replaceChildren();

        // Usa todo o histórico carregado; o filtro dos gráficos não limita os logs.
        // Registros originais são opcionais. Contagens não viram mensagens fictícias.
        const registros = A.registros([...historico, ...historicoHorario], "logs", c).map((r) => ({
            ...r, nivel: String(r.nivel || "unknown").toLowerCase().trim().replace(/^err$/, "error").replace(/^warning$/, "warn")
        }));
        if (logsUltimas24h) {
            logsPeriodo = A.ultimas24HorasLogs(referenciaLocal ?? Date.now());
            const formatarCampo = (timestamp) => {
                const partes = new Intl.DateTimeFormat("en-CA", {
                    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
                    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
                }).formatToParts(new Date(timestamp));
                const valor = (tipo) => partes.find((p) => p.type === tipo).value;
                return `${valor("year")}-${valor("month")}-${valor("day")}T${valor("hour")}:${valor("minute")}`;
            };
            $("docker-logs-inicio").value = formatarCampo(logsPeriodo.inicio);
            $("docker-logs-fim").value = formatarCampo(logsPeriodo.fim);
        }
        $("docker-logs-ultimas24h").classList.toggle("ativo", logsUltimas24h);
        $("docker-logs-ultimas24h").setAttribute("aria-pressed", String(logsUltimas24h));
        $("docker-logs-descricao").textContent = logsUltimas24h ? "Últimas 24 horas"
            : logsPeriodo.inicio === null && logsPeriodo.fim === null ? "Histórico completo" : "Período selecionado";

        const filtroNivel = $("docker-logs-nivel")?.value || "";
        const busca = ($("docker-logs-busca")?.value || "").toLocaleLowerCase("pt-BR").trim();
        const visiveis = A.filtrarLogs(registros, { ...logsPeriodo, nivel: filtroNivel, busca, maisRecentes: logsMaisRecentes });
        logsExibidos = visiveis;
        $("docker-logs-download").disabled = !visiveis.length;

        const consoleLogs = adicionarTexto(painel, "div", "", "docker-console");
        const cabecalho = adicionarTexto(consoleLogs, "div", "", "docker-console-cabecalho");
        adicionarTexto(cabecalho, "span", `stdout / stderr · ${c.nome || "contêiner"}`);
        for (const registro of visiveis) {
            const linha = adicionarTexto(consoleLogs, "div", "", "docker-console-linha");
            const data = new Date(registro.timestamp);
            const tempo = adicionarTexto(linha, "time", data.toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric",
                hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3
            }), "docker-console-data");
            tempo.dateTime = data.toISOString();
            tempo.title = `${data.toISOString()} · exibido em Brasília`;
            const classe = /^(error|err|fatal)$/.test(registro.nivel) ? "erro"
                : /^(warn|warning)$/.test(registro.nivel) ? "aviso"
                : registro.nivel === "info" ? "info" : "desconhecido";
            adicionarTexto(linha, "span", registro.nivel === "unknown"
                ? "UNKNOWN" : registro.nivel.toUpperCase(), `docker-console-nivel ${classe}`);
            adicionarTexto(linha, "span", registro.mensagem ?? "", "docker-console-mensagem");
        }

    }

    function listarEventos(lista, c) {
        const registros = A.registros(lista, "eventos", c);
        const detalhados = registros.map(r => ({
            data: D.diaSaoPaulo(new Date(r.timestamp)), timestamp: r.timestamp,
            acao: r.tipo, quantidade: 1, descricao: r.descricao
        }));
        const agregados = lista.flatMap(doc => {
            const grupo = doc.eventos.find(e => e.container_id === c.container_id || (c.nome && e.nome === c.nome));
            if (!grupo) return [];
            const individuais = A.registros([{ ...doc, eventos: [grupo] }], "eventos", c);
            return Object.entries(grupo.acoes || {}).flatMap(([acao, medida]) => {
                const total = D.total(medida);
                const conhecidos = individuais.filter(r => r.tipo === acao).length;
                // Mostra só o restante sem timestamp, sem contar eventos detalhados duas vezes.
                const quantidade = total === null ? (conhecidos ? 0 : null) : Math.max(0, total - conhecidos);
                return quantidade === 0 ? [] : [{ data: doc.data, timestamp: null, acao, quantidade }];
            });
        });
        return [...detalhados, ...agregados].sort((a, b) => b.data.localeCompare(a.data)
            || (b.timestamp ?? -Infinity) - (a.timestamp ?? -Infinity));
    }

    function renderizarEventos(c) {
        $("docker-eventos-descricao").textContent = `Histórico do período · ${c.nome || "Contêiner"}`;
        const painel = $("docker-eventos-conteudo");
        painel.replaceChildren();
        const eventos = listarEventos(historicoAtivo, c);
        if (!eventos.length) {
            adicionarTexto(painel, "p", "Não há registros de eventos disponíveis para este contêiner.", "docker-nenhum");
            return;
        }
        const lista = adicionarTexto(painel, "div", "", "docker-eventos-tabela");
        for (const evento of eventos) {
            const linha = adicionarTexto(lista, "div", "", "docker-evento-linha");
            const horario = evento.timestamp === null ? `${evento.data.split("-").reverse().join("/")} · horário indisponível`
                : new Date(evento.timestamp).toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric",
                    hour: "2-digit", minute: "2-digit", second: "2-digit"
                }) + " BRT";
            adicionarTexto(linha, "span", horario, "docker-evento-data");
            adicionarTexto(linha, "span", evento.acao, "docker-evento-acao");
            adicionarTexto(linha, "span", evento.timestamp === null
                ? `${n(evento.quantidade)} ocorrência(s) sem horário individual informado`
                : evento.descricao || "1 ocorrência", "docker-evento-descricao");
        }
        adicionarTexto(painel, "p", eventos.some(e => e.timestamp === null)
            ? "A fonte não informa o horário individual de algumas ocorrências; elas permanecem agrupadas."
            : "Horários de Brasília · eventos mais recentes primeiro.", "docker-console-nota");
    }

    function limparDetalhe() {
        logsExibidos = [];
        $("docker-logs-download").disabled = true;
        graficosAtivos.forEach((chart) => chart.destroy());
        graficosAtivos = [];
        $("docker-detalhe-titulo").textContent = "Detalhes do contêiner";
        $("docker-detalhe-id").textContent = "Selecione um contêiner na tabela";
        $("docker-detalhe-id").removeAttribute("title");
        $("docker-detalhe-estado").textContent = "—";
        $("docker-detalhe-estado").className = "docker-estado parado";
        $("docker-detalhe-campos").replaceChildren();
        $("docker-detalhe-metricas").replaceChildren();
        $("docker-desempenho-titulo").textContent = "Desempenho";
        $("docker-desempenho-descricao").textContent = "Selecione um contêiner para visualizar o histórico.";
        $("docker-logs-descricao").textContent = "Selecione um contêiner para investigar seus registros";
        $("docker-eventos-descricao").textContent = "Histórico do período selecionado · mais recentes primeiro";
        $("docker-eventos-health").textContent = "Healthcheck não informado";
        $("docker-eventos-health").className = "docker-estado parado";
        $("docker-graficos").replaceChildren();
        $("docker-logs-conteudo").textContent = "Selecione um contêiner.";
        $("docker-eventos-conteudo").textContent = "Selecione um contêiner.";
    }

    function selecionar(id) {
        if (!dados) return;
        const container = dados.containers.find((c) => c.container_id === id);
        selecionadoId = container?.container_id || null;
        indicadores = container ? calcularIndicadores(container) : null;
        renderizarKpis();
        $("docker-resumo-titulo").textContent = container ? `Visão do contêiner — ${container.nome || container.container_id.slice(0, 12)}` : "Visão do contêiner";
        $("docker-escopo-servidor").textContent = `${dados.containers.length} containers monitorados`;
        renderizarLista();
        if (!container) { limparDetalhe(); return; }
        renderizarDetalhe(container);
        renderizarGraficos(container);
        renderizarLogs(container);
        renderizarEventos(container);
    }

    function atualizarPeriodo() {
        intervaloAtivo = periodoPersonalizado || {
            fim: instanteResumo(historicoHorario.at(-1) || {}),
            inicio: instanteResumo(historicoHorario.at(-1) || {}) - periodoDias * 86400000
        };
        if (periodoPersonalizado) {
            const tipo = P.granularidade(periodoPersonalizado);
            const referencia = referenciaSuperior();
            const valido = Number.isFinite(referencia) && periodoPersonalizado.fim <= referencia;
            if (valido) $("docker-periodo-erro").hidden = true;
            if (!valido) {
                $("docker-periodo-erro").textContent = "O período ultrapassa a referência deste servidor ou seus dados ainda não foram carregados.";
                $("docker-periodo-erro").hidden = false;
            }
            historicoAtivo = !valido ? [] : tipo === "cinco"
                ? (usarMinuto() ? P.cincoMinutos(historicoHorario, periodoPersonalizado) : [])
                : P.completos(tipo === "dia" ? historico : historicoHorario, periodoPersonalizado, tipo);
        } else {
            historicoAtivo = usarHorario()
                ? filtrarIntervalo(historicoHorario, intervaloAtivo.inicio, intervaloAtivo.fim)
                : filtrarPeriodo(historico, periodoDias);
        }
        dados = historicoAtivo.at(-1) || null;
        $("docker-periodo").value = periodoPersonalizado ? "personalizado" : String(periodoDias);
        $("docker-feedback").hidden = true;
        if (!dados) {
            limparDetalhe();
            $("docker-linhas").replaceChildren();
            const linha = adicionarTexto($("docker-linhas"), "tr", "");
            adicionarTexto(linha, "td", periodoPersonalizado ? "Não há dados com precisão suficiente dentro dos limites selecionados. Escolha outro intervalo." : "Sem dados no período selecionado.").colSpan = 5;
            indicadores = null;
            renderizarKpis();
            $("kpi-falhas").textContent = "—";
            $("kpi-erros").textContent = "—";
            $("docker-total-containers").textContent = "(0)";
            $("docker-escopo-servidor").textContent = "Nenhum contêiner no período";
            $("docker-resumo-titulo").textContent = "Visão do contêiner";
            $("docker-ultima-coleta").textContent = "Sem leitura no período";
            $("docker-periodo-info").textContent = periodoPersonalizado ? "Não há dados com precisão suficiente dentro dos limites selecionados. Resumos que ultrapassam o período não são incluídos." : "Não há resumos disponíveis nesse período. Selecione outro intervalo.";
            $("docker-desempenho-descricao").textContent = "Sem dados no período selecionado.";
            return;
        }
        renderizarContexto();
        // Preserva a seleção ao mudar de período se o contêiner ainda existir.
        const anterior = historico.findLast((doc) => doc.containers.some((c) => c.container_id === selecionadoId))
            ?.containers.find((c) => c.container_id === selecionadoId);
        const candidato = anterior ? containerNoDia(dados, anterior) : null;
        selecionar(candidato?.container_id || null);
    }

    async function iniciar() {
        renderizarKpis();
        try {
            await carregarContextos();
            await trocarServidorSelecionado();
        } catch (erro) {
            $("docker-feedback").hidden = false;
            $("docker-feedback").textContent = `Não foi possível carregar o histórico: ${erro.message}`;
            $("docker-linhas").replaceChildren();
            const linha = adicionarTexto($("docker-linhas"), "tr", "");
            const celula = adicionarTexto(linha, "td", "Nenhum dado carregado. Confira a conexão com a API e o S3.");
            celula.colSpan = 5;
            console.error("CoreTrace Docker:", erro);
        }
    }

    // São funções puras que também podem ser verificadas pelos testes Node,
    // sem depender de um navegador nem de credenciais da AWS.
    if (typeof module !== "undefined" && module.exports) {
        module.exports = {
            listarEventos, referenciaSuperior, horarioPico, pontosVolumesLocais, agruparCincoMinutos, pontosMinuto, validar: D.validar, resumoLog: D.resumoLog, filtrarPeriodo, filtrar24Horas, filtrarIntervalo, validarPeriodoPersonalizado,
            containerNoDia, reiniciosDetectados, contarFalhas, contarErros,
            criarPontosDiarios, calcularMediaHistorica, criarDatasetReferencia,
            leiturasContinuas, criarPontosIntervalos, calcularMediaIntervalos, criarReferenciasIntervalos
        };
    }
    if (typeof document === "undefined") return;

    $("docker-busca").addEventListener("input", () => { if (dados) renderizarLista(); });
    $("docker-pesquisa-contexto").addEventListener("input", (evento) => {
        const busca = evento.target.value.trim().toLocaleLowerCase("pt-BR");
        const resultado = $("docker-contexto-resultado");
        resultado.hidden = !busca;
        const encontrados = servidoresDisponiveis.filter((servidor) => {
            const perfil = perfisDisponiveis.find((item) => String(item.id_perfil_servidor) === String(servidor.id_perfil_servidor));
            return `${servidor.nome} ${servidor.endereco_mac} ${perfil?.nome || servidor.nome_perfil || ""}`
                .toLocaleLowerCase("pt-BR").includes(busca);
        });
        resultado.textContent = !servidoresDisponiveis.length ? "Aguardando a lista de servidores."
            : encontrados.length
                ? `${encontrados.length} servidor(es) encontrado(s): ${encontrados.map((servidor) => servidor.nome).join(", ")}`
                : "Nenhum servidor ou perfil corresponde à busca.";
    });
    $("docker-limpar").addEventListener("click", () => selecionar(null));
    const atualizarLogsSelecionado = () => {
        const c = dados?.containers.find((item) => item.container_id === selecionadoId);
        if (c) renderizarLogs(c);
    };
    $("docker-logs-download").addEventListener("click", () => {
        const c = dados?.containers.find((item) => item.container_id === selecionadoId);
        if (!c || !logsExibidos.length) return;
        const texto = logsExibidos.map((r) => `${r.timestampOriginal || new Date(r.timestamp).toISOString()} ${r.nivel.toUpperCase()} ${r.mensagem ?? ""}`).join("\n") + "\n";
        const url = URL.createObjectURL(new Blob([texto], { type: "text/plain;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        const nome = (c.nome || c.container_id).replace(/[^\p{L}\p{N}_-]/gu, "_");
        link.download = `docker-${nome}.log`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    $("docker-logs-periodo").addEventListener("submit", (evento) => {
        evento.preventDefault();
        const erro = $("docker-logs-periodo-erro");
        try {
            logsPeriodo = A.periodoLogs($("docker-logs-inicio").value, $("docker-logs-fim").value);
            logsUltimas24h = false;
            $("docker-logs-ultimas24h").classList.remove("ativo");
            $("docker-logs-ultimas24h").setAttribute("aria-pressed", "false");
            erro.hidden = true;
            atualizarLogsSelecionado();
        } catch (e) {
            erro.textContent = e.message;
            erro.hidden = false;
            $("docker-logs-fim").setAttribute("aria-invalid", "true");
        }
    });
    $("docker-logs-periodo").addEventListener("input", () => {
        $("docker-logs-periodo-erro").hidden = true;
        $("docker-logs-fim").removeAttribute("aria-invalid");
    });
    $("docker-logs-ultimas24h").addEventListener("click", () => {
        $("docker-logs-periodo-erro").hidden = true;
        $("docker-logs-fim").removeAttribute("aria-invalid");
        logsUltimas24h = true;
        $("docker-logs-ultimas24h").classList.add("ativo");
        $("docker-logs-ultimas24h").setAttribute("aria-pressed", "true");
        atualizarLogsSelecionado();
    });
    $("docker-logs-nivel")?.addEventListener("change", atualizarLogsSelecionado);
    $("docker-logs-busca")?.addEventListener("input", atualizarLogsSelecionado);
    $("docker-logs-ordem")?.addEventListener("click", () => {
        logsMaisRecentes = !logsMaisRecentes;
        $("docker-logs-ordem").querySelector("span").textContent = logsMaisRecentes ? "Mais recentes primeiro" : "Mais antigos primeiro";
        $("docker-logs-ordem").setAttribute("aria-pressed", String(logsMaisRecentes));
        atualizarLogsSelecionado();
    });
    $("docker-logs-recolher")?.addEventListener("click", () => {
        const painel = $("docker-logs-painel");
        painel.hidden = !painel.hidden;
        $("docker-logs-recolher").querySelector("span").textContent = painel.hidden ? "Expandir painel" : "Recolher painel";
        $("docker-logs-recolher").setAttribute("aria-expanded", String(!painel.hidden));
    });
    $("docker-periodo").addEventListener("change", (evento) => {
        const personalizado = evento.target.value === "personalizado";
        $("docker-periodo-personalizado").hidden = !personalizado;
        $("docker-periodo-erro").hidden = true;
        if (personalizado) {
            $("docker-periodo-inicio").focus();
            return;
        }
        periodoPersonalizado = null;
        periodoDias = Number(evento.target.value);
        atualizarPeriodo();
    });
    document.querySelectorAll("[data-pico]").forEach((botao) => botao.addEventListener("click", () => {
        tipoPico = botao.dataset.pico;
        if (dados) renderizarKpis();
    }));
    $("docker-periodo-personalizado").addEventListener("submit", (evento) => {
        evento.preventDefault();
        const erro = $("docker-periodo-erro");
        try {
            periodoPersonalizado = validarPeriodoPersonalizado($("docker-periodo-inicio").value, $("docker-periodo-fim").value);
            erro.hidden = true;
            atualizarPeriodo();
        } catch (falha) {
            erro.textContent = falha.message;
            erro.hidden = false;
        }
    });
    iniciar();
})();
