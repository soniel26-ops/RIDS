# História de usuário — Login do painel

**Estado:** aguardando aprovação (ponto de verificação 1)

**Funcionalidade:** Login do painel: só pessoas autorizadas acessam o RIDS (páginas e `/api/*`), a começar pelo dono das lojas.

Nota de leitura: onde uma regra ainda depende de uma resposta do dono, o critério traz a opção sugerida entre colchetes, por exemplo "[sugestão: 7 dias]". Se a resposta for "aceito as sugestões", os colchetes viram regra.

## 1. História

> Como dono das lojas, eu quero que só as pessoas que eu autorizei consigam entrar no painel RIDS e consultar os seus dados, para que as informações das lojas (produtos, pedidos, fornecedores e as ligações com a Shopify) fiquem fora do alcance de qualquer pessoa que descubra o endereço do painel.

## 2. Critérios de aceitação

### Caminho feliz

- **CA-1 — Visitante é levado ao login.** Dado que uma pessoa não está autenticada, quando ela tenta abrir qualquer página do painel (por exemplo a página inicial com a lista de lojas), então ela não vê nenhum dado das lojas e é levada à tela de login.
- **CA-2 — Login com credenciais válidas.** Dado que a pessoa está na tela de login e tem uma conta autorizada, quando ela informa o e-mail e a senha corretos e confirma, então ela passa a estar autenticada e vê a página do painel que tentou abrir [sugestão: se não havia página pedida, vai para a página inicial].
- **CA-3 — Sessão se mantém entre visitas.** Dado que a pessoa fez login, quando ela fecha o navegador e volta ao painel antes de a sessão expirar, então ela continua autenticada, sem precisar entrar de novo.
- **CA-4 — Dados do painel com sessão válida.** Dado que a pessoa está autenticada, quando o painel pede os dados das lojas (os endereços que começam por `/api/`), então os dados são devolvidos normalmente e a lista de lojas aparece.
- **CA-5 — Sair.** Dado que a pessoa está autenticada, quando ela usa a ação "Sair", então ela deixa de estar autenticada, é levada à tela de login e, ao voltar atrás no navegador ou digitar o endereço de uma página do painel, vê novamente a tela de login e não os dados.
- **CA-6 — Login com sessão já ativa.** Dado que a pessoa já está autenticada, quando ela abre a tela de login, então é levada diretamente à página inicial do painel, sem ter de entrar de novo.

### Fluxos de falha

- **CA-7 — Senha errada.** Dado que a pessoa está na tela de login, quando ela informa um e-mail existente com senha errada, então ela continua na tela de login, vê a mensagem genérica "E-mail ou senha incorretos" e nenhum dado do painel é mostrado.
- **CA-8 — E-mail desconhecido.** Dado que a pessoa está na tela de login, quando ela informa um e-mail que não corresponde a nenhuma conta autorizada, então vê exatamente a mesma mensagem genérica de CA-7 (a tela não revela se o e-mail existe ou não).
- **CA-9 — Campos vazios ou inválidos.** Dado que a pessoa está na tela de login, quando ela confirma sem preencher o e-mail ou a senha, ou com um e-mail em formato inválido, então vê uma indicação do campo em falta e nenhuma tentativa de login é contada.
- **CA-10 — Dados pedidos sem estar autenticado.** Dado que alguém não está autenticado, quando pede diretamente qualquer dado do painel (endereços `/api/`, exceto os listados em CA-17), então recebe uma resposta de "acesso negado" com uma mensagem controlada e nenhum dado das lojas é incluído na resposta.
- **CA-11 — Sessão expirada no meio do uso.** Dado que a pessoa estava autenticada e a sessão expirou, quando ela tenta abrir uma página ou o painel tenta carregar dados, então ela é levada à tela de login com um aviso claro de que a sessão terminou, e não vê uma mensagem de erro técnica.
- **CA-12 — Sessão adulterada ou desconhecida.** Dado que o navegador apresenta uma identificação de sessão inválida, adulterada ou que já não existe, quando a pessoa acede a qualquer página ou dado protegido, então é tratada como não autenticada (CA-1 e CA-10).
- **CA-13 — Sistema indisponível durante o login.** Dado que a parte do sistema que guarda as contas está fora do ar, quando a pessoa tenta entrar, então ela vê uma mensagem genérica de indisponibilidade, não é autenticada e nenhum detalhe técnico aparece na tela.

### Regras de negócio

- **CA-14 — Sem cadastro aberto.** Dado qualquer pessoa na tela de login, quando ela procura uma forma de criar conta, então não existe nenhuma: contas só são criadas por quem configura o sistema [sugestão: o primeiro acesso, o do dono, é criado durante a instalação pelo responsável técnico; a senha é definida pelo dono e nunca é enviada por chat ou e-mail].
- **CA-15 — Duração da sessão.** Dado que a pessoa fez login, quando passa o prazo da sessão [sugestão: 7 dias], então ela precisa de entrar novamente.
- **CA-16 — Vários dispositivos.** Dado que a pessoa fez login num dispositivo, quando ela faz login noutro, então ambos ficam autenticados [sugestão: permitido]; e quando ela usa "Sair" num deles, só esse dispositivo perde a sessão [sugestão].
- **CA-17 — Verificação de saúde continua pública.** Dado que alguém não está autenticado, quando pede o endereço de verificação de saúde do sistema (hoje `/api/health`, que só responde "estou a funcionar" e não expõe dados), então recebe a resposta normal sem login [sugestão: continua público].
- **CA-18 — Limite de tentativas.** Dado que houve tentativas de login falhadas seguidas para o mesmo e-mail [sugestão: 5 tentativas em 15 minutos], quando é feita mais uma tentativa dentro desse período, então ela é recusada com uma mensagem de "aguarde e tente de novo", mesmo que a senha esteja certa, e o acesso volta a ser possível depois do período de espera [sugestão: 15 minutos].
- **CA-19 — Quem entra vê todas as lojas.** Dado que a pessoa está autenticada, quando abre a lista de lojas, então vê todas as lojas registradas no RIDS [sugestão: um único perfil, "administrador", com acesso a tudo; sem restrição por loja nesta fase].
- **CA-20 — Regras da senha.** Dado que uma senha está a ser definida para uma conta, quando ela não cumpre o mínimo [sugestão: pelo menos 12 caracteres, sem outras exigências], então é recusada com a indicação do mínimo.
- **CA-21 — A senha nunca reaparece.** Dado qualquer resposta do sistema (telas, mensagens de erro, dados devolvidos ao painel), quando a pessoa faz login, erra a senha ou consulta dados, então a senha digitada nunca aparece em nenhuma resposta.

## 3. Casos extremos

- **Fronteira de expiração.** Uma sessão a segundos de expirar: até ao instante limite funciona; a partir dele, é tratada como expirada (CA-11). O prazo é contado de forma absoluta, sem depender do fuso horário das lojas nem do fuso do dispositivo da pessoa.
- **Mudança de fuso/relógio do dispositivo.** Alterar a hora ou o fuso do computador da pessoa não prolonga nem encurta a sessão.
- **E-mail com maiúsculas ou espaços.** "Ruben@Exemplo.com " deve entrar na mesma conta que "ruben@exemplo.com" [sugestão: e-mail comparado ignorando maiúsculas e espaços nas pontas; a senha é comparada exatamente como digitada].
- **Entradas muito longas ou estranhas.** E-mail ou senha com milhares de caracteres, emojis ou caracteres de controle: recusados com a mesma mensagem genérica, sem travar o sistema.
- **Contagem de tentativas e sucesso.** Após 4 falhas, um login correto entra normalmente e zera a contagem. Duas tentativas erradas exatamente ao mesmo tempo contam ambas.
- **Duplicidade de conta.** Não podem existir duas contas com o mesmo e-mail (considerando a normalização acima). Se quem configura tentar criar a segunda, é recusada.
- **Sair em dois lugares ao mesmo tempo.** Clicar "Sair" duas vezes, ou em dois dispositivos ao mesmo tempo, não produz erro; o resultado é o mesmo de sair uma vez.
- **Sessão expira enquanto a lista carrega.** Se a sessão termina entre abrir a página e carregar os dados, a pessoa é levada ao login com o aviso de CA-11, e não vê metade da página com um erro cru.
- **Painel sem lojas.** Uma pessoa autenticada num RIDS sem nenhuma loja registrada entra normalmente e vê o estado "nenhuma loja" já existente, não um erro.
- **Página pedida antes do login.** Se a pessoa tentou abrir uma página específica e foi levada ao login, depois de entrar volta a essa página; se a página pedida não existir, vê o aviso normal de página não encontrada, já autenticada.
- **Login sem JavaScript ou com conexão lenta.** O formulário deve continuar a permitir o envio e mostrar o estado "a entrar..." enquanto aguarda, sem permitir dois envios da mesma tentativa.
- **Verificação de saúde com o banco fora do ar.** Continua a responder (CA-17), porque não depende de login nem de banco; o login em si falha com CA-13.

## 4. Fora do escopo

Esta funcionalidade NÃO faz:

- Criação de conta pelo próprio usuário (auto-cadastro) nem tela de gestão de usuários.
- Recuperação de senha por e-mail ("esqueci a senha") e troca de senha dentro do painel [sugestão: nesta fase, um reset é feito pelo responsável técnico a pedido do dono].
- Login com Google, Shopify ou qualquer provedor externo; link mágico por e-mail (não há serviço de e-mail configurado).
- Perfis ou permissões diferentes (por exemplo "só vê a loja X"); há um único nível de acesso.
- Verificação em duas etapas (código por SMS/aplicativo).
- Desativação ou bloqueio de uma conta pelo painel enquanto só existe o dono.
- Tela ou relatório de auditoria ("quem entrou e quando") [sugestão: fica para depois].
- A ligação das lojas à Shopify (OAuth) e a recepção de webhooks. Fica registrado o princípio: os endereços que a **Shopify** vai chamar (webhooks e o retorno da ligação de loja), quando forem criados, não exigem login de pessoa; serão protegidos pela verificação própria da Shopify (assinatura), definida na funcionalidade deles.
- Tornar a verificação de saúde privada.
- Textos em outra língua além do português.

## 5. Perguntas em aberto

Responda apenas às que quiser mudar; "aceito as sugestões" fecha todas.

1. Quem entra no início: só você, com uma conta, ou já outras pessoas? Precisam de perfis diferentes? — **Sugestão:** só o dono, uma conta, um único perfil com acesso a tudo (CA-19).
2. Como prefere entrar: e-mail e senha, link por e-mail, conta Google, ou uma senha única sem e-mail? — **Sugestão:** e-mail e senha (não há serviço de e-mail configurado e não exige conta em terceiros).
3. Como a sua conta é criada pela primeira vez? — **Sugestão:** pelo responsável técnico durante a instalação, sem tela de "criar conta"; a senha é escolhida por você e nunca circula por chat ou e-mail (CA-14).
4. Esquecer ou trocar a senha faz parte desta entrega? — **Sugestão:** não; um reset é feito pelo responsável técnico quando você pedir.
5. Por quanto tempo a sessão fica válida sem precisar de entrar de novo, e pode estar entrado em vários dispositivos (computador e celular) ao mesmo tempo? — **Sugestão:** 7 dias; vários dispositivos permitidos; "Sair" só afeta o dispositivo em que foi clicado (CA-15, CA-16).
6. O endereço de verificação de saúde (que só diz "o sistema está a funcionar") pode continuar aberto a qualquer pessoa? — **Sugestão:** sim (CA-17).
7. Quem entra vê todas as lojas, ou já quer prever alguém que só vê uma? — **Sugestão:** todas as lojas; restrição por loja fica para quando houver mais pessoas (CA-19).
8. Quer um limite de tentativas erradas para dificultar quem tenta adivinhar a senha? — **Sugestão:** sim, 5 tentativas em 15 minutos, depois 15 minutos de espera (CA-18).
9. Quer que o sistema guarde quem entrou e quando (auditoria)? — **Sugestão:** não nesta fase; sem tela para isso, fica fora do escopo.
10. Tamanho mínimo da senha? — **Sugestão:** 12 caracteres, sem outras exigências de símbolos ou números (CA-20).
11. Depois de entrar, prefere voltar à página que tentou abrir ou ir sempre à página inicial? — **Sugestão:** voltar à página que tentou abrir (CA-2).

---

**Nota para o gerente de projeto (não é para o dono responder):** o briefing terá de decidir os pontos técnicos levantados pelo pesquisador nas seções 5 e 7 das descobertas: quem cria `src/proxy.ts` e edita `next.config.ts`, já que o hook de escopo não libera nenhum dos dois; `node:crypto` puro versus dependência nova para hash de senha e sessão; se o projeto aceita `authInterrupts` (experimental); exceção explícita à regra "toda tabela tem `storeId`" para as tabelas de usuário/sessão; onde guardar a contagem de tentativas (Redis já existe); nova variável de segredo em `.env.example` sem valor; impacto em `tests/e2e/health.spec.ts`, `src/hooks/useStores.ts` e `src/components/StoreList.test.tsx` (tratamento de acesso negado), e a necessidade de fluxos de página com sessão no Playwright; cookie `Secure` e verificação de origem se houver reverse proxy em produção.

**Aguardando aprovação da história (ponto de verificação 1).**
