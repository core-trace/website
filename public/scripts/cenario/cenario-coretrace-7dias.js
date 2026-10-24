/*
 * CoreTrace — receita determinística de métricas para demonstração
 * Janela: 12/10/2026 20:30 até 19/10/2026 20:30 (horário de Brasília)
 * Banco é a fonte de perfis, servidores, MACs, limites e autorização.
 * Este arquivo gera apenas valores técnicos simulados vinculados ao MAC.
 * Não altera os dados cadastrais e não deve sobrescrever limites recebidos da API.
 * Compatível com <script> e Node para testes locais.
 */
(function (root) {
  'use strict';
  const DATA_FINAL = '2026-10-19T20:30:00-03:00';
  const FIM = Date.parse(DATA_FINAL);
  const INICIO = FIM - 7 * 24 * 60 * 60000;
  const DIA_MS = 86400000;
  const MIN_MS = 60000;
  const PERIODO_MINUTOS = Object.freeze({ '30m':30, '1h':60, '6h':360, '12h':720, '24h':1440, '7d':10080 });
  const inst = s => Date.parse(s + ':00-03:00');
  const toLocal = ms => new Date(ms - 3 * 3600000).toISOString().slice(0,16).replace('T',' ');
  const round = (n,d=2) => Number(n.toFixed(d));
  const gaussian = (x,c,w) => Math.exp(-0.5 * ((x-c)/w)**2);
  const servidores = [
    ['cart-api-07','AA:BB:CC:DD:EE:07','Carrinho',42,53,58,8,16],
    ['cart-api-12','AA:BB:CC:DD:EE:12','Carrinho',37,57.71,53,8,16],
    ['cart-api-02','AA:BB:CC:DD:EE:02','Carrinho',47.73,59.56,54,8,16],
    ['cart-api-09','AA:BB:CC:DD:EE:09','Carrinho',36.61,52.97,52,8,16],
    ['pay-db-02','AA:BB:CC:DD:EF:02','Financeiro',56.95,59,71,8,32],
    ['pay-api-04','AA:BB:CC:DD:EF:04','Financeiro',41,53,66,8,16],
    ['pay-api-06','AA:BB:CC:DD:EF:06','Financeiro',49.52,57.01,64,8,16],
    ['catalog-api-03','AA:BB:CC:DD:F0:03','Catálogo',44.44,54.87,63,8,16],
    ['catalog-api-05','AA:BB:CC:DD:F0:05','Catálogo',42.09,61.79,77,8,64],
    ['catalog-api-08','AA:BB:CC:DD:F0:08','Catálogo',35.43,49.91,49,8,16]
  ].map(([nome,mac,perfil,cpu,ram,disco,nucleos,ramGb]) => ({nome,mac,perfil,base:{cpu,ram,disco},nucleos,ramGb,
    monitorarDocker: perfil !== 'Catálogo',statusCadastral:'ATIVO'}));
  const porMac = Object.fromEntries(servidores.map(s=>[s.mac,s]));
  const porNome = Object.fromEntries(servidores.map(s=>[s.nome,s]));

  // LIMITES DE REFERÊNCIA: espelho dos INSERTs da branch dev; em produção,
  // passar os limites vindos de componentes_perfil pela API.
  const limitesReferencia = Object.freeze({
    Carrinho:{cpu:[70,90],ram:[75,90],disco:[80,95],errosRede:[5,15],descartesRede:[10,30]},
    Financeiro:{cpu:[75,92],ram:[75,90],disco:[80,95],errosRede:[5,15],descartesRede:[10,30]},
    'Catálogo':{cpu:[75,90],ram:[75,90],disco:[80,95],errosRede:[5,15],descartesRede:[10,30]}
  });

  const eventos = [];
  function episodio(servidor, componente, pontos, id) {
    if (!porNome[servidor]) throw Error('Servidor desconhecido: '+servidor);
    eventos.push({id,mac:porNome[servidor].mac,servidor,componente,pontos:pontos.map(([t,v])=>[inst(t),v])});
  }
  // TER 13/10 — pressão moderada no almoço, sem incidentes críticos.
  episodio('cart-api-02','ram', [['2026-10-13T11:50',52],['2026-10-13T12:10',77],['2026-10-13T12:40',80],['2026-10-13T13:10',77],['2026-10-13T13:25',54]], 'TER_ALMOCO_CARRINHO');
  episodio('catalog-api-03','cpu', [['2026-10-13T11:55',45],['2026-10-13T12:15',78],['2026-10-13T12:45',82],['2026-10-13T13:15',77],['2026-10-13T13:30',46]], 'TER_ALMOCO_CATALOGO');
  // QUA 14/10 — jantar, pressão que não alcança nível crítico.
  episodio('cart-api-09','cpu', [['2026-10-14T18:20',46],['2026-10-14T18:45',74],['2026-10-14T19:30',80],['2026-10-14T20:05',72],['2026-10-14T20:20',45]], 'QUA_JANTAR_CARRINHO');
  episodio('pay-api-06','cpu', [['2026-10-14T18:35',46],['2026-10-14T19:05',78],['2026-10-14T19:45',81],['2026-10-14T20:10',77],['2026-10-14T20:25',45]], 'QUA_JANTAR_FINANCEIRO');
  // QUI 15/10 — aumento no uso de RAM do banco de pagamentos durante o almoço.
  episodio('pay-db-02','ram', [['2026-10-15T11:45',64],['2026-10-15T12:10',77],['2026-10-15T12:55',84],['2026-10-15T13:20',77],['2026-10-15T13:40',63]], 'QUI_ALMOCO_BANCO');
  episodio('catalog-api-03','cpu', [['2026-10-15T11:50',46],['2026-10-15T12:15',78],['2026-10-15T12:50',82],['2026-10-15T13:15',77],['2026-10-15T13:35',44]], 'QUI_ALMOCO_CATALOGO');
  // SEX 16/10 — campanha comercial, incidente CRÍTICO anterior já encerrado.
  episodio('pay-api-06','cpu', [['2026-10-16T18:40',46],['2026-10-16T19:00',79],['2026-10-16T19:25',93],['2026-10-16T19:45',96],['2026-10-16T20:10',94],['2026-10-16T20:35',78],['2026-10-16T21:00',46]], 'SEX_CAMPANHA_FINANCEIRO');
  episodio('cart-api-02','cpu', [['2026-10-16T18:45',48],['2026-10-16T19:10',74],['2026-10-16T19:50',84],['2026-10-16T20:30',73],['2026-10-16T20:55',47]], 'SEX_CAMPANHA_CARRINHO');
  // SAB 17/10 — o Catálogo enfrenta erros de rede, não problema de CPU.
  episodio('catalog-api-03','errosRede', [['2026-10-17T18:45',0.3],['2026-10-17T19:15',6.5],['2026-10-17T20:00',9],['2026-10-17T20:40',6],['2026-10-17T21:10',0.3]], 'SAB_REDE_CATALOGO');
  episodio('catalog-api-03','descartesRede', [['2026-10-17T18:45',1],['2026-10-17T19:20',11],['2026-10-17T20:00',16],['2026-10-17T20:40',11],['2026-10-17T21:10',1]], 'SAB_DESCARTES_CATALOGO');
  episodio('cart-api-12','cpu', [['2026-10-17T18:45',49],['2026-10-17T19:15',75],['2026-10-17T20:00',80],['2026-10-17T20:45',74],['2026-10-17T21:15',48]], 'SAB_JANTAR_CARRINHO');
  // DOM 18/10 — pico recorrente, ambos apenas em atenção.
  episodio('cart-api-07','cpu', [['2026-10-18T18:40',52],['2026-10-18T19:00',73],['2026-10-18T19:50',86],['2026-10-18T20:50',78],['2026-10-18T21:25',65]], 'DOM_JANTAR_CARRINHO');
  episodio('pay-db-02','ram', [['2026-10-18T18:40',63],['2026-10-18T19:05',77],['2026-10-18T20:00',82],['2026-10-18T21:00',78],['2026-10-18T21:25',64]], 'DOM_JANTAR_BANCO');
  // SEG 19/10 — almoço, recupera completamente antes do jantar.
  episodio('catalog-api-03','cpu', [['2026-10-19T11:50',46],['2026-10-19T12:10',78],['2026-10-19T12:40',83],['2026-10-19T13:10',78],['2026-10-19T13:40',47]], 'SEG_ALMOCO_CATALOGO');
  episodio('cart-api-02','ram', [['2026-10-19T11:50',53],['2026-10-19T12:15',77],['2026-10-19T12:50',82],['2026-10-19T13:15',77],['2026-10-19T13:40',53]], 'SEG_ALMOCO_CARRINHO');
  // SEG 19/10 — jantar em andamento às 20:30, com DOIS servidores críticos.
  // Âncoras no minuto anterior mantêm o valor exatamente no limite (comparação >).
  // A interpolação só o ultrapassa na coleta seguinte; o estado continua derivado da métrica.
  episodio('cart-api-12','cpu', [['2026-10-19T18:00',49],['2026-10-19T18:25',66],['2026-10-19T18:29',70],['2026-10-19T18:30',72],['2026-10-19T19:00',75],['2026-10-19T20:30',78]], 'SEG_JANTAR_CART12_CPU');
  episodio('pay-db-02','ram', [['2026-10-19T18:00',60],['2026-10-19T18:40',72],['2026-10-19T18:44',75],['2026-10-19T18:45',76],['2026-10-19T20:30',79]], 'SEG_JANTAR_PAYDB_RAM');
  episodio('cart-api-07','cpu', [['2026-10-19T18:00',49],['2026-10-19T18:50',67],['2026-10-19T18:59',70],['2026-10-19T19:00',73],['2026-10-19T19:30',82],['2026-10-19T20:00',89],['2026-10-19T20:04',90],['2026-10-19T20:05',91],['2026-10-19T20:30',94]], 'SEG_JANTAR_CART07_CPU');
  episodio('cart-api-07','ram', [['2026-10-19T18:00',54],['2026-10-19T19:20',73],['2026-10-19T19:24',75],['2026-10-19T19:25',76],['2026-10-19T20:30',81]], 'SEG_JANTAR_CART07_RAM');
  episodio('pay-api-04','cpu', [['2026-10-19T18:00',47],['2026-10-19T19:00',69],['2026-10-19T19:09',75],['2026-10-19T19:10',78],['2026-10-19T19:40',88],['2026-10-19T19:49',92],['2026-10-19T19:50',93],['2026-10-19T20:30',95]], 'SEG_JANTAR_PAY04_CPU');
  episodio('pay-api-04','ram', [['2026-10-19T18:00',55],['2026-10-19T19:25',73],['2026-10-19T19:29',75],['2026-10-19T19:30',76],['2026-10-19T20:30',83]], 'SEG_JANTAR_PAY04_RAM');

  const overlays = {};
  for (const e of eventos) ((overlays[e.mac] ??= {})[e.componente] ??= []).push(e);
  function interpolar(pontos, ms) {
    if (ms < pontos[0][0] || ms > pontos[pontos.length-1][0]) return null;
    for (let i=1;i<pontos.length;i++) if(ms <= pontos[i][0]) {
      const [t0,v0]=pontos[i-1], [t1,v1]=pontos[i];
      const f=(ms-t0)/(t1-t0); return v0+(v1-v0)*f;
    }
    return null;
  }
  function valorOverlay(mac,metrica,ms,normal) {
    let out=normal;
    for (const e of overlays[mac]?.[metrica] ?? []) {
      const valor=interpolar(e.pontos,ms);
      if (valor!==null) out=Math.max(out,valor);
    }
    return out;
  }
  function referenciaTemporal(valor) {
    const ms = valor instanceof Date?valor.getTime():typeof valor==='number'?valor:Date.parse(valor);
    if (!Number.isFinite(ms) || ms < INICIO || ms > FIM || ms % MIN_MS !== 0) throw Error('Data fora da simulação ou não alinhada ao minuto');
    return ms;
  }
  // Dado de CONTEXTO comercial, não coletado pelo psutil nem incluído nos alertas.
  // Serve somente para narrar a relação entre pico de pedidos e infraestrutura.
  function pedidosPorMinuto(instante=DATA_FINAL) {
    const ms=referenciaTemporal(instante);
    const dt=new Date(ms-3*3600000),h=dt.getUTCHours()+dt.getUTCMinutes()/60;
    const dia=dt.getUTCDate(),mes=dt.getUTCMonth()+1;
    const almoço=1000*gaussian(h,12.5,1.0);
    const jantar=1500*gaussian(h,20,1.3);
    const campanha=mes===10&&dia===19 ? 1518*gaussian(h,20.3,1) : 0;
    const sexta=mes===10&&dia===16 ? 500*gaussian(h,20,1.3) : 0;
    const sabado=mes===10&&dia===17 ? 300*gaussian(h,20,1.3) : 0;
    return Math.round(320+almoço+jantar+campanha+sexta+sabado);
  }
  function coletar(mac, instante=DATA_FINAL) {
    const s=porMac[mac];
    if (!s) return null; // a API pode devolver novos MACs; não inventar coletas.
    const ms=referenciaTemporal(instante);
    const local = new Date(ms-3*3600000);
    const hh=local.getUTCHours()+local.getUTCMinutes()/60;
    const dias=(FIM-ms)/DIA_MS;
    // Flutuação previsível e modesta, sem novos alertas por acidente.
    const almoço=gaussian(hh,12.65,.95);
    const jantar=gaussian(hh,20.0,1.45);
    const fase=servidores.indexOf(s)*1.37;
    const oscilacao=1.1*Math.sin(ms/1000000+fase);
    let cpu=s.base.cpu+7*almoço+9*jantar+oscilacao;
    let ram=s.base.ram+3*almoço+5*jantar+0.7*Math.sin(ms/1500000+fase);
    let disco=s.nome==='catalog-api-05' ? 77-1.5*dias : s.base.disco-0.04*dias;
    let errosRede=0.15+0.1*Math.abs(Math.sin(ms/1500000+fase));
    let descartesRede=0.5+0.2*Math.abs(Math.cos(ms/1800000+fase));
    cpu=round(valorOverlay(mac,'cpu',ms,cpu));
    ram=round(valorOverlay(mac,'ram',ms,ram));
    disco=round(valorOverlay(mac,'disco',ms,disco));
    errosRede=round(valorOverlay(mac,'errosRede',ms,errosRede));
    descartesRede=round(valorOverlay(mac,'descartesRede',ms,descartesRede));
    // Após a elevação de RAM, swap e disponibilidade acompanham os mesmos dados.
    const swapPercent=round(Math.max(4,10+Math.max(0,ram-68)*0.7));
    const ramUsadaGb=round(s.ramGb*ram/100,3);
    return {
      timestamp:new Date(ms).toISOString(),horarioBrasilia:toLocal(ms),mac,
      cpu_percent:cpu,ram_percent:ram,disk_percent:disco,
      net_errors:errosRede,net_drops:descartesRede,
      swap_percent:swapPercent,ram_total:s.ramGb,
      ram_used:ramUsadaGb,ram_available:round(s.ramGb-ramUsadaGb,3),
      disk_total:s.nome==='catalog-api-05'?500:200,
      disk_used:round((s.nome==='catalog-api-05'?500:200)*disco/100,3),
      disk_free:round((s.nome==='catalog-api-05'?500:200)*(100-disco)/100,3),
      cpu_count_logical:s.nucleos,
      load_avg_1:round(cpu/100*s.nucleos*.93),
      cpu_iowait:round(1.1+0.02*cpu),
      uptimeSegundos:Math.round((9*24+4)*3600-(FIM-ms)/1000)
    };
  }
  const niveis = ['normal','atencao','critico'];
  function severidadeComponente(valor,[atencao,critico],operador='>') {
    const compara=(v,lim) => operador==='>='?v>=lim:operador==='<'?v<lim:operador==='<='?v<=lim:v>lim;
    if(critico!==null && critico!==undefined && compara(valor,critico)) return 'critico';
    if(atencao!==null && atencao!==undefined && compara(valor,atencao)) return 'atencao';
    return 'normal';
  }
  function avaliar(mac,coleta,limites=limitesReferencia[porMac[mac]?.perfil]) {
    if(!coleta||!limites) return null;
    const valores={cpu:coleta.cpu_percent,ram:coleta.ram_percent,disco:coleta.disk_percent,errosRede:coleta.net_errors,descartesRede:coleta.net_drops};
    const porComponente={};
    for(const [c,v] of Object.entries(valores)) {
      const conf=limites[c];
      if(!conf) continue;
      const pares=Array.isArray(conf)?conf:[conf.atencao,conf.critico];
      porComponente[c]=severidadeComponente(v,pares,Array.isArray(conf)?'>':conf.operador??'>');
    }
    const ordenadas=Object.values(porComponente).map(v=>niveis.indexOf(v));
    return {servidor:ordenadas.length?niveis[Math.max(...ordenadas)]:'sem_dados',porComponente};
  }
  function coletasAtuais(macs=servidores.map(s=>s.mac),momento=DATA_FINAL) {
    return macs.map(mac=>({mac,coleta:coletar(mac,momento)})).filter(x=>x.coleta);
  }
  function resumoAtual(macs=servidores.map(s=>s.mac),momento=DATA_FINAL,limitesPorMac={}) {
    const resumo={normais:0,atencao:0,criticos:0,alertasAtivos:0,alertasCriticos:0,alertasAtencao:0,previsaoArmazenamento:null,servidores:[]};
    for(const {mac,coleta} of coletasAtuais(macs,momento)) {
      const e=avaliar(mac,coleta,limitesPorMac[mac]??limitesReferencia[porMac[mac].perfil]);
      if(e.servidor==='normal')resumo.normais++;
      else if(e.servidor==='atencao')resumo.atencao++;
      else if(e.servidor==='critico')resumo.criticos++;
      for(const val of Object.values(e.porComponente)) {
        if(val==='atencao'){resumo.alertasAtivos++;resumo.alertasAtencao++;}
        if(val==='critico'){resumo.alertasAtivos++;resumo.alertasCriticos++;}
      }
      resumo.servidores.push({nome:porMac[mac].nome,perfil:porMac[mac].perfil,mac,situacao:e.servidor,metricas:coleta,alertas:e.porComponente});
    }
    // Campo indicativo; cálculo definitivo da previsão na implementação
    // deve usar histórico de disco e limite crítico cadastrado.
    const cat=resumo.servidores.find(s=>s.nome==='catalog-api-05');
    if(cat) {
      const lim=(limitesPorMac[cat.mac]??limitesReferencia['Catálogo']).disco;
      const crit=Array.isArray(lim)?lim[1]:lim?.critico;
      if(Number.isFinite(crit)) {
        const prazo=(crit-cat.metricas.disk_percent)/1.5;
        if(prazo>0)resumo.previsaoArmazenamento={servidor:cat.nome,volume:'/dados',dias:round(prazo,1),limiteCritico:crit,taxaPontosPercentuaisDia:1.5};
      }
    }
    return resumo;
  }
  function historicoServidor(mac,periodo='7d',passoMin=1) {
    if(!PERIODO_MINUTOS[periodo])throw Error('Período inválido');
    const dados=[];
    for(let ms=FIM-PERIODO_MINUTOS[periodo]*MIN_MS;ms<=FIM;ms+=passoMin*MIN_MS) dados.push(coletar(mac,ms));
    return dados;
  }
  function evolucao(periodo='6h',macs=servidores.map(s=>s.mac),passoMin=1,limitesPorMac={}) {
    if(!PERIODO_MINUTOS[periodo])throw Error('Período inválido');
    const saida=[];
    for(let ms=FIM-PERIODO_MINUTOS[periodo]*MIN_MS;ms<=FIM;ms+=passoMin*MIN_MS){
      let atencao=0,critico=0;
      for(const mac of macs){
        const coleta=coletar(mac,ms); if(!coleta)continue;
        const sev=avaliar(mac,coleta,limitesPorMac[mac]??limitesReferencia[porMac[mac].perfil]).servidor;
        if(sev==='atencao')atencao++;
        if(sev==='critico')critico++;
      }
      saida.push({timestamp:new Date(ms).toISOString(),horarioBrasilia:toLocal(ms),atencao,critico});
    }
    return saida;
  }
  function barrasPorRecurso(periodo='6h',macs=servidores.map(s=>s.mac),modo='historico',limitesPorMac={}) {
    if(!PERIODO_MINUTOS[periodo])throw Error('Período inválido');
    const acumulado={CPU:{atencao:0,critico:0},RAM:{atencao:0,critico:0},Disco:{atencao:0,critico:0},Rede:{atencao:0,critico:0}};
    const traducao={cpu:'CPU',ram:'RAM',disco:'Disco',errosRede:'Rede',descartesRede:'Rede'};
    for(const mac of macs){
      if(!porMac[mac])continue;
      const maxima={CPU:0,RAM:0,Disco:0,Rede:0};
      const inicio=modo==='atual'?FIM:FIM-PERIODO_MINUTOS[periodo]*MIN_MS;
      for(let ms=inicio;ms<=FIM;ms+=MIN_MS) {
        const estados=avaliar(mac,coletar(mac,ms),limitesPorMac[mac]??limitesReferencia[porMac[mac].perfil]).porComponente;
        for(const [comp,sev] of Object.entries(estados))maxima[traducao[comp]]=Math.max(maxima[traducao[comp]],niveis.indexOf(sev));
      }
      for(const [recurso,n] of Object.entries(maxima)){
        if(n===1)acumulado[recurso].atencao++;
        if(n===2)acumulado[recurso].critico++;
      }
    }
    return acumulado;
  }
  function incidentes(periodo='7d',macs=servidores.map(s=>s.mac),limitesPorMac={}) {
    if(!PERIODO_MINUTOS[periodo])throw Error('Período inválido');
    const ativos=new Map(),saida=[];
    const de=FIM-PERIODO_MINUTOS[periodo]*MIN_MS;
    for(let ms=INICIO;ms<=FIM;ms+=MIN_MS){
      for(const mac of macs){
        if(!porMac[mac])continue;
        const coleta=coletar(mac,ms);
        const evals=avaliar(mac,coleta,limitesPorMac[mac]??limitesReferencia[porMac[mac].perfil]);
        for(const [comp,estado] of Object.entries(evals.porComponente)){
          const k=mac+'|'+comp,inc=ativos.get(k);
          if(estado==='normal'){
            if(inc){inc.fim=new Date(ms).toISOString();saida.push(inc);ativos.delete(k);}
          } else if(!inc){
            ativos.set(k,{mac,servidor:porMac[mac].nome,perfil:porMac[mac].perfil,componente:comp,
              inicio:new Date(ms).toISOString(),fim:null,severidadeMaxima:estado,
              valorPico:coleta[({cpu:'cpu_percent',ram:'ram_percent',disco:'disk_percent',errosRede:'net_errors',descartesRede:'net_drops'})[comp]]});
          } else {
            if(niveis.indexOf(estado)>niveis.indexOf(inc.severidadeMaxima))inc.severidadeMaxima=estado;
            inc.valorPico=Math.max(inc.valorPico,coleta[({cpu:'cpu_percent',ram:'ram_percent',disco:'disk_percent',errosRede:'net_errors',descartesRede:'net_drops'})[comp]]);
          }
        }
      }
    }
    for(const inc of ativos.values())saida.push(inc);
    return saida.filter(i=>!i.fim || Date.parse(i.fim)>de).sort((a,b)=>a.inicio.localeCompare(b.inicio));
  }
  const api={DATA_FINAL,INICIO:new Date(INICIO).toISOString(),PERIODO_MINUTOS,servidores,limitesReferencia,eventos,
    coletar,pedidosPorMinuto,avaliar,historicoServidor,evolucao,barrasPorRecurso,resumoAtual,incidentes};
  root.CoreTraceCenario7d=api;
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
