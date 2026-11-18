# Dashboard Docker — layout de investigação

## Componentes e fontes

- `public/pages/dockerDashboard.html`: estrutura, filtros, quatro KPIs do servidor,
  tabela, detalhes, seis gráficos e painéis históricos.
- `public/css/docker.css`: apresentação e breakpoints, com navegação compartilhada.
- `public/scripts/dockerDashboard.js`: carregamento via `fetch`, seleção e Chart.js.
- `public/scripts/dockerAnalise.js`: janelas temporais, cobertura, indicadores e taxas.

Os índices e o contrato principal dos resumos existentes são preservados.
`data-fonte-historico` no `body` configura o índice principal; `data-fonte-horario`
configura uma fonte opcional de resumos com `intervalo.inicio` e `intervalo.fim`.
Os dois índices precisam pertencer ao mesmo MAC e declarar o mesmo modo
`demonstracao`. A fonte temporal é usada para métricas quando disponível; não
somamos seus totais aos resumos diários. Falha na fonte temporal mantém a fonte
principal disponível, com aviso.

Para disponibilizar mais servidores/perfis com fontes já existentes, o `body`
pode receber `data-fontes-docker` com um array JSON de objetos:
`{ id, nome, perfil, historico, horario }`. `id` e `historico` são obrigatórios;
os caminhos são URLs relativas à página ou absolutas. Não há rota nova de API.
O índice também pode informar `nome_servidor` e `perfil`. Sem catálogo/metadados,
apenas o servidor configurado é oferecido, com perfil não informado. Os selects
com uma única opção ficam desabilitados; não se inventam perfis/servidores.

## Regras temporais

- Filtros: 30 minutos, 60 minutos e 1.440 minutos. Comparação com o intervalo
  imediatamente anterior de igual duração, sem sobreposição na fronteira.
- Fontes reais usam o relógio atual. Demonstrações usam o fim do último resumo,
  explicitamente informado na interface. Reconsulta a cada 60 segundos enquanto
  a página está visível, preservando filtro e seleção.
- Totais e picos exigem resumos com cobertura integral do intervalo. Um resumo
  horário não é dividido em dois blocos de 30 minutos. Ausência é `—`, nunca zero.
- Falhas: saída diferente de zero ou OOM, com `finished_at` dentro do período;
  mesmo ID + encerramento são contados uma só vez. Estado atual é independente.
- Reinícios: diferença do contador do mesmo ID, com referência no início do
  período. Recriações, resets e lacunas não são apresentados como reinícios zero.
- Erros: níveis ERROR/ERR dos resumos. Níveis desconhecidos impedem uma comparação
  completa; erros explicitamente confirmados ainda podem ser exibidos.
- Rede/disco: `(contadorFinal - contadorInicial) / 1.024² / segundosEntreLeituras`.
  Leituras devem ser consecutivas, válidas, do mesmo ID e ciclo de execução.
- Throttling: delta de nanossegundos convertido em segundos por intervalo entre
  leituras. Os resumos horários não permitem afirmar segundos por coleta original.
- Memória: bytes convertidos em MB (convenção existente de 1.024² bytes). A linha
  de limite usa o último limite Docker informado; valor zero/ausente não cria linha.
- Detalhes atuais exigem `ultimo_valor`; uma `media` não substitui a leitura atual.
  Os gráficos de CPU, memória e PIDs identificam médias de intervalos nos tooltips.

## Logs e eventos individuais opcionais

### Filtro exclusivo dos logs

O formulário **Início / Fim / Filtrar logs** atua somente nas mensagens do
container selecionado, usando todo o histórico carregado. Alterar o período dos
gráficos não altera os limites aplicados aos logs. Datas são interpretadas em
Brasília (UTC−03:00), independentemente do fuso do navegador; o início inclui
o segundo zero e o fim inclui todo o minuto escolhido (até 59,999 segundos).
É possível deixar uma ou ambas as datas vazias para não limitar esse extremo.
**Últimas 24 horas** é selecionado por padrão e preenche as datas automaticamente.
Em fontes simuladas, usa o último log disponível do container como âncora; em
fontes reais, usa o horário atual. Aplicar datas personalizadas desativa o botão;
clicá-lo restaura as últimas 24 horas. Deixar ambas as datas vazias e aplicar
permite consultar o histórico completo. Nível, busca e ordenação continuam
funcionando em conjunto. Datas invertidas são rejeitadas, mantendo o último
filtro válido. O terminal renderiza a mensagem original como texto, inclusive
quebras de linha, sem interpretar HTML.

**Baixar logs** exporta apenas as mensagens exibidas, na ordenação atual, em
arquivo `.log` UTF-8. Cada registro inclui o timestamp original (preservando a precisão e o fuso), nível e
mensagem original. Sem mensagens ou sem seleção, o botão fica desabilitado.

Os JSONs locais seguem o contrato de logs do arquivo de referência `resumo (6).json`:
`logs` na raiz contém registros individuais; `resumos.logs` mantém os totais por
container e nível. As métricas dos containers são preservadas. Exemplo de registro
no array `logs` (na raiz):

```json
{
  "timestamp": "2026-11-17T14:19:04.331-03:00",
  "container_id": "id-do-container",
  "nome": "nome-do-container",
  "nivel": "ERROR",
  "mensagem": "Texto original fornecido pela fonte",
  "id_captura": "identificador-unico-da-captura"
}
```

O nível informado é respeitado: texto contendo “Erro” com nível `UNKNOWN` não
é automaticamente contado como ERROR. Mensagens `null` mantêm o registro, sem
inventar conteúdo. `id_captura` evita duplicações entre documentos; a precisão
original dos timestamps é mantida na exportação.

Para compatibilidade, grupos com `registros` em `resumos.logs` ainda são lidos
quando não houver logs individuais na raiz. Em `resumos.eventos`, cada registro usa
`timestamp`, `tipo` e `descricao`, com `id` opcional. Também são aceitos registros
diretos com `container_id` em vez de grupos. É suporte opcional do front-end,
não uma indicação de que o backend atual já fornece esses campos.

Registros são deduplicados; a associação prefere o ID, sem misturar recriações
de mesmo nome. Logs e lista de eventos usam todo o histórico disponível do ID.
Somente eventos com timestamp real dentro do filtro geram marcadores verticais
nos gráficos, com horário, tipo e descrição ao passar o mouse.

## Limitações da fonte incluída

Os dados locais continuam simulados, como declarados nos índices; nenhum JSON
foi substituído pelo exemplo do Figma. Resumos horários não suprem os 30 minutos,
leituras instantâneas ou registros individuais de eventos. A fonte incluída
tem um servidor e não informa o perfil. “Sem dados” nesses casos é intencional.

As mensagens locais são simuladas e identificadas por `[SIMULADO]`. Para gerar
ou sincronizar os logs, execute `node scripts/atualizar-logs-docker-simulados.js`.
O script atualiza os 12 resumos diários e os 48 horários usados pela dashboard,
recalcula `resumos.logs` a partir das mensagens e reutiliza as mesmas capturas
nas janelas sobrepostas. O gerador horário também executa essa sincronização.
O JSON real de referência e o arquivo de exemplo anonimizado não são alterados.

## Verificação

`node --test tests/*.test.js` executa os testes de cálculos existentes e os testes
de janelas, comparação, falhas, taxas, lacunas e registros individuais.
O projeto serve HTML/CSS/JS diretamente e não possui etapa de build do front-end.
