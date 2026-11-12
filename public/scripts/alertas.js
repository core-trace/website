/* =========================================================
   CoreTrace - Alertas de servidores
   Página de alertas por perfil de servidor.

   Organização do arquivo:
   1) Configuração
   2) Dados fictícios
   3) Serviço (única função que muda quando houver API real)
   4) Estado
   5) Funções de cálculo
   6) Funções de tela
   7) Eventos
   ========================================================= */


/* =========================================================
   1) CONFIGURAÇÃO
   ========================================================= */

const LIMITE_ATENCAO = 70;
const LIMITE_CRITICO = 85;

/* Hora usada como referência para calcular quanto tempo o servidor está no estado atual. */
const HORA_ATUALIZACAO = '20:30';

/* Grade de tempo compartilhada pelas séries do gráfico. */
const TEMPO_LINHA = ['19:30', '19:45', '20:00', '20:10', '20:20', '20:30'];

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
   2) DADOS FICTÍCIOS
   ========================================================= */

/* Monta a série de pontos de uma métrica a partir dos valores do período.
   Valores null marcam a lacuna de quem parou de enviar dados. */
const montarSerie = (valores) => TEMPO_LINHA.map((hora, indice) => ({
    hora,
    valor: valores[indice] === undefined ? null : valores[indice]
}));

const SERVIDORES_FICTICIOS = [
    /* ---------- Perfil Financeiro ---------- */
    {
        id: 'srv-pay-01',
        nome: 'srv-pay-01',
        perfil: 'Financeiro',
        status: 'critico',
        desde: '19:24',
        metricasEmAlerta: [{ metrica: 'cpu', valor: 92 }],
        historico: {
            cpu: montarSerie([52, 58, 63, 71, 84, 92]),
            ram: montarSerie([48, 50, 52, 55, 58, 60]),
            rede: montarSerie([22, 25, 28, 31, 35, 38])
        }
    },
    {
        id: 'srv-pay-02',
        nome: 'srv-pay-02',
        perfil: 'Financeiro',
        status: 'critico',
        desde: '20:02',
        metricasEmAlerta: [{ metrica: 'ram', valor: 88 }],
        historico: {
            cpu: montarSerie([40, 44, 49, 53, 57, 60]),
            ram: montarSerie([55, 58, 62, 70, 80, 88]),
            rede: montarSerie([30, 32, 34, 36, 40, 44])
        }
    },
    {
        id: 'srv-pay-03',
        nome: 'srv-pay-03',
        perfil: 'Financeiro',
        status: 'atencao',
        desde: '20:15',
        metricasEmAlerta: [{ metrica: 'cpu', valor: 78 }],
        historico: {
            cpu: montarSerie([45, 48, 52, 60, 68, 78]),
            ram: montarSerie([42, 44, 47, 50, 54, 57]),
            rede: montarSerie([18, 20, 22, 25, 27, 30])
        }
    },
    {
        id: 'srv-pay-04',
        nome: 'srv-pay-04',
        perfil: 'Financeiro',
        status: 'atencao',
        desde: '20:18',
        metricasEmAlerta: [{ metrica: 'ram', valor: 74 }],
        historico: {
            cpu: montarSerie([38, 40, 43, 48, 52, 55]),
            ram: montarSerie([50, 52, 55, 60, 68, 74]),
            rede: montarSerie([25, 27, 30, 33, 36, 38])
        }
    },
    {
        id: 'srv-pay-05',
        nome: 'srv-pay-05',
        perfil: 'Financeiro',
        status: 'normal',
        desde: '20:25',
        metricasEmAlerta: [],
        historico: {
            cpu: montarSerie([30, 32, 34, 35, 36, 38]),
            ram: montarSerie([35, 36, 38, 39, 40, 41]),
            rede: montarSerie([12, 13, 14, 15, 16, 17])
        }
    },
    {
        id: 'srv-pay-06',
        nome: 'srv-pay-06',
        perfil: 'Financeiro',
        status: 'semdados',
        desde: '20:10',
        ultimaColeta: '20:10',
        metricasEmAlerta: [],
        historico: {
            cpu: montarSerie([52, 58, 63, 66, null, null]),
            ram: montarSerie([48, 50, 52, 55, null, null]),
            rede: montarSerie([22, 25, 28, 31, null, null])
        }
    },

    /* ---------- Perfil Banco de Dados ---------- */
    {
        id: 'srv-db-01',
        nome: 'srv-db-01',
        perfil: 'Banco de Dados',
        status: 'critico',
        desde: '20:06',
        metricasEmAlerta: [{ metrica: 'ram', valor: 88 }, { metrica: 'cpu', valor: 90 }],
        historico: {
            cpu: montarSerie([62, 66, 72, 80, 87, 90]),
            ram: montarSerie([60, 64, 70, 78, 85, 88]),
            rede: montarSerie([40, 45, 50, 55, 60, 66])
        }
    },
    {
        id: 'srv-db-02',
        nome: 'srv-db-02',
        perfil: 'Banco de Dados',
        status: 'atencao',
        desde: '20:12',
        metricasEmAlerta: [{ metrica: 'cpu', valor: 73 }],
        historico: {
            cpu: montarSerie([44, 48, 54, 60, 68, 73]),
            ram: montarSerie([58, 60, 63, 66, 70, 72]),
            rede: montarSerie([35, 38, 42, 46, 50, 52])
        }
    },
    {
        id: 'srv-db-03',
        nome: 'srv-db-03',
        perfil: 'Banco de Dados',
        status: 'normal',
        desde: '20:24',
        metricasEmAlerta: [],
        historico: {
            cpu: montarSerie([32, 33, 35, 36, 37, 39]),
            ram: montarSerie([40, 41, 43, 44, 46, 47]),
            rede: montarSerie([20, 21, 22, 23, 24, 26])
        }
    },
    {
        id: 'srv-db-04',
        nome: 'srv-db-04',
        perfil: 'Banco de Dados',
        status: 'semdados',
        desde: '20:20',
        ultimaColeta: '20:20',
        metricasEmAlerta: [],
        historico: {
            cpu: montarSerie([45, 48, 52, 55, 58, null]),
            ram: montarSerie([50, 52, 54, 57, 60, null]),
            rede: montarSerie([30, 32, 34, 36, 38, null])
        }
    },

    /* ---------- Perfil API de Pedidos ---------- */
    {
        id: 'srv-api-01',
        nome: 'srv-api-01',
        perfil: 'API de Pedidos',
        status: 'atencao',
        desde: '20:20',
        metricasEmAlerta: [{ metrica: 'cpu', valor: 78 }],
        historico: {
            cpu: montarSerie([50, 54, 60, 66, 72, 78]),
            ram: montarSerie([36, 38, 40, 43, 46, 49]),
            rede: montarSerie([24, 27, 30, 34, 38, 42])
        }
    },
    {
        id: 'srv-api-02',
        nome: 'srv-api-02',
        perfil: 'API de Pedidos',
        status: 'atencao',
        desde: '20:24',
        metricasEmAlerta: [{ metrica: 'rede', valor: 76 }],
        historico: {
            cpu: montarSerie([42, 44, 47, 51, 55, 58]),
            ram: montarSerie([33, 35, 37, 39, 42, 44]),
            rede: montarSerie([40, 45, 52, 60, 68, 76])
        }
    },
    {
        id: 'srv-api-03',
        nome: 'srv-api-03',
        perfil: 'API de Pedidos',
        status: 'critico',
        desde: '19:58',
        metricasEmAlerta: [{ metrica: 'cpu', valor: 91 }],
        historico: {
            cpu: montarSerie([55, 60, 68, 76, 85, 91]),
            ram: montarSerie([48, 51, 55, 60, 66, 71]),
            rede: montarSerie([28, 31, 35, 40, 46, 52])
        }
    },
    {
        id: 'srv-api-04',
        nome: 'srv-api-04',
        perfil: 'API de Pedidos',
        status: 'semdados',
        desde: '20:00',
        ultimaColeta: '20:00',
        metricasEmAlerta: [],
        historico: {
            cpu: montarSerie([44, 47, 50, null, null, null]),
            ram: montarSerie([33, 35, 37, null, null, null]),
            rede: montarSerie([24, 27, 30, null, null, null])
        }
    },

    /* ---------- Perfil Meteorologia ---------- */
    {
        id: 'srv-fis-01',
        nome: 'srv-fis-01',
        perfil: 'Meteorologia',
        status: 'atencao',
        desde: '19:45',
        metricasEmAlerta: [{ metrica: 'disco', valor: 84 }],
        historico: {
            cpu: montarSerie([30, 34, 40, 46, 52, 58]),
            ram: montarSerie([35, 38, 42, 48, 54, 60]),
            rede: montarSerie([20, 24, 28, 33, 38, 44])
        }
    },
    {
        id: 'srv-fis-02',
        nome: 'srv-fis-02',
        perfil: 'Meteorologia',
        status: 'critico',
        desde: '20:04',
        metricasEmAlerta: [{ metrica: 'cpu', valor: 87 }],
        historico: {
            cpu: montarSerie([48, 54, 62, 70, 80, 87]),
            ram: montarSerie([40, 43, 47, 52, 58, 63]),
            rede: montarSerie([22, 25, 29, 34, 39, 45])
        }
    },
    {
        id: 'srv-fis-03',
        nome: 'srv-fis-03',
        perfil: 'Meteorologia',
        status: 'normal',
        desde: '20:26',
        metricasEmAlerta: [],
        historico: {
            cpu: montarSerie([28, 30, 31, 33, 34, 36]),
            ram: montarSerie([32, 33, 35, 36, 37, 39]),
            rede: montarSerie([15, 16, 17, 18, 19, 20])
        }
    },
    {
        id: 'srv-fis-04',
        nome: 'srv-fis-04',
        perfil: 'Meteorologia',
        status: 'semdados',
        desde: '20:20',
        ultimaColeta: '20:20',
        metricasEmAlerta: [],
        historico: {
            cpu: montarSerie([44, 46, 45, 47, 46, null]),
            ram: montarSerie([39, 40, 41, 40, 40, null]),
            rede: montarSerie([21, 22, 23, 22, 22, null])
        }
    },

    /* ---------- Perfil Notas Fiscais ---------- */
    {
        id: 'srv-nf-01',
        nome: 'srv-nf-01',
        perfil: 'Notas Fiscais',
        status: 'semdados',
        desde: '19:45',
        ultimaColeta: '19:45',
        metricasEmAlerta: [],
        historico: {
            cpu: montarSerie([40, 42, null, null, null, null]),
            ram: montarSerie([33, 35, null, null, null, null]),
            rede: montarSerie([19, 21, null, null, null, null])
        }
    },
    {
        id: 'srv-nf-02',
        nome: 'srv-nf-02',
        perfil: 'Notas Fiscais',
        status: 'normal',
        desde: '20:25',
        metricasEmAlerta: [],
        historico: {
            cpu: montarSerie([26, 27, 28, 29, 30, 31]),
            ram: montarSerie([30, 31, 32, 33, 34, 35]),
            rede: montarSerie([14, 15, 16, 17, 18, 19])
        }
    },

    /* ---------- Perfil Portal Corporativo ---------- */
    {
        id: 'srv-por-01',
        nome: 'srv-por-01',
        perfil: 'Portal Corporativo',
        status: 'normal',
        desde: '20:20',
        metricasEmAlerta: [],
        historico: {
            cpu: montarSerie([24, 25, 26, 27, 28, 29]),
            ram: montarSerie([28, 29, 30, 31, 32, 33]),
            rede: montarSerie([12, 13, 13, 14, 15, 16])
        }
    },
    {
        id: 'srv-por-02',
        nome: 'srv-por-02',
        perfil: 'Portal Corporativo',
        status: 'semdados',
        desde: '20:10',
        ultimaColeta: '20:10',
        metricasEmAlerta: [],
        historico: {
            cpu: montarSerie([31, 32, 33, 32, null, null]),
            ram: montarSerie([27, 28, 29, 28, null, null]),
            rede: montarSerie([16, 17, 17, 16, null, null])
        }
    }
];


/* =========================================================
   3) SERVIÇO
   ========================================================= */

/*
 * Única função que precise mudar quando os dados vierem do backend.
 * O resto da página só conhece o array devolvido aqui.
 */
async function obterServidoresEmAlerta() {
    // Hoje: dados fictícios.
    // No futuro: return await fetch('/api/alertas/servidores').then((resposta) => resposta.json());
    return SERVIDORES_FICTICIOS;
}


/* =========================================================
   4) ESTADO
   ========================================================= */

const estado = {
    perfilAtual: 'todos',
    metricaAtual: 'cpu',
    servidoresSelecionados: [],
    servidores: []
};


/* =========================================================
   5) FUNÇÕES DE CÁLCULO
   ========================================================= */

function minutosDaHora(hora) {
    const partes = hora.split(':').map(Number);
    return partes[0] * 60 + partes[1];
}

function minutosEmAlerta(servidor) {
    return Math.max(0, minutosDaHora(HORA_ATUALIZACAO) - minutosDaHora(servidor.desde));
}

/* Horário da última coleta recebida do servidor. */
function ultimaColetaDe(servidor) {
    return servidor.ultimaColeta || servidor.desde;
}

/* Quantos minutos o servidor está sem enviar dados. */
function minutosSemDados(servidor) {
    return Math.max(0, minutosDaHora(HORA_ATUALIZACAO) - minutosDaHora(ultimaColetaDe(servidor)));
}

function formatarDuracao(minutos) {
    if (minutos < 60) {
        return `${minutos} min`;
    }

    const horas = Math.floor(minutos / 60);
    const resto = minutos % 60;
    return resto ? `${horas}h ${resto}min` : `${horas}h`;
}

function nivelDoValor(valor) {
    if (valor >= LIMITE_CRITICO) {
        return 'critico';
    }

    if (valor >= LIMITE_ATENCAO) {
        return 'atencao';
    }

    return 'normal';
}

function servidoresDoPerfil(perfil, servidores = estado.servidores) {
    if (!perfil || perfil === 'todos') {
        return servidores;
    }

    return servidores.filter((servidor) => servidor.perfil === perfil);
}

/* Crítico, atenção e falta de dados contam como alerta. */
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

function contarCriticos(servidores) {
    return contarSituacao(servidores, 'critico');
}

function contarAtencao(servidores) {
    return contarSituacao(servidores, 'atencao');
}

function contarNormais(servidores) {
    return contarSituacao(servidores, 'normal');
}

function contarSemDados(servidores) {
    return contarSituacao(servidores, 'semdados');
}

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

    if (!emAlerta.length) {
        return 0;
    }

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
    if (contarCriticos(servidores)) {
        return 'critico';
    }

    if (contarAtencao(servidores)) {
        return 'atencao';
    }

    if (contarSemDados(servidores)) {
        return 'semdados';
    }

    if (contarNormais(servidores)) {
        return 'normal';
    }

    return 'semdados';
}

function servidoresSelecionados() {
    return estado.servidoresSelecionados
        .map((id) => estado.servidores.find((servidor) => servidor.id === id))
        .filter(Boolean);
}

/* Último ponto com valor recebido (ignora a lacuna de quem parou de enviar dados). */
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
        return `último dado ${ultimaColetaDe(servidor)} · sem dados há ${minutosSemDados(servidor)} min`;
    }

    return `última coleta (${duracao})`;
}


/* =========================================================
   6) FUNÇÕES DE TELA
   ========================================================= */

function criarElemento(tag, classe, texto) {
    const elemento = document.createElement(tag);

    if (classe) {
        elemento.className = classe;
    }

    if (texto !== undefined) {
        elemento.textContent = texto;
    }

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
        {
            rotulo: 'Críticos',
            valor: String(contarCriticos(escopo)),
            cor: 'critico',
            legenda: 'servidores'
        },
        {
            rotulo: 'Atenção',
            valor: String(contarAtencao(escopo)),
            cor: 'atencao',
            legenda: 'servidores em atenção'
        },
        {
            rotulo: 'Sem envio de dados',
            valor: String(contarSemDados(escopo)),
            cor: 'semdados',
            legenda: 'servidores sem coleta'
        },
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
        {
            rotulo: 'Normal',
            valor: String(contarNormais(escopo)),
            cor: 'normal',
            legenda: 'servidores'
        }
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

    /* Perfil sem servidores em alerta: esmaecido e não selecionável. */
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
        criarElemento('span', 'alertas-servidor-perfil', servidor.perfil)
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
            chip.append(criarElemento('span', `alertas-ponto ${nivelDoValor(metrica.valor)}`));
            chip.append(criarElemento('span', '', `${ROTULO_METRICA[metrica.metrica] || metrica.metrica}: ${metrica.valor}%`));
            metricas.append(chip);
        });
    } else {
        metricas.append(criarElemento('span', 'alertas-metrica', servidor.status === 'semdados' ? 'sem métricas' : '—'));
    }

    celulaMetricas.append(metricas);

    const celulaAcoes = criarElemento('td', 'alertas-acoes');

    const botaoChamado = criarElemento('a', 'alertas-botao-chamado', 'Acessar o chamado');
    botaoChamado.href = '#';
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

    /* A lista da visão geral mostra somente servidores em alerta (crítico, atenção ou sem dados). */
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
    const posY = (valor) => margem.topo + areaAltura - (valor / 100) * areaAltura;

    const svg = criarSvg('svg', {
        viewBox: `0 0 ${largura} ${altura}`,
        class: 'alertas-svg',
        role: 'img',
        'aria-label': `Evolução de ${rotuloMetricaAtual()} dos servidores selecionados no perfil ${estado.perfilAtual}`
    });

    /* Faixas de severidade */
    svg.append(criarSvg('rect', {
        x: margem.esquerda,
        y: posY(100),
        width: areaLargura,
        height: posY(LIMITE_CRITICO) - posY(100),
        fill: 'rgba(204, 3, 1, 0.08)'
    }));
    svg.append(criarSvg('rect', {
        x: margem.esquerda,
        y: posY(LIMITE_CRITICO),
        width: areaLargura,
        height: posY(LIMITE_ATENCAO) - posY(LIMITE_CRITICO),
        fill: 'rgba(226, 137, 27, 0.10)'
    }));

    /* Grade e rótulos do eixo vertical */
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

    /* Linhas dos limites de atenção e crítico */
    [
        { limite: LIMITE_CRITICO, nivel: 'critico', texto: `Crítico: ${LIMITE_CRITICO}%` },
        { limite: LIMITE_ATENCAO, nivel: 'atencao', texto: `Atenção: ${LIMITE_ATENCAO}%` }
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

    /* Rótulos do eixo horizontal */
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

    /* Períodos sem dados: faixa cinza tracejada da última coleta até agora. */
    servidores.forEach((servidor) => {
        if (servidor.status !== 'semdados') {
            return;
        }

        const serie = servidor.historico[estado.metricaAtual] || [];
        const ultimo = ultimoPontoRecebido(serie);

        if (!ultimo) {
            return;
        }

        desenharFaixaSemDados(svg, ultimo, posX, posY, margem, areaLargura);
    });

    /* Uma linha por servidor selecionado */
    servidores.forEach((servidor) => {
        const serie = servidor.historico[estado.metricaAtual] || [];

        if (!serie.length) {
            return;
        }

        for (let indice = 0; indice < serie.length - 1; indice += 1) {
            const inicio = serie[indice];
            const fim = serie[indice + 1];

            /* A linha para no último ponto recebido: a lacuna não é ligada. */
            if (inicio.valor === null || fim.valor === null) {
                continue;
            }

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
            if (ponto.valor === null) {
                return;
            }

            svg.append(criarSvg('circle', {
                cx: posX(ponto.hora),
                cy: posY(ponto.valor),
                r: 4,
                fill: '#ffffff',
                stroke: COR_SITUACAO[nivelDoValor(ponto.valor)],
                'stroke-width': 2.2
            }));
        });

        const primeiroCritico = serie.find((ponto) => ponto.valor !== null && ponto.valor >= LIMITE_CRITICO);

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
            svg.append(criarSvgTexto(x, y - 17, `${primeiroCritico.valor}%`, {
                'text-anchor': 'middle',
                fill: COR_SITUACAO.critico,
                'font-size': 12,
                'font-weight': 600
            }));
        }

        const ultimo = ultimoPontoRecebido(serie);

        if (!ultimo) {
            return;
        }

        /* Servidor sem envio de dados: marcador cinza no último ponto recebido. */
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
        svg.append(criarSvgTexto(posX(ultimo.hora) + 41, posY(ultimo.valor) + 5, `${ultimo.valor}%`, {
            'text-anchor': 'middle',
            fill: '#ffffff',
            'font-size': 12,
            'font-weight': 600
        }));
    });

    area.append(svg);
}

/* Faixa cinza tracejada indicando o período sem dados (última coleta até agora). */
function desenharFaixaSemDados(svg, ponto, posX, posY, margem, areaLargura) {
    const x = posX(ponto.hora);
    const topo = posY(100);
    const base = posY(0);
    const fimX = posX(HORA_ATUALIZACAO);
    const largura = Math.max(0, fimX - x);

    svg.append(criarSvg('rect', {
        x: x,
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

/* Marcador cinza no último ponto recebido, com o momento da parada. */
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

    /* O rótulo fica para dentro do gráfico para não estourar a área do SVG. */
    const paraEsquerda = x > margem.esquerda + areaLargura / 2;

    svg.append(criarSvgTexto(paraEsquerda ? x - 10 : x + 10, y - 16, `Parou de enviar dados às ${ponto.hora}`, {
        'text-anchor': paraEsquerda ? 'end' : 'start',
        fill: '#5b5f6b',
        'font-size': 12,
        'font-weight': 600
    }));
}

/* Aviso de falta de dados logo abaixo do gráfico. */
function desenharAvisoSemDados() {
    const aviso = document.getElementById('alertas-grafico-aviso');
    const semDados = servidoresSelecionados().filter((servidor) => servidor.status === 'semdados');

    aviso.innerHTML = '';
    aviso.hidden = semDados.length === 0;

    semDados.forEach((servidor) => {
        const texto = semDados.length > 1
            ? `${servidor.nome} · Sem dados há ${minutosSemDados(servidor)} min · última coleta ${ultimaColetaDe(servidor)}`
            : `Sem dados há ${minutosSemDados(servidor)} min · última coleta ${ultimaColetaDe(servidor)}`;

        aviso.append(criarElemento('span', 'alertas-grafico-aviso-item', texto));
    });
}

function atualizarAbas() {
    document.querySelectorAll('#alertas-abas [data-metrica]').forEach((aba) => {
        aba.setAttribute('aria-selected', String(aba.dataset.metrica === estado.metricaAtual));
    });
}

/* Limpa o conteúdo da seção do perfil quando a visão geral está ativa. */
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

    /* Visão geral e seção do perfil se alternam conforme o perfil atual. */
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

    /* Gráfico e lista lateral do perfil só existem com um perfil selecionado. */
    if (emPerfil) {
        desenharLateral();
        desenharLegenda();
        desenharGrafico();
    } else {
        limparSecaoPerfil();
    }
}


/* =========================================================
   7) EVENTOS
   ========================================================= */

function trocarPerfil(perfil, servidorPreferido = null) {
    if (!servidorPreferido && perfil === estado.perfilAtual) {
        return;
    }

    estado.perfilAtual = perfil;

    /* Na visão geral não há gráfico: nenhuma seleção é mantida. */
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

function iniciarEventos() {
    document.getElementById('alertas-chips').addEventListener('click', (evento) => {
        const chip = evento.target.closest('.alertas-chip');

        if (!chip) {
            return;
        }

        trocarPerfil(chip.dataset.perfil);
    });

    document.getElementById('alertas-abas').addEventListener('click', (evento) => {
        const aba = evento.target.closest('[data-metrica]');

        if (!aba) {
            return;
        }

        estado.metricaAtual = aba.dataset.metrica;
        atualizarAbas();
        desenharLateral();
        desenharLegenda();
        desenharGrafico();
    });

    document.getElementById('alertas-lateral-lista').addEventListener('click', (evento) => {
        const botao = evento.target.closest('[data-servidor]');

        if (!botao) {
            return;
        }

        alternarSelecao(botao.dataset.servidor);
    });

    document.getElementById('alertas-lista').addEventListener('click', (evento) => {
        const chamado = evento.target.closest('[data-chamado]');

        if (chamado) {
            evento.preventDefault();
            return;
        }

        const verPerfil = evento.target.closest('[data-ver-perfil]');

        if (!verPerfil) {
            return;
        }

        const servidor = estado.servidores.find((item) => item.id === verPerfil.dataset.verPerfil);

        if (servidor) {
            trocarPerfil(servidor.perfil, servidor.id);
        }
    });

    document.getElementById('alertas-atualizar').addEventListener('click', (evento) => {
        const botao = evento.currentTarget;
        botao.classList.remove('girando');
        void botao.offsetWidth;
        botao.classList.add('girando');
        atualizarTudo();
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
