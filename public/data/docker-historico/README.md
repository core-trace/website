# Resumos Docker simulados — CoreTrace

Este diretório contém um cenário fictício para testar a dashboard de
investigação de contêineres. Ele NÃO contém dados do S3 ou do banco.

Os índices em `servidores/<MAC>/indice.json` usam os endereços MAC dos dez
servidores cadastrados nos inserts de demonstração de `src/database/script.sql`.
Cada servidor tem seu próprio conjunto de arquivos, com o MAC, nome e perfil
correspondentes. Os nomes, IDs e métricas dos contêineres são simulados e
isolados por servidor para permitir validar a troca de contexto na tela.

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

## Seleção de servidor

A página usa `GET /servidor/lista` para popular o seletor e escolhe o índice
local usando o MAC do servidor. O cenário do servidor escolhido alimenta os
gráficos, KPIs, tabela e logs. Quando houver endpoint de histórico real, a
função de carregamento poderá trocar a origem dos índices mantendo o mesmo
contrato e a associação pelo MAC.

## Âncoras de referência

O histórico simulado permite calcular uma **média dos dias anteriores** para
comparar com a utilização atual, sem impor um limite de alerta. Essa linha
de referência precisa ser implementada nos datasets do Chart.js; os JSONs
apenas fornecem os valores necessários.
