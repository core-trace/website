# <div align="center"><em>website</em></div>

### 1. Clone o repositório

```bash
git clone https://github.com/Core-Trace/CoreTrace-website.git
```

### 2. Acesse o diretorio do projeto

```bash
cd CoreTrace-website
```

### 3. Instale as dependências

```bash
npm install / npm i
```

### 4. Configure as variáveis de ambiente

```
AMBIENTE_PROCESSO=desenvolvimento

DB_HOST=''
DB_DATABASE=''
DB_USER=''
DB_PASSWORD=''
DB_PORT=''

APP_PORT=''
APP_HOST=''
```

### 5. Inicie o projeto

```bash
npm start
```

### Rotas da tabela `usuario`

`POST /usuario/cadastrar` recebe JSON no padrão dos outros controllers:

```json
{
  "nomeServer": "Ana Silva",
  "emailServer": "ana@empresa.com",
  "senhaServer": "senha123",
  "cpfServer": "12345678901",
  "telefoneServer": "11999999999",
  "empresaServer": 1,
  "nivelAcessoServer": 2
}
```

CPF e telefone são opcionais. A empresa e o nível de acesso precisam existir
nas tabelas `empresa` e `nivel_acesso`. O cadastro cria o usuário com status `ATIVO`.

`POST /usuario/autenticar` recebe:

```json
{
  "emailServer": "ana@empresa.com",
  "senhaServer": "senha123"
}
```

O login aceita usuários ativos e retorna `id_usuario`, `nome`, `email`,
`fk_empresa`, `fk_nivel_acesso` e `status`.

### Visibilidade da sidebar

A sidebar consulta `GET /usuario/navegacao?usuario=<ID_USUARIO>`, usando o ID
salvo no `sessionStorage` durante o login. O backend busca as permissões nas
tabelas `usuario`, `nivel_acesso`, `nivel_acesso_permissoes` e `permissoes` e
retorna apenas os itens que devem aparecer. Grupos sem itens não são renderizados.

| Nível | Itens visíveis |
| --- | --- |
| Administrador CoreTrace | Dashboard, Alertas, Perfis de servidor, Equipe e acessos, Empresas |
| Administrador | Dashboard, Alertas, Perfis de servidor, Equipe e acessos |
| Operador | Dashboard, Alertas, Perfis de servidor |
| Visualizador | Dashboard e Alertas |

Este controle é somente visual, sem middleware, sessão por cookie ou bloqueio
de URLs. O nível Administrador CoreTrace não aparece nas opções de perfil de
acesso dos formulários.

### Cadastro de empresas e primeiro administrador

Na dashboard, **Administrador CoreTrace → Empresas** abre o cadastro da empresa junto com seu
primeiro administrador. Razão social, CNPJ, nome e email do responsável são
obrigatórios; endereço, CPF e telefone são opcionais. O servidor define a data
de registro e gera o token de instalação automaticamente.

`POST /empresa/cadastrar` recebe:

```json
{
  "razaoSocial": "Empresa Exemplo",
  "cnpj": "12345678000199",
  "endereco": {
    "logradouro": "Rua Exemplo",
    "numero": "100",
    "cidade": "São Paulo",
    "estado": "SP"
  },
  "administrador": {
    "nome": "Ana Silva",
    "email": "ana@empresa.com"
  }
}
```

O perfil **Administrador** deve existir em `nivel_acesso`. Empresa, endereço
e usuário são gravados na mesma transação. O usuário recebe status `PENDENTE`
e o convite do fluxo existente do Resend para definir a senha e ativar a conta.
Se o envio do convite falhar, a transação é desfeita.

Configure `RESEND_API_KEY`, `RESEND_FROM` (remetente autorizado no Resend) e
`APP_URL` (endereço público do site) no ambiente do servidor. O cadastro retorna
os IDs da empresa e do usuário, sem expor os tokens. Ao entrar, o administrador
terá `fk_empresa` da nova empresa salvo em `sessionStorage.ID_EMPRESA`, usado
pelo download do agente para buscar o token de instalação no banco.

### Download do agente

Ao concluir o wizard, a tela de sucesso mostra o perfil criado e oferece o
**Download do pacote ZIP**. O botão envia `sessionStorage.ID_EMPRESA` e o
`id_perfil_servidor` retornado por `POST /servidor/perfis` para
`POST /agente/download`. O ID não é fixo. Na página de perfis,
cada card também tem **Baixar agente ZIP**, que usa o ID daquele perfil.

Depois de baixar, extraia o ZIP e, dentro da pasta `agente`, execute `instalar.sh` e depois `iniciar.sh`:

```bash
unzip agente.zip
cd agente
bash instalar.sh
bash iniciar.sh
```

A rota consulta `empresa.token_instalacao` e `perfil_servidor.token_perfil_servidor`,
verificando se o perfil pertence à empresa. O [Archiver](https://www.archiverjs.com/docs/quickstart/)
gera `agente.zip` com a pasta `agente` e seu `config.json` preenchido com esses tokens.
O arquivo de configuração original permanece como modelo para os próximos downloads.
Caches Python e `node_modules` ficam fora do ZIP.

O banco deve conter a coluna `perfil_servidor.token_perfil_servidor`, conforme
`src/database/script.sql`. Para uma instalação anterior que ainda não tem essa coluna,
`src/database/atualizar_token_perfil_servidor.sql` adiciona os tokens preservando os registros.

### Ativação do agente Python

`POST /servidor/ativarAgente` recebe os campos enviados por `captura.py`:

```json
{
  "tokenInstalacaoServer": "123",
  "tokenPerfilServidorServer": "321",
  "enderecoMacServer": "AA:BB:CC:DD:EE:01"
}
```

A rota valida os tokens em `empresa` e `perfil_servidor`, conforme `src/database/script.sql`.
Se o MAC ainda não existir, cadastra em `servidores` com nome `Servidor <MAC>` e status `ATIVO`.
Se já pertencer ao mesmo perfil, atualiza seu status para `ATIVO` sem duplicar o cadastro.
Ambos os casos retornam HTTP `200`, como o Python espera. Um MAC de outro perfil retorna `409`;
tokens inválidos retornam `403` e campos ausentes ou inválidos retornam `400`.

### Página de teste: cadastro com convite por email

Com `npm start`, abra `http://localhost:3333/pages/cadastro-teste.html`
(ajuste a porta conforme o `.env.dev`). A página é HTML simples, sem CSS.

Preencha nome, email, CPF e telefone (opcionais), ID da empresa e ID do nível
de acesso. A empresa e o nível precisam existir no banco.

O formulário usa `POST /convites/criarConvite`. O usuário é criado como `PENDENTE`,
com `token_acesso` gerado no servidor. O Resend envia o link para definir a senha
na página de ativação. Ao concluir, o status muda para `ATIVO`, o token é removido
e o usuário pode fazer login.

Configure no `.env.dev`:

```dotenv
RESEND_API_KEY=sua_chave_do_resend
RESEND_FROM=seu_remetente_no_resend
APP_URL=http://localhost:3333
```

`RESEND_FROM` é opcional e usa `onboarding@resend.dev` por padrão. Esse remetente
de teste só envia ao email da própria conta Resend. Para enviar a outras pessoas,
configure um remetente de um domínio verificado, conforme a
[documentação do Resend](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

`APP_URL` define o endereço do site no link do email; use uma URL acessível ao destinatário para
ativação em outro dispositivo. Sem `APP_URL`, são usados `APP_HOST` e `APP_PORT`.

Se o Resend recusar o envio, o cadastro pendente é desfeito para permitir nova
tentativa. A página só confirma o envio após o Resend aceitar a solicitação.

### Perfis de servidor e wizard

A página `/pages/inicioDashboard.html` usa um histórico local de sete dias para os dez servidores. Os filtros de tempo e perfil atualizam os KPIs e os gráficos. A previsão de armazenamento exige pelo menos 24 horas de histórico; a tabela e os detalhes mostram também os valores da última coleta.

Execute `npm start` com o banco configurado para login e administração. Os dados de monitoramento não dependem da API de servidores. Após alterar as métricas do cenário, execute `npm run gerar:resumo` para atualizar o resumo usado na dashboard e nos alertas.

O link “Perfis de servidor” leva a `/pages/perfisServidor.html`,
que lista os perfis com `GET /servidor/perfis?empresa=<ID_EMPRESA>` usando a empresa
do `sessionStorage`. A consulta retorna nome, descrição e quantidade de servidores
vinculados; uma lista vazia e um erro de conexão têm estados distintos na tela.

O botão “Adicionar perfil de servidor” abre o mesmo modal, definido em
`public/components/wizardPerfilServidor.html`, com CSS e JavaScript próprios.
As cinco etapas são enviadas juntas em `POST /servidor/perfis`. O cadastro salva
nome, descrição, sistema operacional, opção de Docker, métricas, limites de alerta
e equipe em uma transação. O token do perfil é gerado no servidor.

A estrutura necessária para o wizard está definida em `src/database/script.sql`.
Não use o script de criação para atualizar um banco existente: ele apaga os dados.

Exemplo do corpo do cadastro:

```json
{
  "empresa": 1,
  "proprietario": 1,
  "nome": "Produção",
  "descricao": "Servidores da aplicação",
  "sistemaOperacional": "linux",
  "monitorarDocker": false,
  "metricas": [{ "id": 1, "operador": ">", "atencao": 70, "critico": 90 }],
  "equipe": [{ "id": 2 }]
}
```

O proprietário deve estar ativo e pertencer à empresa. Na etapa Equipe, selecione
um colaborador pelo nome e email e clique em Adicionar. A busca usa
`GET /servidor/membros-disponiveis?empresa=1&proprietario=1&perfil=0`.
O perfil `0` representa um cadastro novo. Para um perfil existente, informe seu ID:
a consulta exclui quem já está em `usuario_perfil_servidor`. Também exclui o
proprietário, usuários inativos e usuários de outras empresas. Quem já foi
selecionado no formulário sai das opções até ser removido da equipe.
O vínculo registra somente o usuário e o perfil, conforme o esquema atual, sem alterar o nível global do usuário. Alertas aceitam `>`, `>=`, `<` e `<=`; ambos os limites podem ser `null`.
A resposta `201` contém `mensagem` e `id_perfil_servidor`; erros de validação retornam `400`,
proprietário inválido retorna `403` e falhas de persistência retornam `500`.

Após salvar, o wizard mostra a conclusão com o download e atualiza a lista de
perfis. Ao fechar a conclusão, o formulário é limpo para um novo cadastro. Em caso de erro,
o preenchimento é preservado para correção. A opção de Docker e os operadores são
persistidos; sua execução pelo agente não faz parte desta rota.

As telas enviam os IDs de empresa e usuário armazenados no `sessionStorage`, seguindo o fluxo existente.

O login direciona para `/pages/inicioDashboard.html`. A navbar usa o `sessionStorage` para mostrar nome, iniciais e nível de acesso; os itens da sidebar vêm de `/usuario/navegacao`. O menu da conta
mostra apenas o email do usuário e o botão Sair. O nome da empresa e o nível de acesso vêm dos
joins com `empresa` e `nivel_acesso` na consulta de login.

### Edição de perfis

Na página de perfis, **Editar perfil** abre os dados atuais no wizard. A edição
permite alterar nome, descrição, sistema operacional, Docker, métricas e limites
de alerta, inclusive adicionar métricas a perfis que já têm servidores vinculados.
A equipe e o token do perfil são preservados.

`GET /servidor/perfis/:id?empresa=<ID_EMPRESA>` carrega o perfil e suas métricas.
`PUT /servidor/perfis/:id` recebe os mesmos dados de monitoramento do cadastro,
com `empresa` e `proprietario` (ID do usuário logado); o campo `equipe` não é
alterado nesta rota. O salvamento atualiza o perfil e seus limites em uma transação.

No cadastro, as métricas começam desmarcadas. **Aplicar perfil recomendado** marca
as métricas indicadas pelo catálogo. Na edição, aparecem as métricas já salvas.

### Equipe e acessos

`/pages/general-employee.html` lista os colaboradores da empresa do usuário logado,
com busca por nome/email e filtro pelo perfil de acesso ao site.
**Cadastrar funcionário** abre um formulário na própria página com nome, email,
CPF e telefone opcionais, empresa preenchida automaticamente e seleção do perfil
pelo nome. O cadastro usa `POST /convites/criarConvite`, como a página de teste.
Ao concluir, a lista é atualizada e o colaborador aparece com convite pendente
até definir a senha pelo email de ativação.

`GET /usuario/equipe?empresa=<ID_EMPRESA>` retorna `empresa`, `membros` e
`perfisAcesso`. A consulta de membros usa `usuario.fk_empresa`. Os perfis vêm de
`nivel_acesso` (Administrador, Operador, Visualizador ou outros níveis cadastrados).
No `script.sql` atual, essa tabela é compartilhada entre as empresas; não existe
um vínculo de níveis por empresa. A seleção é salva em `usuario.fk_nivel_acesso`
e não altera os vínculos de `usuario_perfil_servidor` nem vincula o funcionário a servidores.

Para alterar um usuário já cadastrado, selecione o perfil na linha do colaborador
e clique em **Salvar**. `PATCH /usuario/:id/perfil` recebe `empresa` e `nivelAcesso`
como números, valida o nível escolhido e atualiza somente o usuário da empresa
informada. A edição também está disponível para convites pendentes. Ao alterar o
próprio usuário, o nível no `sessionStorage` e na navbar é atualizado após salvar.


### Endpoints de configuração da captura

A API do site atende também os endpoints de captura, na mesma porta de `npm start` (3333 na configuração local):

- `GET /empresa/metricas`: retorna as métricas vinculadas ao perfil. Envie `Authorization: Bearer <token_instalacao>` e `token-perfil: <token_perfil_servidor>` nos headers. O retorno mantém os campos de captura usados pelo agente (`nome_coluna`, `funcao_psutil`, argumentos, atributo, índice e unidade).
- `GET /empresa/listarLimites/:idPerfil`: retorna os limites do perfil, incluindo `operador`, `limite_atencao`, `limite_critico`, `operador_2`, `limite_atencao_2` e `limite_critico_2`. Os campos `componente` e `unidade` foram preservados.

As respostas de consulta são listas JSON; consultas sem resultados retornam `[]`. Headers ausentes ou malformados retornam 401, IDs inválidos retornam 400 e falhas de banco retornam 500.

O agente distribuído pelo site usa `API_BASE_URL` em `src/agente/capturas/captura.py` para ativação e consulta das métricas. Não é necessário iniciar uma API na porta 3334. Em instalações antigas do agente, atualize essa URL para o endereço e a porta da API do site, ou baixe novamente o pacote.
