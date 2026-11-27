/* Recortes superiores da investigação, sem alterar fontes ou filtros de logs. */
(function (raiz) {
    'use strict';
    const granularidade = periodo => periodo.fim - periodo.inicio <= 3600000 ? 'cinco'
        : periodo.fim - periodo.inicio <= 86400000 ? 'hora' : 'dia';
    const iso = t => new Date(t).toISOString();
    const dia = t => new Date(t - 10800000).toISOString().slice(0,10);
    function completos(lista, periodo, tipo) {
        return lista.filter(doc => {
            const a = Date.parse(tipo === 'dia' ? doc.data+'T00:00:00-03:00' : doc.intervalo?.inicio);
            const b = tipo === 'dia' ? a+86400000 : Date.parse(doc.intervalo?.fim);
            return a >= periodo.inicio && b <= periodo.fim;
        });
    }
    function cincoMinutos(lista, periodo) {
        const porId = new Map();
        for (const doc of lista) for (const serie of doc.seriesMinuto || []) {
            if (!porId.has(serie.container_id)) porId.set(serie.container_id, []);
            const modelo = doc.containers.find(c => c.container_id === serie.container_id);
            for (const linha of serie.amostras) {
                const t = Date.parse(linha[0]);
                if (t >= periodo.inicio-60000 && t <= periodo.fim) porId.get(serie.container_id).push({t,linha,modelo});
            }
        }
        for (const linhas of porId.values()) linhas.sort((a,b)=>a.t-b.t);
        const logs = [...new Map(lista.flatMap(d=>d.logsIndividuais || []).map(l=>[l.id_captura || JSON.stringify(l),l])).values()];
        const eventos = lista.flatMap(d=>(d.eventos || []).flatMap(e=>e.registros || []));
        const resultado=[];
        const medida = (linhas,col) => {
            const validas=linhas.filter(r=>typeof r.linha[col]==='number' && Number.isFinite(r.linha[col]));
            const valores=validas.map(r=>r.linha[col]);
            const max=valores.length?Math.max(...valores):null;
            return {media:valores.length?valores.reduce((a,b)=>a+b,0)/valores.length:null,
                minimo:valores.length?Math.min(...valores):null,maximo:max,
                maximo_instante:validas.length?iso(validas.find(r=>r.linha[col]===max).t):null,
                ultimo_valor:valores.at(-1)??null,amostras_validas:valores.length,amostras_invalidas:linhas.length-valores.length};
        };
        for(let a=periodo.inicio;a<periodo.fim;a+=300000) {
            const b=Math.min(a+300000,periodo.fim);
            const doc={data:dia(b),intervalo:{inicio:iso(a),fim:iso(b)},containers:[],logs:[],eventos:[],logsIndividuais:[],normalizadoHost:true};
            for(const [id,todas] of porId) {
                const linhas=todas.filter(r=>r.t>a && r.t<=b);
                if(!linhas.length)continue;
                const ultima=linhas.at(-1), c=structuredClone(ultima.modelo), r=ultima.linha;
                doc.mac ||= lista[0]?.mac;
                c.status=r[11];c.started_at=r[10];
                if(c.status!=='exited'){c.finished_at=null;c.exit_code=0;}
                c.primeira_observacao=iso(linhas[0].t);c.ultima_observacao=iso(ultima.t);
                c.cpu.uso={...c.cpu.uso,...medida(linhas,1)};
                c.memoria.uso={...c.memoria.uso,...medida(linhas,2)};
                // O detalhe usa percentual normalizado e metadados; não reutiliza média absoluta externa.
                if(c.memoria.utilizada) {
                    c.memoria.utilizada={...c.memoria.utilizada};
                    for(const k of ['media','minimo','maximo','ultimo_valor'])c.memoria.utilizada[k]=c.memoria.uso[k]===null || !c.apresentacaoHost?.ramBytes ? null : c.memoria.uso[k]/100*c.apresentacaoHost.ramBytes;
                }
                c.pids.atuais={...c.pids.atuais,...medida(linhas,3)};
                for(const [grupo,campo,col] of [['rede','recebidos',4],['rede','enviados',5],['disco','leitura_acumulada',6],['disco','escrita_acumulada',7],['cpu','tempo_throttled',8],['reinicios','total',9]]) {
                    let total=0,validos=0;
                    for(const atual of linhas) {
                        const prev=todas.find(p=>p.t===atual.t-60000);
                        if(prev && (col===9 || (prev.linha[9]===atual.linha[9] && prev.linha[10]===atual.linha[10]))
                            && typeof atual.linha[col]==='number' && typeof prev.linha[col]==='number' && atual.linha[col]>=prev.linha[col]) {
                            total+=atual.linha[col]-prev.linha[col];validos++;
                        }
                    }
                    c[grupo][campo]={...c[grupo][campo],ultimo_valor:r[col],observado_local:{total:validos?total:null,intervalos_validos:validos,intervalos_desconhecidos:(b-a)/60000-validos}};
                }
                doc.containers.push(c);
                const selecionados=logs.filter(l=>l.container_id===id && Date.parse(l.timestamp)>a && Date.parse(l.timestamp)<=b);
                const niveis={};for(const l of selecionados){const nivel=l.nivel.toLowerCase();niveis[nivel] ||= {total_observado:0};niveis[nivel].total_observado++;}
                doc.logs.push({container_id:id,nome:c.nome,total:{total_observado:selecionados.length},niveis});
                doc.logsIndividuais.push(...selecionados);
                const es=eventos.filter(e=>e.container_id===id && Date.parse(e.timestamp)>a && Date.parse(e.timestamp)<=b);
                if(es.length){const acoes={};for(const e of es){acoes[e.tipo] ||= {total_observado:0};acoes[e.tipo].total_observado++;}doc.eventos.push({container_id:id,nome:c.nome,acoes,registros:es});}
            }
            if(doc.containers.length)resultado.push(doc);
        }
        return resultado;
    }
    const api={granularidade,completos,cincoMinutos};
    if(typeof module!=='undefined' && module.exports)module.exports=api;
    else raiz.CoreTraceDockerPeriodos=api;
})(typeof window!=='undefined'?window:globalThis);
