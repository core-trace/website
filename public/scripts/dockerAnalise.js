/* Cálculos temporais da dashboard. Sem dependências de DOM ou de serviços. */
(function (raiz) {
    "use strict";
    const numero = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
    const instante = (v) => {
        if (!v) return NaN;
        return Date.parse(String(v).trim().replace(" ", "T").replace(/\.(\d{3})\d+(?=Z|[+-]\d\d:\d\d$)/, ".$1"));
    };
    function intervalo(doc) {
        if (doc.intervalo) return { inicio: instante(doc.intervalo.inicio), fim: instante(doc.intervalo.fim) };
        const inicio = instante(doc.data + "T00:00:00-03:00");
        return { inicio, fim: inicio + 86400000 };
    }
    function container(doc, referencia) {
        return doc.containers.find((c) => c.container_id === referencia.container_id)
            || doc.containers.find((c) => referencia.nome && c.nome === referencia.nome);
    }
    const pertence = (item, c) => item.container_id
        ? item.container_id === c.container_id : Boolean(c.nome && item.nome === c.nome);
    function janela(lista, inicio, fim) {
        return lista.filter((doc) => {
            const periodo = intervalo(doc);
            return periodo.inicio >= inicio && periodo.fim <= fim;
        }).sort((a, b) => intervalo(a).fim - intervalo(b).fim);
    }
    function cobertura(lista, inicio, fim, c = null) {
        let cursor = inicio;
        for (const doc of janela(lista, inicio, fim)) {
            if (c && !container(doc, c)) continue;
            const periodo = intervalo(doc);
            if (periodo.inicio > cursor) return false;
            cursor = Math.max(cursor, periodo.fim);
        }
        return cursor >= fim;
    }
    function registros(lista, tipo, c) {
        // Registros individuais são opcionais. Contagens agregadas não viram mensagens/eventos.
        const encontrados = lista.flatMap((doc) => (doc[tipo] || []).flatMap((grupo) => {
            if (!pertence(grupo, c)) return [];
            return (Array.isArray(grupo.registros) ? grupo.registros : [grupo]).flatMap((r) => {
                const timestamp = instante(r.timestamp);
                if (!Number.isFinite(timestamp)) return [];
                if (tipo === "logs" && typeof r.mensagem !== "string") return [];
                if (tipo === "eventos" && typeof r.tipo !== "string") return [];
                return [{ ...r, timestamp }];
            });
        }));
        return [...new Map(encontrados.map((r) => [r.id || JSON.stringify([r.timestamp, r.nivel, r.tipo, r.mensagem, r.descricao]), r])).values()]
            .sort((a, b) => a.timestamp - b.timestamp);
    }
    function falhas(lista, inicio, fim, c = null) {
        const ids = new Set();
        for (const doc of lista) for (const v of c ? [container(doc, c)].filter(Boolean) : doc.containers) {
            const t = instante(v.finished_at);
            const erro = numero(v.exit_code) !== null && v.exit_code !== 0;
            if (t > inicio && t <= fim && (erro || v.oom_killed === true || String(v.oom_killed).toLowerCase() === "true")) {
                ids.add(`${v.container_id}:${t}`); // OOM + saída representam o mesmo encerramento.
            }
        }
        return ids.size;
    }
    function reinicios(lista, inicio, fim, c) {
        const leituras = lista.map((doc) => ({ doc, c: container(doc, c) }))
            .filter((v) => v.c).sort((a, b) => intervalo(a.doc).fim - intervalo(b.doc).fim);
        const base = leituras.findLast((v) => intervalo(v.doc).fim <= inicio);
        let anterior = base;
        let soma = 0;
        let comparacoes = 0;
        for (const atual of leituras.filter((v) => intervalo(v.doc).fim > inicio && intervalo(v.doc).fim <= fim)) {
            if (!anterior) { anterior = atual; continue; }
            const a = numero(anterior.c.reinicios?.total?.ultimo_valor);
            const b = numero(atual.c.reinicios?.total?.ultimo_valor);
            const periodo = intervalo(atual.doc);
            if (a === null || b === null || b < a || atual.c.container_id !== anterior.c.container_id
                || intervalo(anterior.doc).fim < periodo.inicio) return null;
            soma += b - a;
            comparacoes++;
            anterior = atual;
        }
        // Sem referência na fronteira, não afirmamos o total de todo o período.
        return base && intervalo(base.doc).fim === inicio && comparacoes ? soma : null;
    }
    function indicadores(lista, inicio, fim, c = null) {
        const docs = janela(lista, inicio, fim);
        const completo = cobertura(lista, inicio, fim, c);
        const vazios = { falhasConhecidas: null, reiniciosNoPeriodo: null, errosLogs: null, picoCpu: null, picoRam: null, completo };
        if (!completo) return vazios;
        const containers = c ? [c] : [...new Map(docs.flatMap((doc) => doc.containers).map((v) => [v.nome || v.container_id, v])).values()];
        const contagens = containers.map((v) => reinicios(lista, inicio, fim, v));
        let erros = 0;
        let logsValidos = true;
        for (const doc of docs) for (const v of c ? [container(doc, c)].filter(Boolean) : doc.containers) {
            const log = (doc.logs || []).find((l) => pertence(l, v));
            if (!log?.niveis) {
                logsValidos = false;
                continue;
            }
            if (Object.entries(log.niveis).some(([nivel, medida]) => !/^(info|warn|warning|error|err|debug|trace|fatal)$/i.test(nivel)
                && (numero(medida.total_observado) === null || medida.total_observado > 0))) logsValidos = false;
            for (const [nivel, medida] of Object.entries(log.niveis)) {
                if (!/^(error|err)$/i.test(nivel)) continue;
                const total = numero(medida.total_observado);
                if (total === null) logsValidos = false;
                else erros += total;
            }
        }
        const pico = (tipo) => docs.flatMap((doc) => (c ? [container(doc, c)].filter(Boolean) : doc.containers).map((v) => ({
            container: v, valor: numero((tipo === "cpu" ? v.cpu : v.memoria)?.uso?.maximo),
            fim: intervalo(doc).fim
        }))).filter((v) => v.valor !== null).sort((a, b) => b.valor - a.valor)[0] || null;
        return {
            completo, falhasConhecidas: falhas(lista, inicio, fim, c),
            reiniciosNoPeriodo: contagens.length && contagens.every((v) => v !== null) ? contagens.reduce((a, b) => a + b, 0) : null,
            errosLogs: logsValidos || erros > 0 ? erros : null, errosCompletos: logsValidos,
            picoCpu: pico("cpu"), picoRam: pico("ram")
        };
    }
    function pontos(lista, c, ler, inicio, fim) {
        const docs = janela(lista, inicio, fim);
        return docs.flatMap((doc, indice) => {
            const v = container(doc, c);
            const periodo = intervalo(doc);
            const ponto = { x: periodo.fim, y: v ? numero(ler(v)) : null };
            return indice > 0 && intervalo(docs[indice - 1]).fim < periodo.inicio
                ? [{ x: periodo.inicio, y: null }, ponto] : [ponto];
        });
    }
    function taxas(lista, c, ler, inicio, fim, divisor = 1024 * 1024, porSegundo = true) {
        const ordenados = [...lista].sort((a, b) => intervalo(a).fim - intervalo(b).fim);
        return janela(ordenados, inicio, fim).map((doc) => {
            const periodo = intervalo(doc);
            const ponto = { x: periodo.fim, y: null };
            const anteriorDoc = ordenados.findLast((d) => intervalo(d).fim === periodo.inicio);
            if (!anteriorDoc) return ponto;
            const a = container(anteriorDoc, c);
            const b = container(doc, c);
            if (!a || !b || a.container_id !== b.container_id || a.started_at !== b.started_at
                || numero(a.reinicios?.total?.ultimo_valor) === null
                || a.reinicios.total.ultimo_valor !== b.reinicios?.total?.ultimo_valor) return ponto;
            const ma = ler(a), mb = ler(b);
            if (numero(ma?.ultimo_valor) === null || numero(mb?.ultimo_valor) === null
                || !(ma.amostras_validas > 0) || !(mb.amostras_validas > 0)
                || (ma.ultimo_status && ma.ultimo_status !== "ok") || (mb.ultimo_status && mb.ultimo_status !== "ok")) return ponto;
            const ta = instante(a.ultima_observacao), tb = instante(b.ultima_observacao);
            if (!Number.isFinite(ta) || !Number.isFinite(tb) || tb <= ta || ta < inicio || tb > fim
                || ta !== periodo.inicio || tb !== periodo.fim) return ponto;
            const delta = mb.ultimo_valor - ma.ultimo_valor;
            if (delta < 0) return ponto;
            return { ...ponto, y: delta / divisor / (porSegundo ? (tb - ta) / 1000 : 1), inicio: ta };
        });
    }
    function eixo(inicio, fim) {
        const divisoes = fim - inicio >= 86400000 ? 4 : 5;
        return Array.from({ length: divisoes + 1 }, (_, i) => inicio + (fim - inicio) * i / divisoes);
    }
    const api = { numero, instante, intervalo, container, janela, cobertura, registros, falhas, reinicios, indicadores, pontos, taxas, eixo };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else raiz.CoreTraceDockerAnalise = api;
})(typeof window !== "undefined" ? window : globalThis);
