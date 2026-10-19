# Demonstração CoreTrace com cadastro real

## Execução

Use o fluxo normal da aplicação: configure o banco e as variáveis de ambiente conforme o README, execute `npm start` (ou `npm run demo`) e faça login. Acesse `/pages/inicioDashboard.html` pelo endereço e porta configurados. Não há mais catálogo JavaScript nem acesso anônimo à dashboard.

A dashboard consulta **GET /servidor/lista?empresa=…&usuario=…** uma vez por carregamento. A rota existente retorna somente os servidores autorizados para o contexto informado, com MAC, perfil, sistema operacional, configuração Docker e componentes/limites. O usuário e a empresa são informados pelo contexto do login. Falhas de cadastro exibem erro com nova tentativa; uma lista vazia permanece vazia. Não há fallback fictício. A navegação e as permissões são obtidas em `GET /usuario/navegacao?usuario=…`.

O banco precisa conter os cadastros e associações preparados em `src/database/script.sql`: `servidores.endereco_mac`, `componentes_perfil`, `usuario_perfil_servidor`. Não execute o script de criação em um banco existente para atualizar dados: ele é destrutivo. Os inserts do usuário foram preservados.

**Sidebar:** a navegação é filtrada pelas permissões do banco usando o usuário informado pelo `sessionStorage`. Esse controle é apenas visual, sem bloqueio de acesso direto às páginas. CoreTrace e iFood são empresas separadas no SQL atual: a primeira não possui servidores vinculados.

## O que é real e o que é simulado

Empresas, servidores, perfis, nomes, IDs, MACs, componentes, operadores, limites e permissões vêm do cadastro. As receitas em `monitoramentoMock.js` contêm somente parâmetros de métricas vinculados aos MACs dos inserts. Trocar o ID ou renomear o servidor não altera o cenário. Um MAC sem receita aparece com **Dados insuficientes**, traços nas métricas e detalhes sem valores inventados.

Histórico, recursos técnicos, processos, incidentes e previsão permanecem simulados. O esquema atual não cadastra containers. A listagem não consulta uma tabela de containers; os detalhes informam que os dados Docker aguardam coleta quando não foram recebidos.

- `monitoramentoMock.js`: receitas por MAC, relógio central e recortes para os detalhes.
- `dashboardSimulacao.js`: uma geração determinística de 10.081 coletas por servidor reconhecido, incidentes e métricas derivadas. Cache da entrada cadastral e referência temporal.
- `dashboardDados.js`: severidade, KPIs, barras atuais/históricas, previsão e redução de pontos.
- `dashboardGraficos.js`, `inicioDashboard.js`, `detalheServidor.js`: apresentação dos mesmos dados.
- `src/models/servidorModel.js`: MAC e componentes/limites na resposta da rota existente, limitados aos servidores já autorizados.

A referência está em `DATA_REFERENCIA_DEMO`. Pode ser deslocada com `?dataDemo=2026-11-20`, mantendo a coleta final às 14h30 de Brasília e a mesma história relativa. Filtros não geram dados novos.

## História dos sete dias

| Servidor esperado | História simulada |
|---|---|
| cart-api-07 | Picos de almoço nos seis dias anteriores; sobrecarga atual crescente até CPU 97% |
| cart-api-12 | Pressão de CPU em almoços anteriores; 82% na coleta final |
| cart-api-02 | Incidentes anteriores e recuperação no dia final, de cerca de 96% para 44% |
| cart-api-09 | Referência normal com pequenas oscilações |
| pay-db-02 | Crescimento de memória em dias anteriores, recuperação e novo crescimento até RAM 94%; swap compatível |
| pay-api-04 | Memória progressiva, atualmente em 83% |
| pay-api-06 | Ocupação de disco crescendo até cerca de 97%, quatro dias antes da referência; limpeza e recuperação |
| catalog-api-03 | Incidentes de erros/descartes três dias antes e nas últimas 24 horas; atualmente recuperado |
| catalog-api-05 | Crescimento de disco até cerca de 97% no dia anterior; recuperação demonstrável |
| catalog-api-08 | Referência normal |

Janelas de incidentes têm início, crescimento, platô e recuperação. A classificação depende exclusivamente dos limites e operadores cadastrais. Com os limites preparados, o cenário atual resulta em **2 críticos e 2 em atenção**; o Catálogo tem incidentes históricos recuperados. Esses valores não são constantes na interface e mudam se os limites, o escopo ou os cadastros mudarem.

## Semântica dos filtros

- **Perfil:** altera KPIs, barras, evolução e lista dentro do catálogo autorizado.
- **Busca e situação:** filtram a lista; os indicadores continuam mostrando o perfil selecionado.
- **Período:** 15/30 minutos, 1/6/24 horas e 7 dias; altera a evolução e as barras no modo histórico.
- **Barras — Estado atual:** última coleta válida; maior severidade por servidor/recurso.
- **Barras — Histórico do período:** servidores únicos que tiveram alertas no intervalo; cada servidor/recurso aparece uma vez, pela maior severidade observada. Não é a soma de eventos nem o estado atual.
- **KPIs e cards técnicos:** estado da coleta final, explicitamente indicado. Incidentes encerrados não entram em alertas ativos.
- **Detalhes:** os seis períodos alteram todos os gráficos; seletores de CPU lógica, disco e rede preservam o período.

A evolução conta servidores distintos em cada minuto, com precedência crítica. Períodos longos selecionam mínimos e máximos reais por janela, mantendo timestamps e bordas de lacunas. Nos detalhes, a seleção considera CPU, RAM, swap, disco, erros e descartes para preservar incidentes desses recursos. Não há médias apresentadas como valores instantâneos. Médias por núcleo usam todas as coletas do período.

O detalhe mantém os gráficos técnicos e acrescenta ocupação de `/dados` e espaço livre em GB. A soma de memória usada e disponível coincide com a capacidade. CPU por processo/container usa 100% por núcleo lógico. A previsão deriva do crescimento de ocupação até o limite crítico cadastrado; volumes sem tendência não recebem prazo. No cenário pay-db-02, 78% de ocupação com crescimento de aproximadamente 1,214 ponto percentual/dia implica 14 dias até 95%, se esse for o limite do perfil.

## Roteiro das personas

1. **Infraestrutura:** visualize os alertas atuais, compare Carrinho e Financeiro, use a tabela para priorizar servidores. Troque as barras para Histórico e o período para 7 dias: os quatro recursos passam a mostrar os incidentes ocorridos.
2. **Operador:** abra cart-api-07 em 6 horas para investigar CPU, carga e processos; abra pay-db-02 para correlacionar RAM disponível e swap. A seção Docker aguarda dados de coleta, sem exigir cadastro de containers.
3. **Observabilidade:** investigue pay-api-06 em 7 dias e catalog-api-05 em 24 horas para comparar ocupação, espaço livre e I/O. Em catalog-api-03, examine erros, descartes e tráfego em 24 horas. Compare cart-api-02 recuperado com cart-api-07 ainda crítico e consulte os horários na tabela de incidentes.

## Testes

Execute `node --test --test-isolation=none`. Os testes verificam os itens da sidebar para os quatro níveis, o cadastro de empresas e a compatibilidade das consultas com o esquema atual. Usam dados simulados e não executam o script SQL.
