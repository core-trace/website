/*
 * CoreTrace — extensão do cenário de sete dias para a DASHBOARD DE DETALHES.
 * Mesma fonte única de coletas, ligada por MAC aos 10 servidores.
 * Compatível com Node (require) e navegador (<script> depois do gerador base).
 * Dados inteiramente fictícios para demonstração, não são leituras psutil/Docker.
 */
(function (root) {
  'use strict';
  const base = typeof module !== 'undefined' && module.exports
    ? require('./cenario-coretrace-7dias.js') : root.CoreTraceCenario7d;
  if (!base) throw new Error('Carregue cenario-coretrace-7dias.js primeiro');

  const round = (n, casas=2) => Number(n.toFixed(casas));
  const MB = 1000000;
  const MIN = 60000;
  const fim = Date.parse(base.DATA_FINAL);
  const perfilPorMac = Object.fromEntries(base.servidores.map((s, idx) => [s.mac, {...s, indice:idx}]));
  const ordem = {normal:0,atencao:1,critico:2};
  const nomesRecurso={cpu:'CPU',ram:'RAM',disco:'Disco',errosRede:'Erros de rede',descartesRede:'Descartes de rede'};
  const recursosUnidade={cpu:'%',ram:'%',disco:'%',errosRede:'eventos/s',descartesRede:'pacotes/s'};

  function obter(mac) {
    const servidor=perfilPorMac[mac];
    if (!servidor) throw new Error(`MAC não cadastrado na demo: ${mac}`);
    return servidor;
  }
  function checarPeriodo(periodo){
    if (!Object.hasOwn(base.PERIODO_MINUTOS,periodo)) throw new Error('Filtro temporal inválido: '+periodo);
  }
  function timestamp(v){
    const ms= v instanceof Date ? v.getTime(): typeof v==='number'? v:Date.parse(v);
    if(!Number.isFinite(ms)||ms>fim||ms<fim-7*86400000||ms%MIN!==0) throw new Error('Instante fora da demonstração de 7 dias');
    return ms;
  }
  function coletarBase(mac,ms){return base.coletar(mac,new Date(ms).toISOString());}
  function limitesDoServidor(mac,limitesPorMac={}) {
    return limitesPorMac[mac] ?? base.limitesReferencia[obter(mac).perfil];
  }
  function instanteBrasilia(ms){
    return new Date(ms-3*3600000).toISOString().slice(0,16).replace('T',' ');
  }

  // Distribuição por oito CPUs, com offsets de soma zero: média == CPU total da coleta.
  // A amplitude encolhe perto de 0% e 100%, evitando ultrapassar os limites físicos.
  function cpuPorNucleo(mac,ms,cpu){
    const servidor=obter(mac),n=servidor.nucleos;
    const amplitude=Math.max(0,Math.min(7,cpu/1.1,(100-cpu)/1.1));
    const centros=Array.from({length:n},(_,i)=> (i-(n-1)/2)/((n-1)/2||1));
    return centros.map((centro,i)=>({cpu:i,percentual:round(cpu+centro*amplitude,4)}));
  }
  function media(a){return a.length?a.reduce((s,v)=>s+v,0)/a.length:0;}
  function mediaUltimos(mac,ms,quantidade,campo){
    const valores=[];
    for(let i=0;i<quantidade;i++){
      const t=ms-i*MIN;
      if(t<fim-7*86400000)break;
      valores.push(coletarBase(mac,t)[campo]);
    }
    return media(valores);
  }
  function hardware(mac){
    const s=obter(mac);
    return {
      cpuLogicas:s.nucleos,
      ramTotalGb:s.ramGb,
      swapTotalGb: s.ramGb>=32?8:4,
      volumeDadosGb:s.nome==='catalog-api-05'?500:200,
      volumeSistemaGb:s.nome==='pay-db-02'?160:120,
      dispositivo:s.nome==='pay-db-02'?'nvme1n1':'nvme0n1',
      rede:'eth0',
      sistemaOperacional:'linux',
      monitorarDocker:s.monitorarDocker
    };
  }
  function armazem(mac,ms,c){
    const s=obter(mac),hw=hardware(mac);
    const volumeDados={
      volume:'/dados', totalGb:hw.volumeDadosGb,
      usadoGb:round(hw.volumeDadosGb*c.disk_percent/100,4),
      disponivelGb:round(hw.volumeDadosGb*(100-c.disk_percent)/100,4),
      ocupacaoPercent:c.disk_percent,
      inodesUtilizadosPercent:round(24+s.indice*0.7+Math.max(0,c.disk_percent-70)*0.09)
    };
    const raizPercent=round(37+s.indice*1.75+1.2*Math.sin(ms/18000000+s.indice));
    const volumeRaiz={
      volume:'/',totalGb:hw.volumeSistemaGb,
      usadoGb:round(hw.volumeSistemaGb*raizPercent/100,4),
      disponivelGb:round(hw.volumeSistemaGb*(100-raizPercent)/100,4),
      ocupacaoPercent:raizPercent,
      inodesUtilizadosPercent:round(16+s.indice*.95)
    };
    return [volumeDados,volumeRaiz];
  }
  function armazenamentoPrevisao(mac,limitesPorMac={}) {
    const s=obter(mac),l=limitesDoServidor(mac,limitesPorMac);
    const limDisco=Array.isArray(l.disco)?l.disco[1]:l.disco?.critico;
    const amostras=base.historicoServidor(mac,'7d',60);
    const crescente=(amostras.at(-1).disk_percent-amostras[0].disk_percent)/7;
    const atual=base.coletar(mac);
    // Crescimento lento ou estatisticamente pouco significativo não rende previsão.
    if(crescente<0.25||!Number.isFinite(limDisco)||atual.disk_percent>=limDisco) return null;
    return {
      volume:'/dados',
      diasRestantes:round((limDisco-atual.disk_percent)/crescente,1),
      limiteCritico:limDisco,
      tendenciaPontosPercentuaisDia:round(crescente,3),
      espacoLivreGb:round(hardware(mac).volumeDadosGb*(100-atual.disk_percent)/100,2)
    };
  }
  // Compartilha as taxas com o adaptador sem recalcular toda a telemetria técnica.
  function rede(mac,c) {
    const s=obter(mac),intensidade=c.cpu_percent/100;
    const rxErros=round(c.net_errors*.75,3),rxDescartes=round(c.net_drops*.65,3);
    return {
      interface:hardware(mac).rede,
      recebimentoMBs:round(.35+intensidade*(s.perfil==='Carrinho'?9:s.perfil==='Financeiro'?7:5),3),
      envioMBs:round(.21+intensidade*(s.perfil==='Carrinho'?3.4:s.perfil==='Financeiro'?2.4:3),3),
      errosRecebimentoPorSegundo:rxErros,
      errosEnvioPorSegundo:round(c.net_errors-rxErros,3),
      descartesRecebimentoPorSegundo:rxDescartes,
      descartesEnvioPorSegundo:round(c.net_drops-rxDescartes,3)
    };
  }
  function telemetria(mac,instante=base.DATA_FINAL) {
    const s=obter(mac),ms=timestamp(instante),c=coletarBase(mac,ms),hw=hardware(mac);
    const intensidade=c.cpu_percent/100;
    const ramGb=c.ram_used;
    const isDB=s.nome.includes('-db-');
    const ioBase=1+intensidade*(isDB?19:14);
    const ioLeitura=round(ioBase+1.6*Math.abs(Math.sin(ms/1500000+s.indice)));
    const ioEscrita=round((isDB?1.08:.48)*ioBase+0.55*Math.abs(Math.cos(ms/1200000+s.indice)));
    const leiturasPorSegundo=Math.round(ioLeitura*(isDB?26:18));
    const escritasPorSegundo=Math.round(ioEscrita*(isDB?34:16));
    const latLeitura=round(1.05+2.0*intensidade+(isDB?1.8:0),2);
    const latEscrita=round(1.65+2.5*intensidade+(isDB?2.0:0),2);
    const fila=round(.13+intensidade*(isDB?2.3:.82),3);
    const usoSwapGb=round(hw.swapTotalGb*c.swap_percent/100,4);
    const memoria={
      ramTotalGb:hw.ramTotalGb,ramUsadaGb:ramGb,
      ramDisponivelGb:c.ram_available,ramPercent:c.ram_percent,
      ramDisponivelPercent:round(100-c.ram_percent,4),
      swapTotalGb:hw.swapTotalGb,swapUsadaGb:usoSwapGb,
      swapDisponivelGb:round(hw.swapTotalGb-usoSwapGb,4),
      swapPercent:c.swap_percent,
      swapEntradaBytesPorSegundo:round(Math.max(0,c.ram_percent-75)*8000),
      swapSaidaBytesPorSegundo:round(Math.max(0,c.ram_percent-80)*4500),
      eventosOOM:0
    };
    return {
      ...c,
      nome:s.nome,perfil:s.perfil,hardware:hw,
      cpu:{
        percentual:c.cpu_percent,
        porNucleo:cpuPorNucleo(mac,ms,c.cpu_percent),
        carga1Min:c.load_avg_1,
        carga5Min:round(mediaUltimos(mac,ms,5,'load_avg_1'),3),
        carga15Min:round(mediaUltimos(mac,ms,15,'load_avg_1'),3),
        esperaIOPercent:c.cpu_iowait
      },
      memoria,
      volumes:armazem(mac,ms,c),
      discoIO:{
        dispositivo:hw.dispositivo,
        leituraMBs:ioLeitura,escritaMBs:ioEscrita,
        leituraBytesSegundo:Math.round(ioLeitura*MB),escritaBytesSegundo:Math.round(ioEscrita*MB),
        leituraIOPS:leiturasPorSegundo,escritaIOPS:escritasPorSegundo,
        tempoLeituraMs:latLeitura,tempoEscritaMs:latEscrita,
        filaMediaOperacoes:fila
      },
      rede:rede(mac,c)
    };
  }

  // Processo de host pode exceder 100%: na semântica psutil, 100%=uma CPU lógica.
  // Na demo, o conjunto de processos visíveis ocupa somente parte da CPU do host.
  function processos(mac,amostra) {
    const s=obter(mac),idx=s.indice,hostTotal=amostra.cpu_percent*s.nucleos;
    const isDB=s.nome.includes('-db-');
    const cat=s.perfil==='Catálogo';
    const tipos=isDB?['mysqld','mysql-binlog','coretrace-agent']:
      cat?[`node · ${s.nome}`,'nginx','coretrace-agent']:
      [`node · ${s.nome}`,s.perfil==='Financeiro'?'pay-worker':'cart-worker','coretrace-agent'];
    const cpuFatores=isDB?[.34,.11,.005]:cat?[.38,.14,.005]:[.32,.12,.005];
    const ramFatores=isDB?[.29,.13,.005]:cat?[.32,.12,.005]:[.29,.12,.005];
    return tipos.map((nome,i)=>({
      pid:1400+idx*200+[5,17,63][i],nome,
      estado:i===2?'Em espera':'Executando',
      cpuPercent:round(hostTotal*cpuFatores[i],2),
      ramGb:round(amostra.ram_used*ramFatores[i],3),
      cpuConvencao:'100% = uso de uma CPU lógica'
    }));
  }
  const containerTemplates={
    Carrinho:['app','worker','agent'],
    Financeiro:['app','worker','agent']
  };
  function docker(mac,amostra){
    const s=obter(mac);
    if(!s.monitorarDocker) return {monitoramentoHabilitado:false,estado:'nao-monitorado',total:0,executando:0,parados:0,containers:[]};
    const c=containerTemplates[s.perfil]??[];
    const fatoresCpu=[.38,.15,.006],fatoresRam=[.34,.16,.008],fatoresLeitura=[.43,.18,.015],fatoresEscrita=[.41,.17,.01];
    const isDB=s.nome.includes('-db-');
    const itens=c.map((tipo,i)=>({
      id:`demo-${s.indice+1}-${i+1}`,
      nome:`${s.nome}-${isDB&&i===0?'mysql':tipo}`,
      estado:'Executando',
      cpuPercent:round(amostra.cpu_percent*s.nucleos*fatoresCpu[i],2),
      ramGb:round(amostra.ram_used*fatoresRam[i],3),
      leituraBytesSegundo:Math.round(amostra.discoIO.leituraBytesSegundo*fatoresLeitura[i]),
      escritaBytesSegundo:Math.round(amostra.discoIO.escritaBytesSegundo*fatoresEscrita[i]),
      cpuConvencao:'100% = uso de uma CPU lógica'
    }));
    return {monitoramentoHabilitado:true,estado:'com-dados-mockados',total:itens.length,
      executando:itens.length,parados:0,containers:itens};
  }
  function memoriaNoMomento(mac){return telemetria(mac).memoria;}
  function primeiraJanela(periodo){return fim-base.PERIODO_MINUTOS[periodo]*MIN;}
  function rawPeriodo(mac,periodo){
    const saida=[];
    for(let ms=primeiraJanela(periodo);ms<=fim;ms+=MIN) saida.push(telemetria(mac,ms));
    return saida;
  }
  // Redução para a renderização: não usar média de buckets que poderia esconder
  // um pico. Inclui mínimos, máximos e extremos de rede de cada bloco temporal.
  function resumirSerieSemPerderPicos(amostras,maxPontos=340){
    if (amostras.length<=maxPontos) return amostras;
    const passo=Math.ceil(amostras.length/(maxPontos/12));
    const selecionados=new Set([0,amostras.length-1]);
    const metricas=['cpu_percent','ram_percent','disk_percent','net_errors','net_drops'];
    for(let comeco=0;comeco<amostras.length;comeco+=passo){
      const ate=Math.min(amostras.length,comeco+passo);
      selecionados.add(comeco); selecionados.add(ate-1);
      for(const metrica of metricas){
        let imin=comeco,imax=comeco;
        for(let i=comeco+1;i<ate;i++){
          if(amostras[i][metrica]<amostras[imin][metrica])imin=i;
          if(amostras[i][metrica]>amostras[imax][metrica])imax=i;
        }
        selecionados.add(imin);selecionados.add(imax);
      }
    }
    return [...selecionados].sort((a,b)=>a-b).map(i=>amostras[i]);
  }
  function listaHistoricoIncidentes(mac,periodo,limitesPorMac={}){
    const de=primeiraJanela(periodo);
    // O começo verdadeiro de cada incidente deve ser preservado, mesmo que seja
    // anterior à janela do gráfico. São usados os mesmos incidentes da dashboard.
    const todos=base.incidentes('7d',[mac],limitesPorMac);
    const ativos=base.avaliar(mac,base.coletar(mac),limitesDoServidor(mac,limitesPorMac)).porComponente;
    return todos.filter(i=>!i.fim||Date.parse(i.fim)>de).map(i=>{
      const pontos=[];
      let ultima='normal';
      let inicio=Date.parse(i.inicio),ate=i.fim?Date.parse(i.fim):fim;
      for(let t=inicio;t<=ate;t+=MIN){
        const estado=base.avaliar(mac,coletarBase(mac,t),limitesDoServidor(mac,limitesPorMac)).porComponente[i.componente];
        if(estado!==ultima){pontos.push({instante:new Date(t).toISOString(),severidade:estado});ultima=estado;}
      }
      return {...i,recurso:nomesRecurso[i.componente],unidade:recursosUnidade[i.componente],
        severidadeAtual:i.fim?'normal':ativos[i.componente],
        situacao:i.fim?'Encerrado':'Ainda ativo',transicoes:pontos};
    });
  }
  function detalheServidor(mac,periodo='30m',opcoes={}){
    checarPeriodo(periodo);
    const s=obter(mac),amostra=telemetria(mac),limitesPorMac=opcoes.limitesPorMac??{};
    const avaliacao=base.avaliar(mac,amostra,limitesDoServidor(mac,limitesPorMac));
    const todos=rawPeriodo(mac,periodo),renderizados=resumirSerieSemPerderPicos(todos,opcoes.maxPontos??340);
    const alertas=Object.entries(avaliacao.porComponente).filter(([,sev])=>sev!=='normal').map(([recurso,severidade])=>({
      componente:recurso,recurso:nomesRecurso[recurso],severidade,
      valor:amostra[({cpu:'cpu_percent',ram:'ram_percent',disco:'disk_percent',errosRede:'net_errors',descartesRede:'net_drops'})[recurso]],
      unidade:recursosUnidade[recurso],
      limites:limitesDoServidor(mac,limitesPorMac)[recurso]
    }));
    const historicoIncidentes=listaHistoricoIncidentes(mac,periodo,limitesPorMac);
    const cpus=Array.from({length:s.nucleos},(_,i)=>({cpu:i,
      mediaPercent:round(media(todos.map(x=>x.cpu.porNucleo[i].percentual)),2)}));
    return {
      identificacao:{nome:s.nome,mac,perfil:s.perfil,os:'linux',
        cpuLogicas:s.nucleos,uptimeSegundos:amostra.uptimeSegundos,
        timestamp:amostra.timestamp,horarioBrasilia:amostra.horarioBrasilia,
        severidade:avaliacao.servidor,limites:limitesDoServidor(mac,limitesPorMac)},
      periodo,desde:new Date(primeiraJanela(periodo)).toISOString(),ate:base.DATA_FINAL,
      alertasAtivos:alertas,quantidadeAlertasAtivos:alertas.length,
      historicoIncidentes,
      cpu:{percentual:amostra.cpu_percent,
        mediaCPUsLogicas:cpus,
        cpuLogicaSelecionada:0,
        carga1Min:amostra.cpu.carga1Min,carga5Min:amostra.cpu.carga5Min,carga15Min:amostra.cpu.carga15Min,
        esperaIOPercent:amostra.cpu.esperaIOPercent,
        serie:renderizados.map(x=>({timestamp:x.timestamp,percentual:x.cpu_percent,carga5Min:x.cpu.carga5Min,
          carga15Min:x.cpu.carga15Min,esperaIOPercent:x.cpu.esperaIOPercent,porNucleo:x.cpu.porNucleo}))},
      memoria:{...amostra.memoria,
        serieRam:renderizados.map(x=>({timestamp:x.timestamp,percentual:x.ram_percent})),
        serieSwap:renderizados.map(x=>({timestamp:x.timestamp,percentual:x.memoria.swapPercent})),
        mensagemOOM:'Nenhum encerramento por falta de memória no período selecionado'},
      disco:{volumes:amostra.volumes,dispositivo:amostra.discoIO.dispositivo,
        previsaoPorVolume:amostra.volumes.map(v=>({volume:v.volume,
          previsao:v.volume==='/dados'?armazenamentoPrevisao(mac,limitesPorMac):null,
          inodesDiasRestantes:null})),
        leituraMBs:amostra.discoIO.leituraMBs,escritaMBs:amostra.discoIO.escritaMBs,
        leituraIOPS:amostra.discoIO.leituraIOPS,escritaIOPS:amostra.discoIO.escritaIOPS,
        tempoLeituraMs:amostra.discoIO.tempoLeituraMs,
        tempoEscritaMs:amostra.discoIO.tempoEscritaMs,
        filaMediaOperacoes:amostra.discoIO.filaMediaOperacoes,
        serieOcupacao:renderizados.map(x=>({timestamp:x.timestamp,
          volumeDadosPercent:x.disk_percent,
          livreDadosGb:x.volumes[0].disponivelGb,
          capacidadeDadosGb:x.volumes[0].totalGb,
          disponivelSistemaGb:x.volumes[1].disponivelGb})),
        serieAtividade:renderizados.map(x=>({timestamp:x.timestamp,leituraMBs:x.discoIO.leituraMBs,
          escritaMBs:x.discoIO.escritaMBs})),
        serieIO:renderizados.map(x=>({timestamp:x.timestamp,leituraMs:x.discoIO.tempoLeituraMs,
          escritaMs:x.discoIO.tempoEscritaMs,fila:x.discoIO.filaMediaOperacoes}))},
      rede:{...amostra.rede,serieTrafego:renderizados.map(x=>({timestamp:x.timestamp,
          recebimentoMBs:x.rede.recebimentoMBs,envioMBs:x.rede.envioMBs})),
        serieErros:renderizados.map(x=>({timestamp:x.timestamp,
          recebimento:x.rede.errosRecebimentoPorSegundo,envio:x.rede.errosEnvioPorSegundo})),
        serieDescartes:renderizados.map(x=>({timestamp:x.timestamp,
          recebimento:x.rede.descartesRecebimentoPorSegundo,
          envio:x.rede.descartesEnvioPorSegundo}))},
      processos:processos(mac,amostra),
      docker:docker(mac,amostra),
      metadados:{coletasBrutas:todos.length,coletasRenderizadas:renderizados.length,
        deterministico:true,fonte:'Histórico mockado único de sete dias, não é captura real'}
    };
  }
  const api={detalheServidor,telemetria,hardware,processos,docker,cpuPorNucleo,rede,
    armazenamentoPrevisao,listaHistoricoIncidentes,resumirSerieSemPerderPicos};
  root.CoreTraceDetalhes7d=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
