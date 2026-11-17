# Histórico horário simulado

48 resumos sintéticos de uma hora, terminando em 29/11/2026 às 22h BRT.
Gerar novamente: `node scripts/gerar-historico-docker-horario.js`.

Preservam a estrutura dos JSONs diários (`schema_version`, `tipo_documento`,
`data`, `endereco_mac`, `resumos.containers`, `logs` e `eventos`) e as estruturas
das métricas. Para compatibilidade, `tipo_documento` permanece `resumo_diario`;
`granularidade: "hora"` e `intervalo: { inicio, fim }` distinguem explicitamente
os resumos horários. As datas dos intervalos são ISO 8601 com fuso UTC.
`data` corresponde à data do fim do intervalo em São Paulo.

Médias, mínimos, máximos e logs referem-se apenas àquela hora. Contadores são
acumulados. Há uma falha e um reinício simulados de `pay-api-04` para teste.
Eventos individuais não são fornecidos. Todos os arquivos têm `dados_simulados: true`.

O filtro de 24 horas usa a última coleta simulada como referência, não o relógio
atual. Isso mantém a demonstração consultável depois da data do cenário. Não é
um feed ao vivo. Em uma integração real, a janela deve terminar no horário atual
e a fonte deve fornecer novos resumos. Os filtros de 7 e 30 dias continuam lendo
`docker-historico`, sem misturar ou duplicar resumos horários com os diários.
