# História de usuário — Login do painel (versão 2)

**Estado:** aguardando aprovação (ponto de verificação 1)

**Funcionalidade:** Login do painel: só pessoas autorizadas acessam o RIDS (páginas e `/api/*`), a começar pelo dono das lojas.

**O que mudou da versão 1 para a 2:** as respostas do dono fecharam 7 das 11 perguntas; os colchetes dessas regras foram removidos. Três respostas mudaram o desenho: (1) passam a existir três cargos, Proprietário, Admin e Marketing; (2) cada pessoa deve poder redefinir a própria senha; (3) a senha mínima passa de 12 para 10 caracteres. Os critérios CA-1 a CA-21 mantêm a numeração; os novos (CA-22 em diante) foram acrescentados no fim de cada grupo. Critérios marcados **[condicional]** só entram se a pergunta indicada for respondida com "sim".

## 1. História

> Como dono das lojas, eu quero que só as pessoas que eu autorizei, cada uma com o seu cargo, consigam entrar no painel RIDS e consultar os seus dados, para que as informações das lojas (produtos, pedidos, fornecedores e as ligações com a Shopify) fiquem fora do alcance de qualquer pessoa que descubra o endereço do painel.

## 2. Critérios de aceitação

### Caminho feliz

- **CA-1 — Visitante é levado ao login.** Dado que uma pessoa não está autenticada, quando ela tenta abrir qualquer página do painel (por exemplo a página inicial com a lista de lojas), então ela não vê nenhum dado das lojas e é levada à tela de login.
- **CA-2 — Login com credenciais válidas.** Dado que a pessoa está na tela de login e tem uma conta autorizada, quando ela informa o e-mail e a senha corretos e confirma, então ela passa a estar autenticada e vê a página do painel que tentou abrir; se não havia página pedida, vai para a página inicial.
- **CA-3 — Sessão se mantém entre visitas.** Dado que a pessoa fez login, quando ela fecha o navegador e volta ao painel antes de a sessão expirar, então ela continua autenticada, sem precisar entrar de novo.
- **CA-4 — Dados do painel com sessão válida.** Dado que a pessoa está autenticada, quando o painel pede os dados das lojas (os endereços que começam por `/api/`), então os dados são devolvidos normalmente e a lista de lojas aparece.
- **CA-5 — Sair.** Dado que a pessoa está autenticada, quando ela usa a ação "Sair", então ela deixa de estar autenticada, é levada à tela de login e, ao voltar atrás no navegador ou digitar o endereço de uma página do painel, vê novamente a tela de login e não os dados.
- **CA-6 — Login com sessão já ativa.** Dado que a pessoa já está autenticada, quando ela abre a tela de login, então é levada diretamente à página inicial do painel, sem ter de entrar de novo.
- **CA-22 — Trocar a própria senha estando autenticada.** Dado que a pessoa está autenticada, quando ela abre "Alterar senha", informa a senha atual correta e uma nova senha que cumpre o mínimo (CA-20) e confirma, então vê uma confirmação de que a senha foi alterada, continua autenticada no dispositivo em que fez a troca, e a partir desse momento só a nova senha permite entrar (a antiga é recusada com a mensagem de CA-7).
- **CA-23 — A pessoa vê quem é e o seu cargo.** Dado que a pessoa está autenticada, quando ela abre o painel, então vê o seu e-mail e o seu cargo (Proprietário, Admin ou Marketing) em local visível, junto da ação "Sair".
- **CA-24 [condicional: pergunta 1] — Pedir um link de "esqueci a senha".** Dado que a pessoa está na tela de login e não se lembra da senha, quando ela usa "Esqueci a senha", informa o e-mail de uma conta existente e confirma, então vê a mensagem neutra "Se existir uma conta com este e-mail, enviámos um link para redefinir a senha" e recebe nesse e-mail um link de redefinição com prazo de validade.
- **CA-25 [condicional: pergunta 1] — Redefinir a senha com o link.** Dado que a pessoa recebeu o link, quando ela o abre dentro do prazo e define uma nova senha que cumpre o mínimo (CA-20), então vê a confirmação, o link deixa de funcionar, e ela consegue entrar com a nova senha (a antiga é recusada).

### Fluxos de falha

- **CA-7 — Senha errada.** Dado que a pessoa está na tela de login, quando ela informa um e-mail existente com senha errada, então ela continua na tela de login, vê a mensagem genérica "E-mail ou senha incorretos" e nenhum dado do painel é mostrado.
- **CA-8 — E-mail desconhecido.** Dado que a pessoa está na tela de login, quando ela informa um e-mail que não corresponde a nenhuma conta autorizada, então vê exatamente a mesma mensagem genérica de CA-7 (a tela não revela se o e-mail existe ou não).
- **CA-9 — Campos vazios ou inválidos.** Dado que a pessoa está na tela de login, quando ela confirma sem preencher o e-mail ou a senha, ou com um e-mail em formato inválido, então vê uma indicação do campo em falta e nenhuma tentativa de login é contada.
- **CA-10 — Dados pedidos sem estar autenticado.** Dado que alguém não está autenticado, quando pede diretamente qualquer dado do painel (endereços `/api/`, exceto o listado em CA-17), então recebe uma resposta de "acesso negado" com uma mensagem controlada e nenhum dado das lojas é incluído na resposta.
- **CA-11 — Sessão expirada no meio do uso.** Dado que a pessoa estava autenticada e a sessão expirou, quando ela tenta abrir uma página ou o painel tenta carregar dados, então ela é levada à tela de login com um aviso claro de que a sessão terminou, e não vê uma mensagem de erro técnica.
- **CA-12 — Sessão adulterada ou desconhecida.** Dado que o navegador apresenta uma identificação de sessão inválida, adulterada ou que já não existe, quando a pessoa acede a qualquer página ou dado protegido, então é tratada como não autenticada (CA-1 e CA-10).
- **CA-13 — Sistema indisponível durante o login.** Dado que a parte do sistema que guarda as contas está fora do ar, quando a pessoa tenta entrar, então ela vê uma mensagem genérica de indisponibilidade, não é autenticada e nenhum detalhe técnico aparece na tela.
- **CA-26 — Trocar senha com a senha atual errada.** Dado que a pessoa está autenticada em "Alterar senha", quando informa uma senha atual incorreta, então a senha não muda, ela vê a mensagem "Senha atual incorreta" e continua autenticada. Estas tentativas contam para o limite de CA-18, como se fossem tentativas de login.
- **CA-27 — Nova senha fora da regra.** Dado que a pessoa está a definir uma nova senha (em "Alterar senha" ou, se aprovado, pelo link de redefinição), quando a nova senha tem menos de 10 caracteres, então é recusada com a indicação do mínimo e a senha atual continua válida.
- **CA-28 [condicional: pergunta 1] — "Esqueci a senha" com e-mail desconhecido.** Dado que alguém usa "Esqueci a senha" com um e-mail que não corresponde a nenhuma conta, quando confirma, então vê exatamente a mesma mensagem neutra de CA-24 e nenhum e-mail é enviado.
- **CA-29 [condicional: pergunta 1] — Link expirado, já usado ou adulterado.** Dado que a pessoa abre um link de redefinição fora do prazo, que já foi usado, ou cujo endereço foi alterado, quando tenta definir a nova senha, então vê a mensagem "Este link é inválido ou expirou; peça um novo", a senha não muda e nenhum detalhe técnico aparece.
- **CA-30 [condicional: pergunta 1] — Serviço de e-mail indisponível.** Dado que o serviço de envio de e-mail está fora do ar, quando qualquer pessoa pede um link de redefinição, então vê uma mensagem genérica de indisponibilidade ("não foi possível enviar agora, tente mais tarde"), igual para e-mails existentes e inexistentes, sem detalhe técnico, e o login normal continua a funcionar.

### Regras de negócio

- **CA-14 — Sem cadastro aberto.** Dado qualquer pessoa na tela de login, quando ela procura uma forma de criar conta, então não existe nenhuma. A primeira conta, a do dono, é criada durante a instalação pelo responsável técnico; a senha é definida pelo dono e nunca é enviada por chat ou e-mail. Novas contas são criadas da mesma forma até existir gestão de usuários pelo painel (pergunta 3).
- **CA-15 — Duração da sessão.** Dado que a pessoa fez login, quando passam 7 dias, então ela precisa de entrar novamente.
- **CA-16 — Vários dispositivos.** Dado que a pessoa fez login num dispositivo, quando ela faz login noutro, então ambos ficam autenticados; e quando ela usa "Sair" num deles, só esse dispositivo perde a sessão.
- **CA-17 — Verificação de saúde continua pública.** Dado que alguém não está autenticado, quando pede o endereço de verificação de saúde do sistema (hoje `/api/health`, que só responde "estou a funcionar" e não expõe dados), então recebe a resposta normal sem login.
- **CA-18 — Limite de tentativas.** Dado que houve 5 tentativas de login falhadas para o mesmo e-mail em 15 minutos, quando é feita mais uma tentativa dentro desse período, então ela é recusada com uma mensagem de "aguarde e tente de novo", mesmo que a senha esteja certa, e o acesso volta a ser possível 15 minutos depois.
- **CA-19 — Todos os cargos veem todas as lojas.** Dado que a pessoa está autenticada, com qualquer dos três cargos, quando abre a lista de lojas, então vê todas as lojas registradas no RIDS. Não existe restrição por loja.
- **CA-20 — Regras da senha.** Dado que uma senha está a ser definida para uma conta (na instalação, em "Alterar senha" ou, se aprovado, pelo link de redefinição), quando ela tem menos de 10 caracteres, então é recusada com a indicação do mínimo. Não há outras exigências (letras, números ou símbolos).
- **CA-21 — A senha nunca reaparece.** Dado qualquer resposta do sistema (telas, mensagens de erro, dados devolvidos ao painel), quando a pessoa faz login, erra a senha, troca a senha ou consulta dados, então nenhuma senha digitada aparece em nenhuma resposta.
- **CA-31 — Toda conta tem exatamente um cargo.** Dado qualquer conta do RIDS, quando ela é consultada pelo painel, então tem um e só um cargo, entre Proprietário, Admin e Marketing; não é possível existir uma conta sem cargo ou com um cargo fora desta lista.
- **CA-32 — A conta inicial é Proprietário.** Dado que a instalação criou a conta do dono, quando o dono entra, então o cargo mostrado (CA-23) é "Proprietário".
- **CA-33 — Nesta entrega, os três cargos fazem o mesmo.** Dado uma pessoa autenticada com qualquer dos três cargos, quando usa o que existe nesta entrega (ver lista de lojas, alterar a própria senha, sair), então tudo funciona da mesma forma. As diferenças de permissão (pergunta 2) passam a valer nas funcionalidades seguintes que as exijam; nenhuma ação exclusiva de cargo existe ainda.

## 3. Casos extremos

- **Fronteira de expiração.** Uma sessão a segundos de expirar: até ao instante limite funciona; a partir dele, é tratada como expirada (CA-11). O prazo é contado de forma absoluta, sem depender do fuso horário das lojas nem do fuso do dispositivo da pessoa. O mesmo vale para o prazo do link de redefinição, se aprovado.
- **Mudança de fuso/relógio do dispositivo.** Alterar a hora ou o fuso do computador da pessoa não prolonga nem encurta a sessão nem o prazo do link.
- **E-mail com maiúsculas ou espaços.** "Ruben@Exemplo.com " entra na mesma conta que "ruben@exemplo.com": o e-mail é comparado ignorando maiúsculas e espaços nas pontas. A senha é comparada exatamente como digitada; espaços fazem parte da senha e contam para os 10 caracteres.
- **Senha no limite.** Uma senha com exatamente 10 caracteres é aceita; com 9 é recusada. Uma nova senha igual à atual é aceita, porque o dono não pediu outra regra além do mínimo.
- **Entradas muito longas ou estranhas.** E-mail ou senha com milhares de caracteres, emojis ou caracteres de controle: recusados com a mesma mensagem genérica, sem travar o sistema.
- **Contagem de tentativas e sucesso.** Após 4 falhas, um login correto entra normalmente e zera a contagem. Duas tentativas erradas exatamente ao mesmo tempo contam ambas. Erros de "senha atual" em "Alterar senha" somam-se aos erros de login do mesmo e-mail (CA-26).
- **Troca de senha e os outros dispositivos.** Depois de trocar a senha autenticada (CA-22), o dispositivo onde a troca foi feita continua autenticado. O que acontece aos outros dispositivos ainda abertos faz parte da pergunta 1 (há uma sugestão lá).
- **Duplicidade de conta.** Não podem existir duas contas com o mesmo e-mail (considerando a normalização acima). Se quem configura tentar criar a segunda, é recusada.
- **Sair em dois lugares ao mesmo tempo.** Clicar "Sair" duas vezes, ou em dois dispositivos ao mesmo tempo, não produz erro; o resultado é o mesmo de sair uma vez.
- **Sessão expira durante a troca de senha.** Se a sessão termina entre abrir "Alterar senha" e confirmar, a senha não muda e a pessoa é levada ao login com o aviso de CA-11.
- **Sessão expira enquanto a lista carrega.** Se a sessão termina entre abrir a página e carregar os dados, a pessoa é levada ao login com o aviso de CA-11, e não vê metade da página com um erro cru.
- **Painel sem lojas.** Uma pessoa autenticada num RIDS sem nenhuma loja registrada entra normalmente e vê o estado "nenhuma loja" já existente, não um erro.
- **Página pedida antes do login.** Se a pessoa tentou abrir uma página específica e foi levada ao login, depois de entrar volta a essa página; se a página pedida não existir, vê o aviso normal de página não encontrada, já autenticada.
- **Login sem JavaScript ou com conexão lenta.** O formulário deve continuar a permitir o envio e mostrar o estado "a entrar..." enquanto aguarda, sem permitir dois envios da mesma tentativa. O mesmo para "Alterar senha".
- **Verificação de saúde com o banco fora do ar.** Continua a responder (CA-17), porque não depende de login nem de banco; o login em si falha com CA-13.
- **Cargo em cada conta.** Uma conta de Marketing ou Admin, criada pelo técnico, entra e vê hoje exatamente o mesmo que o Proprietário (CA-33), mas o cargo mostrado em CA-23 é o dela.
- **[condicional] Dois pedidos de link seguidos.** Se a pessoa pede dois links, só o mais recente funciona; o anterior passa a ser tratado como inválido (CA-29). Sugestão dentro da pergunta 1.
- **[condicional] Link aberto em dois navegadores.** O primeiro a concluir a redefinição ganha; o segundo vê a mensagem de link inválido (CA-29).
- **[condicional] Pedidos de link em série.** Pedir muitos links seguidos para o mesmo e-mail fica sujeito ao mesmo limite de CA-18 (5 em 15 minutos), para não inundar a caixa de e-mail nem o serviço de envio. Sugestão dentro da pergunta 1.

## 4. Fora do escopo

Esta funcionalidade NÃO faz:

- Criação de conta pelo próprio usuário (auto-cadastro).
- **[condicional: pergunta 3]** Gestão de usuários pelo painel: criar contas, atribuir ou mudar cargos, desativar ou bloquear contas. Enquanto não existir, o responsável técnico faz isso a pedido do dono, e o cargo já fica guardado em cada conta desde agora.
- **[condicional: pergunta 1]** "Esqueci a senha" por e-mail (CA-24, CA-25, CA-28 a CA-30). Se o dono não aprovar o serviço de e-mail, a redefinição de quem esqueceu a senha é feita pelo responsável técnico; a troca de senha estando autenticada (CA-22) entra de qualquer forma.
- Aplicar permissões diferentes por cargo. Nesta entrega os cargos só ficam guardados e visíveis (CA-31 a CA-33); as restrições sugeridas na pergunta 2 valem para as funcionalidades seguintes.
- Restrição de acesso por loja ("só vê a loja X"): todos os cargos veem todas as lojas (CA-19).
- Login com Google, Shopify ou qualquer provedor externo; link mágico por e-mail como forma de entrar.
- Verificação em duas etapas (código por SMS/aplicativo).
- **[condicional: pergunta 4]** Tela ou registro de auditoria ("quem entrou e quando", "quem trocou a senha").
- A ligação das lojas à Shopify (OAuth) e a recepção de webhooks. Fica registrado o princípio: os endereços que a **Shopify** vai chamar (webhooks e o retorno da ligação de loja), quando forem criados, não exigem login de pessoa; serão protegidos pela verificação própria da Shopify (assinatura), definida na funcionalidade deles.
- Tornar a verificação de saúde privada.
- Textos em outra língua além do português.

## 5. Perguntas em aberto

Responda apenas às que quiser mudar; "aceito as sugestões" fecha todas.

1. **Redefinir a própria senha: qual das duas formas?** A resposta "poder fazer reset cada pessoa" pode significar duas coisas diferentes:
   - **(a) Trocar a senha estando já dentro do painel.** A pessoa entra, vai a "Alterar senha", digita a senha atual e a nova. Não precisa de nada novo no sistema. Isto entra de qualquer forma (CA-22, CA-26, CA-27).
   - **(b) "Esqueci a senha", sem conseguir entrar.** A única forma segura de provar que a pessoa é quem diz ser é enviar-lhe um link para o e-mail dela. O RIDS hoje não envia e-mails: para isto, é preciso contratar um serviço de envio de e-mail (há opções com plano gratuito para volumes pequenos) e configurar o domínio de envio (por exemplo, os e-mails saírem de um endereço @sonielparis.fr). Isso é uma dependência nova e um custo/passo de configuração do dono. Sem isto, quem esquecer a senha pede ao responsável técnico para redefinir.
   - **Sugestão:** incluir (a) agora e (b) também, desde que o dono aceite acrescentar um serviço de e-mail. Se aceitar (b), sugere-se ainda: link válido por 1 hora e de uso único; só o último link pedido vale; pedidos de link sujeitos ao mesmo limite de 5 em 15 minutos; ao redefinir por "esqueci a senha", todas as sessões dessa pessoa terminam nos outros dispositivos (o motivo comum é suspeita de acesso indevido), enquanto a troca normal (a) mantém os outros dispositivos autenticados. Se não aceitar (b), ele sai do escopo e o técnico faz o reset.

2. **O que cada cargo pode fazer?** O dono pediu os cargos Proprietário, Admin e Marketing, todos vendo todas as lojas, mas não disse o que muda entre eles. Hoje o painel só tem a lista de lojas, então nesta entrega nada muda entre cargos (CA-33); a definição serve para as funcionalidades seguintes. **Sugestão:** Proprietário e Admin têm acesso total; Marketing só consulta (não altera nada) e não vê ligações com a Shopify, tokens nem configurações; só o Proprietário pode criar contas e atribuir cargos. Estas regras seriam aplicadas à medida que cada funcionalidade nascer, não agora.

3. **A gestão de usuários pelo painel entra agora ou numa funcionalidade seguinte?** O dono disse "para já apenas eu, depois iremos adicionar mais pessoas". **Sugestão:** fica para uma funcionalidade seguinte; nesta, o técnico cria as contas (com cargo) a pedido, e o sistema já nasce preparado (CA-31, CA-32). Se preferir já agora, a história cresce com tela de lista de pessoas, criar conta, mudar cargo e desativar, e levaria mais tempo.

4. **Reconsiderar a auditoria mínima?** O dono não comentou e a sugestão anterior era "sem auditoria". Mas agora que haverá várias pessoas com cargos diferentes e redefinição de senha, guardar pelo menos "quem entrou, quando" e "quem trocou/redefiniu a senha, quando" ajuda a perceber um acesso indevido depois de acontecer. Não precisaria de tela nesta fase, só o registro. **Sugestão:** guardar estes dois tipos de registro (sem tela), e deixar a tela de consulta para depois. Se preferir manter "sem auditoria", fica fora do escopo como na versão 1.

---

**Nota para o gerente de projeto (não é para o dono responder):** mantêm-se os pontos da versão 1 levantados pelo pesquisador nas seções 5 e 7 das descobertas: quem cria `src/proxy.ts` e edita `next.config.ts`, já que o hook de escopo não libera nenhum dos dois; `node:crypto` puro versus dependência nova para hash de senha e sessão; se o projeto aceita `authInterrupts` (experimental); exceção explícita à regra "toda tabela tem `storeId`" para as tabelas de usuário/sessão; onde guardar a contagem de tentativas (Redis já existe); nova variável de segredo em `.env.example` sem valor; impacto em `tests/e2e/health.spec.ts`, `src/hooks/useStores.ts` e `src/components/StoreList.test.tsx` (tratamento de acesso negado), e a necessidade de fluxos de página com sessão no Playwright; cookie `Secure` e verificação de origem se houver reverse proxy em produção. **Novo nesta versão:** cargo obrigatório no modelo de usuário, com três valores fixos (Proprietário, Admin, Marketing) e a conta inicial como Proprietário, exposto à UI pelo contrato compartilhado (CA-23); ação de troca de senha autenticada, que reverifica a senha atual e partilha o contador de tentativas do login (CA-26); a contagem de tentativas passa a cobrir também "Alterar senha" e, se aprovado, pedidos de link; **condicional à pergunta 1:** serviço de envio de e-mail como dependência nova (só entra se o dono aprovar, com variáveis de configuração em `.env.example` sem valor), registro de tokens de redefinição com expiração e uso único (guardar apenas um resumo/hash do token, nunca o token em claro), invalidação dos tokens anteriores ao emitir um novo, e invalidação das outras sessões da pessoa ao concluir a redefinição; **condicional à pergunta 4:** registro de eventos de login e de troca/redefinição de senha, sem tela, sem guardar senhas nem tokens. A mensagem neutra de CA-24/CA-28 exige que o tempo de resposta não revele se o e-mail existe.

**Aguardando aprovação da história (ponto de verificação 1).**
