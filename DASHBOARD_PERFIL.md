# Backend da DashboardPerfil

Rota: `GET /servidor/dashboard-perfil?empresa=1&usuario=1`.
O model busca servidores, perfis e limites do banco. O controller lê os lotes da
Gold e classifica todas as métricas cadastradas, sem precisar de service.

A origem padrão é `scripts-captura/amostras_etl_local/gold_exemplo.json`.
Para gerar a amostra, execute `python scripts-captura/validar_etl_local.py` na raiz.
Para testar vários servidores, use um JSON contendo uma lista de lotes Gold e
configure CORETRACE_GOLD_LOCAL em `.env.dev` com o caminho desse arquivo.
O caminho é configuração do servidor, não um parâmetro enviado pelo navegador.

Com MySQL configurado e as dependências instaladas, execute `npm start` na pasta
website. Os IDs da consulta devem existir e ter acesso aos servidores. Os MACs dos
lotes precisam corresponder aos servidores cadastrados. As amostras são sintéticas
e a última leitura inclui erros deliberados; indisponível é esperado nesses casos.

A resposta contém servidores com saúde e detalhes por métrica; perfis com totais,
normal, atenção, crítico, indisponível e limites; rankingCriticos por percentual;
kpis com perfis configurados e perfis empatados com mais críticos em quantidade.
O percentual usa todos os servidores visíveis do perfil. Perfis sem servidores
continuam presentes. A unidade precisa coincidir entre o banco e a Gold.

A saúde usa o pior resultado: crítico, atenção, indisponível, normal. Métricas sem
limites não participam; sem nenhuma avaliação válida a saúde é indisponível.
Não é usado um valor antigo se a última captura da métrica estiver indisponível.

Ativos/inativos por tempo permanecem para depois: atividadeTemporalImplementada é
false. O frontend ainda precisa ser conectado à rota. Não houve alteração na ETL
nem no banco. O projeto recebe IDs na consulta; na publicação, use a identidade da
sessão autenticada, porque esses parâmetros não autenticam o solicitante.

Teste local: `node tests/dashboardPerfil.test.js` na pasta website. Verifica as
regras sem banco/S3; o teste HTTP/SQL ainda depende do ambiente configurado.
