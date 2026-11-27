/* Conversão de apresentação. Nunca modifica documentos ou contadores de origem. */
(function (raiz) {
    'use strict';
    const numero = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
    const positivo = v => numero(v) !== null && v > 0 ? v : null;
    function bytes(valor, unidade) {
        const fatores = { bytes: 1, B: 1, KB: 1e3, MB: 1e6, GB: 1e9, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3 };
        return numero(valor) !== null && fatores[unidade] ? valor * fatores[unidade] : null;
    }
    function inventario(m) {
        return m && (!m.ultimo_status || m.ultimo_status === 'ok') && m.amostras_validas !== 0 ? m.ultimo_valor : null;
    }
    function nucleos(m) {
        const v = inventario(m);
        return m?.unidade === 'núcleos' && positivo(v) && Number.isInteger(v) ? v : null;
    }
    const cpu = (valor, host) => numero(valor) !== null && positivo(host?.nucleos) ? valor / host.nucleos : null;
    const ram = (valor, host) => numero(valor) !== null && positivo(host?.ramBytes) ? valor / host.ramBytes * 100 : null;
    function capacidades(doc, apoio, c) {
        // Sem propagação entre datas/servidores. Um valor explícito inválido não recebe fallback.
        const cpuHost = doc.hostOriginal?.cpu ?? apoio?.hostOriginal?.cpu;
        const ramHost = doc.hostOriginal?.ram ?? apoio?.hostOriginal?.ram;
        return {
            nucleos: cpuHost ? nucleos(cpuHost) : nucleos(c.cpu?.nucleos),
            ramBytes: positivo(bytes(inventario(ramHost), ramHost?.unidade)),
            limiteBytes: positivo(bytes(inventario(c.memoria?.limite), c.memoria?.limite?.unidade))
        };
    }
    const estatisticas = ['media', 'minimo', 'maximo', 'ultimo_valor'];
    function medida(original, converter) {
        const resultado = { ...original, unidade: '%' };
        for (const campo of estatisticas) resultado[campo] = converter(original?.[campo]);
        return resultado;
    }
    function apresentar(documentos) {
        const diarios = new Map(documentos.filter(d => !d.intervalo).map(d => [`${d.mac}:${d.data}`, d]));
        return documentos.map(doc => {
            if (doc.normalizadoHost) return doc;
            const containers = doc.containers.map(c => {
                const host = capacidades(doc, diarios.get(`${doc.mac}:${doc.data}`), c);
                const absoluta = c.memoria?.utilizada;
                const origemRam = absoluta || c.memoria?.uso;
                const usoRam = medida(origemRam, v => ram(absoluta ? bytes(v, absoluta.unidade)
                    : c.memoria?.uso?.unidade === '%' && numero(v) !== null && host.limiteBytes ? v / 100 * host.limiteBytes : null, host));
                return { ...c, apresentacaoHost: host,
                    cpu: { ...c.cpu, uso: medida(c.cpu?.uso, v => c.cpu?.uso?.unidade === '%' ? cpu(v, host) : null) },
                    memoria: { ...c.memoria, uso: usoRam } };
            });
            const seriesMinuto = doc.seriesMinuto?.map(serie => {
                const c = containers.find(c => c.container_id === serie.container_id);
                return { ...serie, amostras: serie.amostras.map(r => {
                    const copia = [...r];
                    copia[1] = cpu(r[1], c?.apresentacaoHost);
                    // Contrato local v1: RAM (%) do limite, cujo inventário é em bytes.
                    copia[2] = ram(numero(r[2]) !== null && c?.apresentacaoHost.limiteBytes
                        ? r[2] / 100 * c.apresentacaoHost.limiteBytes : null, c?.apresentacaoHost);
                    return copia;
                }) };
            });
            return { ...doc, containers, seriesMinuto, normalizadoHost: true };
        });
    }
    function detalhes(tipo, percentual, host) {
        if (numero(percentual) === null || !host) return [];
        const n = v => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
        if (tipo === 'cpu') {
            if (!positivo(host.nucleos)) return ['Capacidade de CPU do host indisponível'];
            const docker = percentual * host.nucleos;
            return [`CPU Docker: ${n(docker)}%`, `Núcleos equivalentes: ${n(docker / 100)} de ${host.nucleos}`];
        }
        if (!positivo(host.ramBytes)) return ['Capacidade de RAM do host indisponível'];
        const usada = percentual / 100 * host.ramBytes;
        return [`Memória utilizada: ${n(usada / 1024 ** 3)} GiB · host: ${n(host.ramBytes / 1024 ** 3)} GiB`,
            host.limiteBytes ? `Limite: ${n(host.limiteBytes / 1024 ** 3)} GiB · uso do limite: ${n(usada / host.limiteBytes * 100)}%` : 'Limite do contêiner indisponível'];
    }
    function hostComum(containers, tipo) {
        const hosts = containers.map(c => c?.apresentacaoHost);
        if (!hosts.length || hosts.some(h => !h)) return null;
        const campos = tipo === 'cpu' ? ['nucleos'] : ['ramBytes', 'limiteBytes'];
        return hosts.every(h => campos.every(k => h[k] === hosts[0][k])) ? hosts[0] : null;
    }
    const api = { bytes, cpu, ram, apresentar, capacidades, detalhes, hostComum };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else raiz.CoreTraceDockerNormalizacao = api;
})(typeof window !== 'undefined' ? window : globalThis);
