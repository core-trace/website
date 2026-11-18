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

Os arquivos atuais fornecem contagens agregadas, sem mensagens originais. Os
painéis mostram a limitação em vez de gerar texto ou timestamps. O adaptador
também aceita registros individuais, quando disponibilizados na mesma fonte:

```json
{
  "container_id": "id-do-container",
  "nome": "nome-do-container",
  "registros": [
    {
      "timestamp": "2026-11-17T14:19:04.331-03:00",
      "nivel": "ERROR",
      "mensagem": "Texto original fornecido pela fonte"
    }
  ]
}
```

Esse grupo fica em `resumos.logs`. Em `resumos.eventos`, cada registro usa
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
leituras instantâneas ou registros individuais de logs/eventos. A fonte incluída
tem um servidor e não informa o perfil. “Sem dados” nesses casos é intencional.

## Verificação

`node --test tests/*.test.js` executa os testes de cálculos existentes e os testes
de janelas, comparação, falhas, taxas, lacunas e registros individuais.
O projeto serve HTML/CSS/JS diretamente e não possui etapa de build do front-end.
