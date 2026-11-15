/* =========================================================
   CoreTrace - Alertas de servidores
   Página de alertas por perfil de servidor (dados reais S3 + MySQL + Jira).
   ========================================================= */

let LIMITE_ATENCAO = 70;
let LIMITE_CRITICO = 85;
let HORA_ATUALIZACAO = '--:--';

const METRICAS_GRAFICO = [
    { id: 'cpu', rotulo: 'CPU' },
    { id: 'ram', rotulo: 'RAM' },
    { id: 'rede', rotulo: 'Rede' }
];

const ROTULO_METRICA = {
    cpu: 'CPU',
    ram: 'RAM',
    rede: 'Rede',
    disco: 'Disco'
};

const TEXTO_SITUACAO = {
    critico: 'Crítico',
    atencao: 'Atenção',
    normal: 'Normal',
    semdados: 'Sem dados'
};

const COR_SITUACAO = {
    critico: '#cc0301',
    atencao: '#e2891b',
    normal: '#2f9e6e',
    semdados: '#8a8f9c'
};

/* =========================================================
   SERVIÇO (API REAL)
   ========================================================= */

async function obterServidoresEmAlerta() {
    const idEmpresa = Number(sessionStorage.ID_EMPRESA);
    const idUsuario = Number(sessionStorage.ID_USUARIO);

    if (!idEmpresa || !idUsuario) {
        throw new Error('Sessão de empresa ou usuário ausente.');
    }

    const params = new URLSearchParams({
        idEmpresa: String(idEmpresa),
        idUsuario: String(idUsuario)
    });

    const resposta = await fetch(`/alertas/servidores?${params.toString()}`);
    if (!resposta.ok) {
        throw new Error(`Erro HTTP ${resposta.status} ao buscar alertas.`);
    }

    const dados = await resposta.json();
    HORA_ATUALIZACAO = dados.horaAtualizacao || HORA_ATUALIZACAO;
    return dados.servidores || [];
}

/* =========================================================
   ESTADO
   ========================================================= */

const estado = {
    perfilAtual: 'todos',
    metricaAtual: 'cpu',
    servidoresSelecionados: [],
    servidores: []
};

/* =========================================================
   FUNÇÕES DE CÁLCULO
   ========================================================= */

function minutosDaHora(hora) {
    if (!hora || !hora.includes(':')) return 0;
    const partes = hora.split(':').map(Number);
    return partes[0] * 60 + partes[1];
}

function minutosEmAlerta(servidor) {
    const ref = minutosDaHora(HORA_ATUALIZACAO);
    const ini = minutosDaHora(servidor.desde);
    return ref >= ini ? ref - ini : (24 * 60 - ini) + ref;
}

function ultimaColetaDe(servidor) {
    return servidor.ultimaColeta || servidor.desde || '--:--';
}

function minutosSemDados(servidor) {
    if (!servidor.ultimaColeta) return 0;
    const ref = minutosDaHora(HORA_ATUALIZACAO);
    const ult = minutosDaHora(servidor.ultimaColeta);
    return ref >= ult ? ref - ult : (24 * 60 - ult) + ref;
}

function formatarDuracao(minutos) {
    if (minutos < 60) {
        return `${minutos} min`;
    }
    const horas = Math.floor(minutos / 60);
    const resto = minutos % 60;
    return resto ? `${horas}h ${resto}min` : `${horas}h`;
}

function limitesAtuais() {
    const selecionados = servidoresSelecionados();
    const base = selecionados[0] || servidoresDoPerfil(estado.perfilAtual)[0];
    const faixa = base?.limites?.[estado.metricaAtual];
    return {
        atencao: faixa?.atencao ?? LIMITE_ATENCAO,
        critico: faixa?.critico ?? LIMITE_CRITICO
    };
}

function nivelDoValor(valor) {
    const { atencao, critico } = limitesAtuais();
    if (valor >= critico) return 'critico';
    if (valor >= atencao) return 'atencao';
    return 'normal';
}

function servidoresDoPerfil(perfil, servidores = estado.servidores) {
    if (!perfil || perfil === 'todos') {
        return servidores;
    }
    return servidores.filter((servidor) => servidor.perfil === perfil);
}

function servidoresEmAlerta(servidores) {
    return servidores.filter((servidor) => (
        servidor.status === 'critico'
        || servidor.status === 'atencao'
        || servidor.status === 'semdados'
    ));
}

function contarSituacao(servidores, situacao) {
    return servidores.filter((servidor) => servidor.status === situacao).length;
}

function contarCriticos(servidores) { return contarSituacao(servidores, 'critico'); }
function contarAtencao(servidores) { return contarSituacao(servidores, 'atencao'); }
function contarNormais(servidores) { return contarSituacao(servidores, 'normal'); }
function contarSemDados(servidores) { return contarSituacao(servidores, 'semdados'); }

function contarEmAlerta(servidores) {
    return contarCriticos(servidores) + contarAtencao(servidores) + contarSemDados(servidores);
}

function maiorTempoEmCritico(servidores) {
    const criticos = servidores.filter((servidor) => servidor.status === 'critico');
    if (!criticos.length) {
        return { servidor: null, minutos: 0 };
    }
    const maior = criticos.reduce((primeiro, segundo) => (
        minutosEmAlerta(primeiro) >= minutosEmAlerta(segundo) ? primeiro : segundo
    ));
    return { servidor: maior, minutos: minutosEmAlerta(maior) };
}

function tempoMedioEmAlerta(servidores) {
    const emAlerta = servidoresEmAlerta(servidores);
    if (!emAlerta.length) return 0;
    const total = emAlerta.reduce((soma, servidor) => soma + minutosEmAlerta(servidor), 0);
    return Math.round(total / emAlerta.length);
}

function ordenarPorCriticidade(servidores) {
    const peso = { critico: 0, atencao: 1, semdados: 2, normal: 3 };
    return [...servidores].sort((primeiro, segundo) => {
        if (peso[primeiro.status] !== peso[segundo.status]) {
            return peso[primeiro.status] - peso[segundo.status];
        }
        return minutosEmAlerta(segundo) - minutosEmAlerta(primeiro);
    });
}

function perfisExistentes() {
    return [...new Set(estado.servidores.map((servidor) => servidor.perfil))];
}

function corDoPerfil(servidores) {
    if (contarCriticos(servidores)) return 'critico';
    if (contarAtencao(servidores)) return 'atencao';
    if (contarSemDados(servidores)) return 'semdados';
    if (contarNormais(servidores)) return 'normal';
    return 'semdados';
}

function servidoresSelecionados() {
    return estado.servidoresSelecionados
        .map((id) => estado.servidores.find((servidor) => servidor.id === id))
        .filter(Boolean);
}

function ultimoPontoRecebido(serie) {
    for (let indice = serie.length - 1; indice >= 0; indice -= 1) {
        if (serie[indice].valor !== null) {
            return serie[indice];
        }
    }
    return null;
}

function ultimoValor(servidor) {
    const serie = servidor.historico[estado.metricaAtual] || [];
    const ponto = ultimoPontoRecebido(serie);
    return ponto ? ponto.valor : 0;
}

function rotuloMetricaAtual() {
    const metrica = METRICAS_GRAFICO.find((item) => item.id === estado.metricaAtual);
    return metrica ? metrica.rotulo : estado.metricaAtual;
}

function descricaoDoServidor(servidor) {
    const duracao = formatarDuracao(minutosEmAlerta(servidor));

    if (servidor.status === 'critico') {
        return `desde ${servidor.desde} · ${duracao} em alerta crítico`;
    }
    if (servidor.status === 'atencao') {
        return `desde ${servidor.desde} · ${duracao} em atenção`;
    }
    if (servidor.status === 'semdados') {
        return servidor.ultimaColeta
            ? `último dado ${ultimaColetaDe(servidor)} · sem dados há ${minutosSemDados(servidor)} min`
            : 'nenhuma coleta registrada hoje';
    }
    return `última coleta às ${ultimaColetaDe(servidor)}`;
}

/* =========================================================
   FUNÇÕES DE TELA
   ========================================================= */

function criarElemento(tag, classe, texto) {
    const elemento = document.createElement(tag);
    if (classe) elemento.className = classe;
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
}

function criarSvg(tag, atributos = {}) {
    const elemento = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(atributos).forEach(([chave, valor]) => {
        elemento.setAttribute(chave, String(valor));
    });
    return elemento;
}

function criarSvgTexto(x, y, conteudo, atributos = {}) {
    const texto = criarSvg('text', { x, y, ...atributos });
    texto.textContent = conteudo;
    return texto;
}

function desenharCards() {
    const container = document.getElementById('alertas-resumo');
    const escopo = servidoresDoPerfil(estado.perfilAtual);
    const emPerfil = estado.perfilAtual !== 'todos';
    const maior = maiorTempoEmCritico(escopo);

    const cartoes = [
        { rotulo: 'Críticos', valor: String(contarCriticos(escopo)), cor: 'critico', legenda: 'servidores' },
        { rotulo: 'Atenção', valor: String(contarAtencao(escopo)), cor: 'atencao', legenda: 'servidores em atenção' },
        { rotulo: 'Sem envio de dados', valor: String(contarSemDados(escopo)), cor: 'semdados', legenda: 'servidores sem coleta' },
        emPerfil
            ? {
                rotulo: 'Maior tempo em crítico',
                valor: `${maior.minutos} min`,
                cor: 'critico',
                legenda: maior.servidor ? maior.servidor.nome : 'sem servidores críticos'
            }
            : {
                rotulo: 'Tempo médio em alerta',
                valor: `${tempoMedioEmAlerta(escopo)} min`,
                cor: 'critico',
                legenda: 'por servidor em alerta'
            },
        { rotulo: 'Normal', valor: String(contarNormais(escopo)), cor: 'normal', legenda: 'servidores' }
    ];

    container.innerHTML = '';

    cartoes.forEach((cartao) => {
        const bloco = criarElemento('article', 'alertas-cartao');
        const rotulo = criarElemento('h2', 'alertas-cartao-rotulo');
        rotulo.append(criarElemento('span', `alertas-ponto ${cartao.cor}`));
        rotulo.append(criarElemento('span', '', cartao.rotulo));

        bloco.append(
            rotulo,
            criarElemento('p', `alertas-cartao-valor ${cartao.cor}`, cartao.valor),
            criarElemento('p', 'alertas-cartao-legenda', cartao.legenda)
        );
        container.append(bloco);
    });
}

function criarChip(perfil, rotulo, contagem, ativo, cor = 'critico', esmaecido = false) {
    const chip = criarElemento('button', `alertas-chip${ativo ? ' ativo' : ''}${esmaecido ? ' esmaecido' : ''}`);
    chip.type = 'button';
    chip.dataset.perfil = perfil;
    chip.setAttribute('aria-pressed', String(ativo));

    if (perfil !== 'todos') {
        chip.append(criarElemento('span', `alertas-ponto ${cor}`));
    }

    chip.append(
        criarElemento('span', 'alertas-chip-texto', rotulo),
        criarElemento('span', 'alertas-chip-conta', String(contagem))
    );

    if (esmaecido) {
        chip.disabled = true;
        chip.setAttribute('aria-disabled', 'true');
        chip.title = 'Perfil sem servidores em alerta no momento';
    }

    return chip;
}

function desenharChips() {
    const container = document.getElementById('alertas-chips');
    container.innerHTML = '';
    container.append(criarElemento('span', 'alertas-chips-rotulo', 'Perfil de servidor'));

    container.append(criarChip(
        'todos',
        'Todos os perfis',
        contarEmAlerta(estado.servidores),
        estado.perfilAtual === 'todos'
    ));

    perfisExistentes().forEach((perfil) => {
        const servidores = servidoresDoPerfil(perfil);
        const emAlerta = contarEmAlerta(servidores);

        container.append(criarChip(
            perfil,
            perfil,
            emAlerta,
            estado.perfilAtual === perfil,
            corDoPerfil(servidores),
            emAlerta === 0
        ));
    });
}

function criarLinhaServidor(servidor) {
    const linha = criarElemento('tr', 'alertas-linha');

    const celulaServidor = criarElemento('td');
    const blocoServidor = criarElemento('div', 'alertas-servidor');
    blocoServidor.append(
        criarElemento('span', 'alertas-servidor-nome', servidor.nome),
        criarElemento('span', 'alertas-servidor-perfil', `${servidor.perfil} · ${servidor.mac}`)
    );
    celulaServidor.append(blocoServidor);

    const celulaSituacao = criarElemento('td');
    celulaSituacao.append(criarElemento('span', `alertas-badge ${servidor.status}`, TEXTO_SITUACAO[servidor.status]));
    celulaSituacao.append(criarElemento('p', 'alertas-desde', descricaoDoServidor(servidor)));

    const celulaMetricas = criarElemento('td');
    const metricas = criarElemento('div', 'alertas-metricas');

    if (servidor.metricasEmAlerta.length) {
        servidor.metricasEmAlerta.forEach((metrica) => {
            const chip = criarElemento('span', 'alertas-metrica');
            const nivel = metrica.nivel || nivelDoValor(metrica.valor);
            chip.append(criarElemento('span', `alertas-ponto ${nivel}`));
            chip.append(criarElemento('span', '', `${ROTULO_METRICA[metrica.metrica] || metrica.nome || metrica.metrica}: ${metrica.valor}${metrica.unidade || '%'}`));
            metricas.append(chip);
        });
    } else {
        metricas.append(criarElemento('span', 'alertas-metrica', servidor.status === 'semdados' ? 'sem métricas' : '—'));
    }

    celulaMetricas.append(metricas);

    const celulaAcoes = criarElemento('td', 'alertas-acoes');

    const rotuloChamado = servidor.chamado?.chave
        ? `Chamado ${servidor.chamado.chave}`
        : 'Acessar o chamado';
    const botaoChamado = criarElemento('a', 'alertas-botao-chamado', rotuloChamado);
    botaoChamado.href = servidor.chamado?.url || '#';
    if (servidor.chamado?.url) {
        botaoChamado.target = '_blank';
        botaoChamado.rel = 'noopener noreferrer';
    }
    botaoChamado.dataset.chamado = servidor.id;

    const botaoPerfil = criarElemento('button', 'alertas-link-perfil', 'Ver perfil');
    botaoPerfil.type = 'button';
    botaoPerfil.dataset.verPerfil = servidor.id;

    celulaAcoes.append(botaoChamado, botaoPerfil);

    linha.append(celulaServidor, celulaSituacao, celulaMetricas, celulaAcoes);
    return linha;
}

function desenharLista() {
    const corpo = document.getElementById('alertas-lista');
    const vazio = document.getElementById('alertas-vazio');
    corpo.innerHTML = '';

    const escopo = servidoresDoPerfil(estado.perfilAtual);
    const visiveis = servidoresEmAlerta(escopo);

    const ordenados = ordenarPorCriticidade(visiveis);
    ordenados.forEach((servidor) => corpo.append(criarLinhaServidor(servidor)));

    vazio.hidden = ordenados.length > 0;

    const emAlertaVisiveis = visiveis.length;
    const emAlertaTotal = servidoresEmAlerta(estado.servidores).length;

    document.getElementById('alertas-resumo-lista').textContent =
        `Mostrando ${emAlertaVisiveis} de ${emAlertaTotal} servidores em alerta`;
    document.getElementById('alertas-selo-geral').textContent = `${ordenados.length} servidores`;
}

function desenharLateral() {
    const lista = document.getElementById('alertas-lateral-lista');
    const vazio = document.getElementById('alertas-lateral-vazio');
    lista.innerHTML = '';

    const emAlerta = servidoresEmAlerta(servidoresDoPerfil(estado.perfilAtual));
    const ordenados = ordenarPorCriticidade(emAlerta);

    ordenados.forEach((servidor) => {
        const selecionado = estado.servidoresSelecionados.includes(servidor.id);
        const item = criarElemento('li', 'alertas-lateral-item');

        if (selecionado) {
            item.classList.add('selecionado');
        }

        const topo = criarElemento('div', 'alertas-lateral-topo');
        topo.append(
            criarElemento('span', 'alertas-lateral-nome', servidor.nome),
            criarElemento('span', `alertas-badge ${servidor.status}`, TEXTO_SITUACAO[servidor.status])
        );

        const botao = criarElemento('button', 'alertas-lateral-botao', selecionado ? 'Selecionado' : 'Selecionar');
        botao.type = 'button';
        botao.dataset.servidor = servidor.id;
        botao.setAttribute('aria-pressed', String(selecionado));

        item.append(topo, botao);
        lista.append(item);
    });

    vazio.hidden = ordenados.length > 0;

    const emAlertaTotal = servidoresEmAlerta(estado.servidores).length;

    document.getElementById('alertas-resumo-lateral').textContent =
        `Mostrando ${emAlerta.length} de ${emAlertaTotal} servidores em alerta`;
    document.getElementById('alertas-selo-lateral').textContent = `${emAlerta.length} servidores`;
    document.getElementById('alertas-selo-grafico').textContent = `${ordenados.length} servidores`;
    document.getElementById('alertas-resumo-grafico').textContent =
        `Evolução de ${rotuloMetricaAtual()} dos servidores em alerta do perfil ${estado.perfilAtual}.`;
}

function desenharLegenda() {
    const legenda = document.getElementById('alertas-legend');
    legenda.innerHTML = '';

    servidoresSelecionados().forEach((servidor) => {
        const item = criarElemento('li', 'alertas-legend-item');
        const nivel = servidor.status === 'semdados' ? 'semdados' : nivelDoValor(ultimoValor(servidor));
        item.append(criarElemento('span', `alertas-ponto ${nivel}`));
        item.append(criarElemento('span', '', `${servidor.nome} - ${servidor.perfil}`));
        legenda.append(item);
    });
}

function temposDoGrafico(servidores) {
    const tempos = new Set();

    servidores.forEach((servidor) => {
        (servidor.historico[estado.metricaAtual] || []).forEach((ponto) => tempos.add(ponto.hora));
    });

    return [...tempos].sort((primeiro, segundo) => minutosDaHora(primeiro) - minutosDaHora(segundo));
}

function desenharGrafico() {
    const area = document.getElementById('alertas-grafico-area');
    area.innerHTML = '';

    const servidores = servidoresSelecionados();
    const { atencao: limiteAtencao, critico: limiteCritico } = limitesAtuais();

    desenharAvisoSemDados();

    if (!servidores.length) {
        area.append(criarElemento(
            'p',
            'alertas-grafico-vazio',
            'Selecione um servidor na lista ao lado para desenhar a evolução.'
        ));
        return;
    }

    const largura = 940;
    const altura = 420;
    const margem = { topo: 26, direita: 104, baixo: 48, esquerda: 62 };
    const areaLargura = largura - margem.esquerda - margem.direita;
    const areaAltura = altura - margem.topo - margem.baixo;

    const tempos = temposDoGrafico(servidores);
    const posX = (hora) => {
        const indice = Math.max(0, tempos.indexOf(hora));
        return margem.esquerda + (indice / Math.max(1, tempos.length - 1)) * areaLargura;
    };
    const posY = (valor) => margem.topo + areaAltura - (Math.min(100, Math.max(0, valor)) / 100) * areaAltura;

    const svg = criarSvg('svg', {
        viewBox: `0 0 ${largura} ${altura}`,
        class: 'alertas-svg',
        role: 'img',
        'aria-label': `Evolução de ${rotuloMetricaAtual()} dos servidores selecionados no perfil ${estado.perfilAtual}`
    });

    svg.append(criarSvg('rect', {
        x: margem.esquerda,
        y: posY(100),
        width: areaLargura,
        height: posY(limiteCritico) - posY(100),
        fill: 'rgba(204, 3, 1, 0.08)'
    }));
    svg.append(criarSvg('rect', {
        x: margem.esquerda,
        y: posY(limiteCritico),
        width: areaLargura,
        height: posY(limiteAtencao) - posY(limiteCritico),
        fill: 'rgba(226, 137, 27, 0.10)'
    }));

    [0, 20, 40, 60, 80, 100].forEach((valor) => {
        svg.append(criarSvg('line', {
            x1: margem.esquerda,
            y1: posY(valor),
            x2: margem.esquerda + areaLargura,
            y2: posY(valor),
            stroke: '#e6e9ef',
            'stroke-width': 1
        }));
        svg.append(criarSvgTexto(margem.esquerda - 14, posY(valor) + 5, `${valor}%`, {
            'text-anchor': 'end',
            fill: '#6b7280',
            'font-size': 13
        }));
    });

    [
        { limite: limiteCritico, nivel: 'critico', texto: `Crítico: ${limiteCritico}%` },
        { limite: limiteAtencao, nivel: 'atencao', texto: `Atenção: ${limiteAtencao}%` }
    ].forEach((faixa) => {
        svg.append(criarSvg('line', {
            x1: margem.esquerda,
            y1: posY(faixa.limite),
            x2: margem.esquerda + areaLargura,
            y2: posY(faixa.limite),
            stroke: COR_SITUACAO[faixa.nivel],
            'stroke-width': 1.5,
            'stroke-dasharray': '6 5'
        }));
        svg.append(criarSvgTexto(margem.esquerda + areaLargura - 8, posY(faixa.limite) - 8, faixa.texto, {
            'text-anchor': 'end',
            fill: COR_SITUACAO[faixa.nivel],
            'font-size': 13,
            'font-weight': 600
        }));
    });

    tempos.forEach((hora) => {
        svg.append(criarSvgTexto(posX(hora), margem.topo + areaAltura + 28, hora, {
            'text-anchor': 'middle',
            fill: '#6b7280',
            'font-size': 13
        }));
    });

    svg.append(criarSvgTexto(4, 16, `% de uso (${rotuloMetricaAtual()})`, {
        fill: '#6b7280',
        'font-size': 13
    }));

    servidores.forEach((servidor) => {
        if (servidor.status !== 'semdados') return;
        const serie = servidor.historico[estado.metricaAtual] || [];
        const ultimo = ultimoPontoRecebido(serie);
        if (!ultimo) return;
        desenharFaixaSemDados(svg, ultimo, posX, posY, tempos);
    });

    servidores.forEach((servidor) => {
        const serie = servidor.historico[estado.metricaAtual] || [];
        if (!serie.length) return;

        for (let indice = 0; indice < serie.length - 1; indice += 1) {
            const inicio = serie[indice];
            const fim = serie[indice + 1];

            if (inicio.valor === null || fim.valor === null) continue;

            const nivel = nivelDoValor(Math.max(inicio.valor, fim.valor));

            svg.append(criarSvg('line', {
                x1: posX(inicio.hora),
                y1: posY(inicio.valor),
                x2: posX(fim.hora),
                y2: posY(fim.valor),
                stroke: COR_SITUACAO[nivel],
                'stroke-width': 2.6,
                'stroke-linecap': 'round'
            }));
        }

        serie.forEach((ponto) => {
            if (ponto.valor === null) return;

            svg.append(criarSvg('circle', {
                cx: posX(ponto.hora),
                cy: posY(ponto.valor),
                r: 4,
                fill: '#ffffff',
                stroke: COR_SITUACAO[nivelDoValor(ponto.valor)],
                'stroke-width': 2.2
            }));
        });

        const primeiroCritico = serie.find((ponto) => ponto.valor !== null && ponto.valor >= limiteCritico);

        if (primeiroCritico) {
            const x = posX(primeiroCritico.hora);
            const y = posY(primeiroCritico.valor);

            svg.append(criarSvg('rect', {
                x: x - 21,
                y: y - 32,
                width: 42,
                height: 22,
                rx: 11,
                fill: '#ffffff',
                stroke: COR_SITUACAO.critico,
                'stroke-width': 1.5
            }));
            svg.append(criarSvgTexto(x, y - 17, `${Math.round(primeiroCritico.valor)}%`, {
                'text-anchor': 'middle',
                fill: COR_SITUACAO.critico,
                'font-size': 12,
                'font-weight': 600
            }));
        }

        const ultimo = ultimoPontoRecebido(serie);
        if (!ultimo) return;

        if (servidor.status === 'semdados') {
            desenharMarcadorParada(svg, ultimo, posX, posY, margem, areaLargura);
            return;
        }

        const nivel = nivelDoValor(ultimo.valor);

        svg.append(criarSvg('rect', {
            x: posX(ultimo.hora) + 10,
            y: posY(ultimo.valor) - 12,
            width: 62,
            height: 24,
            rx: 12,
            fill: COR_SITUACAO[nivel]
        }));
        svg.append(criarSvgTexto(posX(ultimo.hora) + 41, posY(ultimo.valor) + 5, `${Math.round(ultimo.valor)}%`, {
            'text-anchor': 'middle',
            fill: '#ffffff',
            'font-size': 12,
            'font-weight': 600
        }));
    });

    area.append(svg);
}

function desenharFaixaSemDados(svg, ponto, posX, posY, tempos) {
    const x = posX(ponto.hora);
    const topo = posY(100);
    const base = posY(0);
    const ultimoTempo = tempos[tempos.length - 1] || ponto.hora;
    const fimX = posX(ultimoTempo);
    const largura = Math.max(0, fimX - x);

    svg.append(criarSvg('rect', {
        x,
        y: topo,
        width: largura,
        height: base - topo,
        fill: 'rgba(138, 143, 156, 0.12)',
        stroke: '#8a8f9c',
        'stroke-width': 1,
        'stroke-dasharray': '6 5'
    }));

    if (largura > 70) {
        svg.append(criarSvgTexto(x + largura / 2, topo + 18, 'sem dados', {
            'text-anchor': 'middle',
            fill: '#5b5f6b',
            'font-size': 12,
            'font-weight': 600
        }));
    }
}

function desenharMarcadorParada(svg, ponto, posX, posY, margem, areaLargura) {
    const x = posX(ponto.hora);
    const y = posY(ponto.valor);

    svg.append(criarSvg('circle', {
        cx: x,
        cy: y,
        r: 5.5,
        fill: '#8a8f9c',
        stroke: '#ffffff',
        'stroke-width': 2
    }));

    const paraEsquerda = x > margem.esquerda + areaLargura / 2;

    svg.append(criarSvgTexto(paraEsquerda ? x - 10 : x + 10, y - 16, `Parou de enviar dados às ${ponto.hora}`, {
        'text-anchor': paraEsquerda ? 'end' : 'start',
        fill: '#5b5f6b',
        'font-size': 12,
        'font-weight': 600
    }));
}

function desenharAvisoSemDados() {
    const aviso = document.getElementById('alertas-grafico-aviso');
    const semDados = servidoresSelecionados().filter((servidor) => servidor.status === 'semdados');

    aviso.innerHTML = '';
    aviso.hidden = semDados.length === 0;

    semDados.forEach((servidor) => {
        const texto = servidor.ultimaColeta
            ? `${servidor.nome} · Sem dados há ${minutosSemDados(servidor)} min · última coleta ${ultimaColetaDe(servidor)}`
            : `${servidor.nome} · Nenhuma coleta registrada hoje`;

        aviso.append(criarElemento('span', 'alertas-grafico-aviso-item', texto));
    });
}

function atualizarAbas() {
    document.querySelectorAll('#alertas-abas [data-metrica]').forEach((aba) => {
        aba.setAttribute('aria-selected', String(aba.dataset.metrica === estado.metricaAtual));
    });
}

function limparSecaoPerfil() {
    document.getElementById('alertas-legend').innerHTML = '';
    document.getElementById('alertas-grafico-area').innerHTML = '';
    document.getElementById('alertas-lateral-lista').innerHTML = '';
    document.getElementById('alertas-grafico-aviso').innerHTML = '';
    document.getElementById('alertas-grafico-aviso').hidden = true;
    document.getElementById('alertas-selo-grafico').textContent = '';
    document.getElementById('alertas-resumo-grafico').textContent = '';
    document.getElementById('alertas-selo-lateral').textContent = '';
    document.getElementById('alertas-resumo-lateral').textContent = '';
}

function atualizarTudo() {
    const emPerfil = estado.perfilAtual !== 'todos';

    document.getElementById('alertas-painel-geral').hidden = emPerfil;
    document.getElementById('alertas-painel-perfil').hidden = !emPerfil;
    document.getElementById('alertas-painel-grafico').hidden = !emPerfil;
    document.getElementById('alertas-painel-lateral').hidden = !emPerfil;

    const selo = document.getElementById('alertas-selo-perfil');
    selo.innerHTML = '';
    selo.hidden = !emPerfil;

    if (emPerfil) {
        selo.append(criarElemento('span', 'alertas-ponto critico'));
        selo.append(criarElemento('span', '', estado.perfilAtual));
    }

    document.getElementById('alertas-grafico-perfil').textContent = emPerfil ? estado.perfilAtual : '';

    desenharCards();
    desenharChips();
    desenharLista();
    atualizarAbas();

    if (emPerfil) {
        desenharLateral();
        desenharLegenda();
        desenharGrafico();
    } else {
        limparSecaoPerfil();
    }
}

/* =========================================================
   EVENTOS
   ========================================================= */

function trocarPerfil(perfil, servidorPreferido = null) {
    if (!servidorPreferido && perfil === estado.perfilAtual) {
        return;
    }

    estado.perfilAtual = perfil;

    if (perfil === 'todos') {
        estado.servidoresSelecionados = [];
        atualizarTudo();
        return;
    }

    const emAlerta = servidoresEmAlerta(servidoresDoPerfil(perfil));
    const alvo = servidorPreferido || ordenarPorCriticidade(emAlerta)[0];

    estado.servidoresSelecionados = alvo ? [alvo.id] : [];
    atualizarTudo();
}

function alternarSelecao(id) {
    const posicao = estado.servidoresSelecionados.indexOf(id);

    if (posicao >= 0) {
        estado.servidoresSelecionados.splice(posicao, 1);
    } else {
        estado.servidoresSelecionados.push(id);
    }

    desenharLateral();
    desenharLegenda();
    desenharGrafico();
}

async function tratarCliqueChamado(link, servidor) {
    if (servidor.chamado?.url) {
        window.open(servidor.chamado.url, '_blank', 'noopener,noreferrer');
        return;
    }

    const textoOriginal = link.textContent;
    link.textContent = 'Buscando chamado...';

    try {
        const resp = await fetch('/alertas/chamado', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mac: servidor.mac,
                nomeServidor: servidor.nome,
                perfil: servidor.perfil,
                metricaPrincipal: servidor.metricasEmAlerta[0] || null,
                nivel: servidor.status
            })
        });

        const dados = await resp.json();
        if (dados.url) {
            servidor.chamado = dados;
            link.href = dados.url;
            link.textContent = `Chamado ${dados.chave}`;
            window.open(dados.url, '_blank', 'noopener,noreferrer');
        } else {
            link.textContent = textoOriginal;
            alert('Integração com o Jira ainda não configurada no servidor (.env).');
        }
    } catch (erro) {
        console.error(erro);
        link.textContent = textoOriginal;
        alert('Não foi possível acessar ou abrir o chamado no Jira.');
    }
}

function iniciarEventos() {
    document.getElementById('alertas-chips').addEventListener('click', (evento) => {
        const chip = evento.target.closest('.alertas-chip');
        if (!chip) return;
        trocarPerfil(chip.dataset.perfil);
    });

    document.getElementById('alertas-abas').addEventListener('click', (evento) => {
        const aba = evento.target.closest('[data-metrica]');
        if (!aba) return;
        estado.metricaAtual = aba.dataset.metrica;
        atualizarAbas();
        desenharLateral();
        desenharLegenda();
        desenharGrafico();
    });

    document.getElementById('alertas-lateral-lista').addEventListener('click', (evento) => {
        const botao = evento.target.closest('[data-servidor]');
        if (!botao) return;
        alternarSelecao(botao.dataset.servidor);
    });

    document.getElementById('alertas-lista').addEventListener('click', (evento) => {
        const chamado = evento.target.closest('[data-chamado]');
        if (chamado) {
            evento.preventDefault();
            const servidor = estado.servidores.find((item) => item.id === chamado.dataset.chamado);
            if (servidor) tratarCliqueChamado(chamado, servidor);
            return;
        }

        const verPerfil = evento.target.closest('[data-ver-perfil]');
        if (!verPerfil) return;

        const servidor = estado.servidores.find((item) => item.id === verPerfil.dataset.verPerfil);
        if (servidor) {
            trocarPerfil(servidor.perfil, servidor.id);
        }
    });

    document.getElementById('alertas-atualizar').addEventListener('click', async (evento) => {
        const botao = evento.currentTarget;
        botao.classList.remove('girando');
        void botao.offsetWidth;
        botao.classList.add('girando');

        try {
            estado.servidores = await obterServidoresEmAlerta();
            document.getElementById('alertas-hora-atualizacao').textContent = HORA_ATUALIZACAO;
            atualizarTudo();
        } catch (erro) {
            console.error(erro);
        }
    });
}

async function iniciar() {
    estado.servidores = await obterServidoresEmAlerta();
    document.getElementById('alertas-hora-atualizacao').textContent = HORA_ATUALIZACAO;
    iniciarEventos();
    atualizarTudo();
}

iniciar().catch((erro) => {
    console.error(erro);
    const vazio = document.getElementById('alertas-vazio');
    vazio.hidden = false;
    vazio.textContent = 'Não foi possível carregar os alertas de servidores.';
});
