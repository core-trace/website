# AGENTS.md - CoreTrace

## 1. Contexto

CoreTrace é uma plataforma web de monitoramento de infraestrutura. Agentes Python instalados nos servidores coletam métricas, que passam por um data lake na AWS e são exibidas em dashboards pela plataforma Web-Client (Node + HTML/CSS/JS).

O problema: equipes de infraestrutura têm dificuldade de saber onde estão os problemas, qual priorizar e como eles começaram. Cada dashboard do projeto existe para responder às dores de uma persona.

### Personas

**Marcelo, Operador de Servidores.** Atua direto na operação, responde primeiro a incidentes e lida com várias ocorrências ao mesmo tempo. Precisa de informação em tempo real.
- Dor: perceber rápido quando um servidor apresenta anomalia.
- Dor: saber qual recurso (CPU, memória, armazenamento) causa o estado de atenção ou crítico.
- Dor: falta de informação objetiva sobre onde atuar primeiro.
- Quer: alertas claros em situações críticas e identificar rápido o componente que exige intervenção.

**Eduardo, Engenheiro de Infraestrutura.** Foca em disponibilidade e estabilidade, acompanha o estado geral dos servidores e prioriza o que exige mais atenção.
- Dor: saber quais servidores concentram mais anomalias.
- Dor: entender quais problemas priorizar.
- Quer: identificar recorrências e padrões entre servidores, acompanhar a evolução das anomalias no tempo e ter informação resumida para direcionar a equipe.

**Amanda, Engenheira de Observabilidade.** Investiga a origem das anomalias, usa métricas históricas e relaciona recursos e eventos diferentes.
- Dor: identificar quando uma anomalia começou.
- Dor: relacionar alterações entre recursos do servidor e consultar histórico durante a investigação.
- Dor: falta de contexto para achar a origem; precisa da sequência de eventos antes do problema e de padrões recorrentes.

### Arquitetura alvo

Fluxo de dados: Agente Python (servidores) → S3 `/Raw` → Lambda → ETL 1 (validação e limpeza) → S3 `/Trusted` → Lambda → ETL 2 (formatação para consumo) → S3 `/Client`.

Na EC2, em containers Docker: MySQL, ETL 1, ETL 2, Plataforma Web-Client (Node + HTML/CSS/JS) e o serviço de Alertas (Java, detecção de anomalias). Alertas se integram com Jira (gestão de incidentes) e Slack (comunicação).

O diagrama é o alvo. O repositório pode ainda não ter tudo (por exemplo, não há serviço Java aqui). Confira no código antes de depender de qualquer componente.

## 2. Objetivo

Entregar o CoreTrace completo: seis dashboards dinâmicas (dados reais, não simulados), cada uma respondendo às dores de uma persona, com billing, integração com Jira e Slack, relatórios, ETL v2 e a aplicação em container no ar em uma instância EC2.

O agente deve ajudar a construir os entregáveis listados no escopo. Todos precisam ser feitos; nenhum tem prioridade sobre os outros.

## 3. Escopo

### Dentro do escopo

- Integração com Jira e Slack 100% funcional.
- Documentação do projeto atualizada.
- Dashboards prontas e dinâmicas, incluindo billing.
- Agendamento de tarefas.
- Geração de relatórios em PDF ou CSV.
- Diagrama de Classes final.
- Diagrama de Sequência.
- Infraestrutura implementada em container, com imagem do Docker Hub.
- Deploy da aplicação em instância EC2.
- Levantamento do custo da infraestrutura.
- ETL v2.
- Estatística das informações de manutenção das máquinas (notebook de análise do projeto, EDA).
- Customização da aplicação de captura de dados para consumir dados externos (por exemplo, clima/tempo).
- Previsão de billing (nuvem) com dashboard individual.

### Fora do escopo

- PPT da apresentação, projeto individual e a apresentação da Sprint 3 (demonstração da solução). São entregas dos alunos, não do agente.
- Novos dados simulados ou mockados: as dashboards devem ser dinâmicas.
- Autorização por nível de acesso no servidor, bundler ou framework de front-end.

## 4. Funcionalidades

### Dashboards

Cada pessoa do grupo trabalha em dashboards diferentes. Em cada sessão, a persona a considerar é a da dashboard que está sendo construída (por exemplo, quem faz Alertas e Servidores trabalha com Marcelo; quem faz Docker e Processos trabalha com Amanda). Se não estiver claro qual dashboard a sessão está desenvolvendo, pergunte.

| Dashboard | Persona | O que precisa mostrar |
|---|---|---|
| Alertas | Marcelo | Alertas ordenados por severidade, recurso que causa o estado crítico e o servidor afetado |
| Servidores | Marcelo | Estado de cada servidor em tempo real, com CPU, memória e armazenamento |
| Geral | Eduardo | Visão agregada, ranking de servidores com mais anomalias, evolução no tempo |
| Perfis de servidor + billing | Eduardo | Perfil de cada servidor e custo associado (billing) |
| Docker | Amanda | Métricas e histórico dos containers, com contexto para investigação |
| Processos | Amanda | Processos por servidor ao longo do tempo, correlação com anomalias |

### Funcionalidades de apoio

- **Integração Jira e Slack:** alerta crítico gera incidente no Jira e notificação no Slack.
- **Relatórios:** exportação em PDF ou CSV.
- **Agendamento de tarefas:** execução programada de rotinas (por exemplo, relatórios e coletas).
- **Billing e previsão:** custo atual por servidor e previsão de custo na nuvem, com dashboard individual.
- **Captura de dados externos:** o agente Python também consome fontes externas (por exemplo, clima/tempo).
- **ETL v2:** nova versão do tratamento de dados entre `/Raw`, `/Trusted` e `/Client`.
- **Análise exploratória (EDA):** notebook com estatísticas das informações de manutenção das máquinas.
- **Infraestrutura:** containers com imagens do Docker Hub e deploy em EC2.

### Ao criar ou alterar uma dashboard

1. Identifique a persona da dashboard e leia as dores dela.
2. Reaproveite componentes e estilos de `public/` antes de criar novos.
3. Confirme que existem rota, controller e model para os dados. Sem isso, a dashboard não é dinâmica.

## 5. Regras de negócio

### Execução do projeto

- `npm install` e `npm start` (porta padrão `3333`). `npm run dev` usa `nodemon`, que não está nas dependências; só funciona se estiver instalado globalmente.
- Não há testes, lint, formatter, typecheck, build nem CI. A verificação é subir a API e testar rotas e páginas manualmente.
- `app.js` fixa `ambiente_processo = "desenvolvimento"` e sempre carrega `.env.dev`; a variável `AMBIENTE_PROCESSO` do arquivo é inerte. Comece copiando `.env.dev.example` para `.env.dev`.

### Banco e variáveis de ambiente

- MySQL 8. `src/database/script.sql` começa com `DROP DATABASE IF EXISTS coretrace`: use só em banco novo, nunca para atualizar instalação existente. Mudanças em banco existente exigem script de migração novo.
- O README cita `src/database/atualizar_token_perfil_servidor.sql`, mas o arquivo não existe.
- `src/services/alertaService.js` usa `AWS_REGION`, `S3_BUCKET` (padrão `bucket-coretrace`), `S3_PREFIX` (padrão `client/lotes/`), `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY` e as credenciais AWS padrão do SDK. Todas estão registradas no `.env.dev.example`; sem as variáveis do Jira a busca de chamados retorna vazia e o KPI de resolução fica em `—`. Toda variável nova deve ser registrada no `.env.dev.example`.

### Fluxo de código

- `app.js` → `src/routes/*` → `src/controllers/*` → `src/models/*` (MySQL em `src/database/config.js`) → `src/services/*`.
- A dashboard de Alertas consulta o Jira por `src/services/jiraChamadosService.js`: cache em memória por empresa com TTL de 5 min, JQL paginada por etiqueta e vínculo por etiqueta ou MAC do título. Concluído = `status.statusCategory.key === "done"`; a data de conclusão usa `resolutiondate` com fallback `updated`. Não há tabela, migração ou S3 novo. `GET /alertas/servidores` devolve `resolucaoChamados.geral` e `.porPerfil[id]`; servidores em alerta com todos os chamados concluídos saem da resposta, enquanto os normais continuam.
- Não há sessão por cookie nem autorização no servidor. O login grava `ID_USUARIO`, `ID_EMPRESA`, `ID_NIVEL_ACESSO` etc. no `sessionStorage`, e as páginas enviam esses IDs nas queries. O controle de nível é só visual; URLs não são bloqueadas. Não trate isso como segurança.
- O agente Python fica em `src/agente`. O ZIP de `POST /agente/download` é montado em tempo real pelo `archiver`; `config.json` é só modelo e recebe os tokens do banco no download. `API_BASE_URL` está fixo em `http://localhost:3333` em `src/agente/capturas/captura.py`.
- Cadastro de empresa e convites usam Resend dentro de transação: se o envio falhar, o rollback desfaz o usuário/empresa. `RESEND_FROM=onboarding@resend.dev` só entrega ao e-mail da própria conta Resend.
- Regras de validação de campos, duplicidade e restrições de edição e exclusão não foram levantadas neste documento: confira no código antes de alterar cadastros.

### Restrições para o agente

- Não invente rotas, tabelas, variáveis de ambiente ou serviços; confira no código.
- Não rode `script.sql` em banco que já tenha dados.
- Não adicione dependências, bundler ou framework de front sem o usuário pedir.
- Nunca coloque tokens, senhas ou chaves em arquivos versionados.
- Responda e comente em português do Brasil, no estilo do código existente.

## 6. Interface

- Front estático em `public/` (`express.static`), em HTML, CSS e JavaScript puros, sem bundler. Chart.js é vendor local em `public/scripts/vendor/`; não use CDN.
- A sidebar vem de `GET /usuario/navegacao`; cada dashboard é uma página dessa navegação.
- Identidade visual da CoreTrace (vermelho, preto e branco, como nos materiais do projeto). Reaproveite os estilos já existentes em `public/`.
- Diretrizes por persona:
  - **Marcelo (Alertas, Servidores):** status e severidade visíveis de relance, ordenação por prioridade, recurso culpado em destaque, pouco texto.
  - **Eduardo (Geral, Perfis + billing):** visão agregada, rankings, tendências no tempo, comparação entre servidores, custo ao lado do perfil.
  - **Amanda (Docker, Processos):** séries temporais com seleção de intervalo, métricas correlacionadas na mesma linha do tempo, drill-down com contexto.
- Mensagens ao usuário em português do Brasil, claras e objetivas. Estados de carregamento, vazio e erro devem existir em toda dashboard.

## 7. Critérios de aceitação

- Cada uma das seis dashboards existe, abre pela sidebar e responde às dores da persona indicada na seção 4.
- Todas as dashboards exibem dados vindos do banco ou da API, não de arquivos simulados.
- A dashboard de perfis de servidor mostra o billing, e existe um dashboard individual com previsão de billing na nuvem.
- Um alerta crítico cria um incidente no Jira e envia uma mensagem no Slack.
- É possível exportar um relatório em PDF ou CSV, e há tarefas agendadas funcionando.
- O agente Python coleta ao menos uma fonte de dados externa e envia ao fluxo de dados.
- A ETL v2 gera dados válidos em `/Trusted` e `/Client`.
- O notebook de EDA com as estatísticas de manutenção das máquinas está no repositório.
- A aplicação sobe em container a partir de imagem do Docker Hub e está acessível na instância EC2.
- Os diagramas de classes e de sequência finais e a documentação do projeto estão atualizados no repositório.
- O custo da infraestrutura está documentado.
