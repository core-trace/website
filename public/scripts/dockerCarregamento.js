/* Carregamento sob demanda: cache de documentos originais, isolado por fonte e máquina. */
(function (raiz) {
    'use strict';
    const DIA = 86400000;
    const dia = instante => new Date(instante - 10800000).toISOString().slice(0, 10);
    async function paralelo(itens, executar) {
        const resultado = new Array(itens.length);
        let indice = 0;
        let falhou = false;
        await Promise.all(Array.from({ length: Math.min(6, itens.length) }, async () => {
            while (!falhou && indice < itens.length) {
                const atual = indice++;
                try { resultado[atual] = await executar(itens[atual]); }
                catch (erro) { falhou = true; throw erro; }
            }
        }));
        return resultado;
    }
    function criar({ validar, normalizar, fetch: buscar = (...args) => fetch(...args), agora = Date.now }) {
        const arquivosCache = new Map();
        const listasCache = new Map();
        async function carregar({ mac, dias, personalizado = null, signal }) {
            const inicioCarga = agora();
            const prefixo = `client/resumos/maquina=${mac}/`;
            const metricas = { maquina: mac, listagens: 0, objetosListados: 0, arquivosConsultados: 0, arquivosBaixados: 0, acertosCache: 0, bytesTransferidos: 0, requisicoes: [] };
            let fonte;
            async function requisitar(rota, parametros) {
                const inicioRequisicao = agora();
                const resposta = await buscar(`/s3Routes/${rota}?${new URLSearchParams({ dashboard: 'docker', ...parametros })}`, { cache: 'no-store', signal });
                if (!resposta.ok) throw new Error(`HTTP ${resposta.status} ao carregar os resumos.`);
                const origem = resposta.headers.get('X-Docker-Fonte');
                if (!['local', 's3'].includes(origem) || (fonte && origem !== fonte)) throw new Error('A fonte de dados mudou. Recarregue a dashboard.');
                fonte = origem;
                const texto = await resposta.text();
                metricas.requisicoes.push({ operacao: rota, totalMs: agora() - inicioRequisicao,
                    servidorMs: Number(resposta.headers.get('Server-Timing')?.match(/fonte;dur=([\d.]+)/)?.[1]) || 0 });
                // Bytes do corpo HTTP em UTF-8, incluindo o envelope JSON da API.
                metricas.bytesTransferidos += new TextEncoder().encode(texto).byteLength;
                return { corpo: JSON.parse(texto), resposta };
            }
            try {
                // Delimiter lista somente as pastas de datas, nunca os objetos de todo o histórico.
                const descoberta = await requisitar('arquivos', { prefixo, pastas: '1' });
                metricas.listagens++;
                const referenciaLocal = Date.parse(descoberta.resposta.headers.get('X-Docker-Referencia'));
                if (!Array.isArray(descoberta.corpo)) throw new Error('Lista de datas inválida.');
                const datas = descoberta.corpo.map(p => p.Prefix).filter(p => typeof p === 'string' && p.startsWith(prefixo)
                    && /^data=\d{4}-\d{2}-\d{2}\/$/.test(p.slice(prefixo.length))).map(p => p.slice(-11, -1)).sort();
                const escopo = `${fonte}:${prefixo}`;
                const consultados = new Set();
                async function listarPeriodo(inicio, fim) {
                    const selecionadas = datas.filter(d => d >= inicio && d <= fim);
                    if (selecionadas.every(d => { const c = listasCache.get(`${escopo}${d}`); return c && agora() - c.instante < 60000; })) return;
                    const { corpo } = await requisitar('arquivos', { prefixo, inicio, fim });
                    metricas.listagens++;
                    if (!Array.isArray(corpo)) throw new Error('Lista de resumos inválida.');
                    metricas.objetosListados += corpo.length;
                    for (const data of selecionadas) listasCache.set(`${escopo}${data}`, { instante: agora(),
                        itens: corpo.filter(a => typeof a.Key === 'string' && a.Key.startsWith(`${prefixo}data=${data}/`)
                            && /\/(?:hora=\d{2}(?:\d{2})?\/)?resumo\.json$/.test(a.Key)) });
                }

                async function listar(data) {
                    const chave = `${escopo}${data}`;
                    const cache = listasCache.get(chave);
                    if (cache && agora() - cache.instante < 60000) return cache.itens;
                    const { corpo } = await requisitar('arquivos', { prefixo: `${prefixo}data=${data}/` });
                    metricas.listagens++;
                    if (!Array.isArray(corpo)) throw new Error('Lista de resumos inválida.');
                    metricas.objetosListados += corpo.length;
                    const itens = corpo.filter(a => typeof a.Key === 'string' && a.Key.startsWith(`${prefixo}data=${data}/`)
                        && /\/(?:hora=\d{2}(?:\d{2})?\/)?resumo\.json$/.test(a.Key));
                    listasCache.set(chave, { instante: agora(), itens });
                    return itens;
                }
                async function ler(arquivo) {
                    const chave = `${fonte}:${arquivo.Key}`;
                    const versao = arquivo.ETag || arquivo.LastModified ? JSON.stringify([arquivo.ETag, arquivo.LastModified, arquivo.Size]) : null;
                    const cache = arquivosCache.get(chave);
                    const primeiraConsulta = !consultados.has(chave);
                    if (primeiraConsulta) { metricas.arquivosConsultados++; consultados.add(chave); }
                    if (cache && (versao ? cache.versao === versao : agora() - cache.instante < 60000)) {
                        if (primeiraConsulta) metricas.acertosCache++;
                        return cache.documento;
                    }
                    const { corpo } = await requisitar('conteudo', { arquivo: arquivo.Key });
                    metricas.arquivosBaixados++;
                    const original = typeof corpo.conteudo === 'string' ? JSON.parse(corpo.conteudo) : corpo.conteudo;
                    const documento = validar(original);
                    if (documento.mac !== mac) throw new Error('O resumo não corresponde ao servidor selecionado.');
                    if (original.granularidade === 'hora' && (!documento.intervalo
                        || Date.parse(documento.intervalo.fim) - Date.parse(documento.intervalo.inicio) !== 3600000)) {
                        throw new Error('Resumo horário sem intervalo válido de uma hora.');
                    }
                    arquivosCache.set(chave, { documento, versao, instante: agora() });
                    return documento;
                }
                const diario = a => !a.Key.includes('/hora=');
                const fimChave = a => {
                    const partes = /data=(\d{4}-\d{2}-\d{2})\/hora=(\d{2})(\d{2})?\//.exec(a.Key);
                    return partes ? Date.parse(`${partes[1]}T${partes[2]}:${partes[3] || '00'}:00-03:00`) : NaN;
                };
                const tipo = personalizado ? personalizado.fim - personalizado.inicio <= 3600000 ? 'cinco'
                    : personalizado.fim - personalizado.inicio <= DIA ? 'hora' : 'dia' : dias <= 1 ? 'hora' : 'dia';
                if (datas.length && tipo === 'dia' && !personalizado) {
                    const fim = datas.at(-1);
                    await listarPeriodo(new Date(Date.parse(fim) - (dias - 1) * DIA).toISOString().slice(0, 10), fim);
                }
                let ancoraDiaria, ancoraHora;
                // Descobre a última leitura disponível mesmo quando a máquina está sem enviar dados.
                for (const data of [...datas].reverse()) {
                    const itens = await listar(data);
                    ancoraDiaria ||= itens.find(diario);
                    ancoraHora ||= itens.filter(a => !diario(a)).sort((a, b) => fimChave(b) - fimChave(a))[0];
                    if (ancoraDiaria && (tipo === 'dia' || personalizado || ancoraHora)) break;
                }
                const arquivosAncoras = [ancoraDiaria, tipo !== 'dia' && !personalizado ? ancoraHora : null].filter(Boolean);
                if (tipo === 'dia' && !personalizado && ancoraDiaria) {
                    const fim = ancoraDiaria.Key.match(/data=(\d{4}-\d{2}-\d{2})/)[1];
                    const inicio = new Date(Date.parse(fim) - (dias - 1) * DIA).toISOString().slice(0, 10);
                    await listarPeriodo(inicio, fim);
                    for (const data of datas.filter(d => d >= inicio && d <= fim)) {
                        arquivosAncoras.push(...(await listar(data)).filter(diario));
                    }
                }
                const ancoras = await paralelo([...new Map(arquivosAncoras.map(a => [a.Key, a])).values()], ler);
                const ultimaHora = ancoras.find(d => d.intervalo);
                const ultimoDia = ancoras.find(d => !d.intervalo);
                let referenciaDados = Math.max(...ancoras.flatMap(d => d.containers.map(c => Date.parse(c.ultima_observacao))).filter(Number.isFinite));
                // A referência também deve considerar uma hora nova ainda sem resumo diário.
                if (ancoraHora && !ultimaHora && (!Number.isFinite(referenciaDados)
                    || fimChave(ancoraHora) + (/hora=\d{2}\//.test(ancoraHora.Key) ? 3600000 : 0) > referenciaDados)) {
                    const recente = await ler(ancoraHora);
                    referenciaDados = Math.max(referenciaDados, ...recente.containers.map(c => Date.parse(c.ultima_observacao)).filter(Number.isFinite));
                }
                let periodo = personalizado;
                if (!periodo && tipo !== 'dia' && ultimaHora) periodo = { fim: Date.parse(ultimaHora.intervalo.fim), inicio: Date.parse(ultimaHora.intervalo.fim) - dias * DIA };
                if (!periodo && tipo === 'dia' && ultimoDia) {
                    const fim = Date.parse(ultimoDia.data + 'T00:00:00-03:00') + DIA;
                    periodo = { inicio: fim - dias * DIA, fim };
                }
                const escolhidas = !periodo ? [] : datas.filter(data => {
                    const a = Date.parse(data + 'T00:00:00-03:00');
                    // Uma hora anterior pode conter a captura-base para deltas de cinco minutos.
                    return tipo === 'dia' ? a >= periodo.inicio && a + DIA <= periodo.fim
                        : data >= dia(periodo.inicio - 3600000) && data <= dia(periodo.fim);
                });
                const listas = await paralelo(escolhidas, listar);
                const necessarios = listas.flatMap(itens => {
                    if (tipo === 'dia') return itens.filter(diario);
                    const horas = itens.filter(a => {
                        const fim = fimChave(a);
                        // HH antigo pode representar o início da hora; o JSON confirma o intervalo exato.
                        const tolerancia = /hora=\d{2}\//.test(a.Key) ? 3600000 : 0;
                        return fim >= periodo.inicio - tolerancia && fim <= periodo.fim + tolerancia;
                    });
                    return horas.length ? [...horas, ...itens.filter(diario)] : [];
                });
                const unicos = [...new Map(necessarios.map(a => [a.Key, a])).values()];
                const documentos = await paralelo(unicos, ler);
                // As âncoras servem apenas à referência. Não ampliam o recorte selecionado.
                return { documentos: normalizar(documentos), referenciaLocal: Number.isFinite(referenciaLocal) ? referenciaLocal : null,
                    referenciaDados: Number.isFinite(referenciaDados) ? referenciaDados : null };
            } finally {
                metricas.fonte = fonte;
                metricas.tempoMs = agora() - inicioCarga;
                metricas.cancelado = Boolean(signal?.aborted);
                console.info('CoreTrace Docker · carregamento', metricas);
            }
        }
        return { carregar };
    }
    const api = { criar };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else raiz.CoreTraceDockerCarregamento = api;
})(typeof window !== 'undefined' ? window : globalThis);
