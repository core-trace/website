# Resumos Docker simulados — CoreTrace

Este diretório contém **12 arquivos totalmente fictícios** para testar a
dashboard de investigação de contêineres. Eles NÃO são dados do S3.

- Período: **18 a 29/11/2026**.
- Cenário: aumento progressivo de demanda na Black Friday de 27/11.
- Contêineres: `api-java`, `pay-api-04`, `orders-api-02`, `mysql` e `redis-cache-01`.
- O consumo médio e os picos aumentam até 27/11 e diminuem depois.
- Em 27/11, `pay-api-04` e `orders-api-02` apresentam encerramentos com erro.
- Em 28/11, seus contadores de reinício aumentam.
- Logs são **contagens por nível**, não mensagens textuais individuais.
- Não há regras de alerta nem chamados, conforme o escopo da dashboard Docker.

## Estrutura dos arquivos

Cada `data=AAAA-MM-DD/resumo.json` usa o mesmo contrato principal do Gold:

```json
{
  "schema_version": 1,
  "tipo_documento": "resumo_diario",
  "data": "2026-11-27",
  "endereco_mac": "00:00:00:00:00:00",
  "dados_simulados": true,
  "resumos": {
    "containers": [],
    "logs": [],
    "eventos": []
  }
}
```

Os arrays são preenchidos nos arquivos gerados. Preservamos as estruturas de
`cpu.uso`, `memoria.uso`, `memoria.utilizada`, `memoria.limite`, `pids.atuais`,
`rede`, `disco`, `reinicios`, logs por nível e eventos agregados. As outras
métricas do host foram omitidas porque a dashboard Docker não as consome.

## Testar na dashboard atual

No `public/pages/docker.html`, localize a tag `<body>` e **acrescente somente**
o atributo abaixo, preservando os demais atributos e suas alterações de layout:

```html
data-fonte-historico="../data/docker-historico-simulado/indice.json"
```

O `dockerDashboard.js` já reconhece esse atributo. Não é necessário substituir
os JSONs reais nem alterar os arquivos de JavaScript.

Abra a página pelo servidor HTTP do projeto e selecione `api-java` ou
`pay-api-04`. O filtro de 30 dias mostra 12 pontos; o filtro de 7 dias mostra
os sete últimos dias da simulação.

Para voltar aos resumos reais, **remova o atributo** `data-fonte-historico`.

## Regerar o conjunto

Na raiz do projeto:

```bash
node scripts/gerar-historico-docker-simulado.js
```

O gerador está em `scripts/gerar-historico-docker-simulado.js` e escreve apenas
na pasta `public/data/docker-historico-simulado/`. As pastas com dados reais
anonimizados em `public/data/docker-historico/` não são modificadas.

## Âncoras de referência

O histórico simulado permite calcular uma **média dos dias anteriores** para
comparar com a utilização atual, sem impor um limite de alerta. Essa linha
de referência precisa ser implementada nos datasets do Chart.js; os JSONs
apenas fornecem os valores necessários.
