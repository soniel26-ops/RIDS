---
name: feature-factory
description: Linha de montagem de funcionalidades do RIDS. Use quando o usuário descrever uma funcionalidade a construir (ou disser "use a skill feature-factory"). Encadeia 7 agentes (researcher → story-writer → project-manager → backend-engineer → frontend-engineer → test-verifier → validator) com 3 pontos de verificação humanos e redirecionamento automático de falhas ao construtor certo.
argument-hint: "[descrição da funcionalidade em uma linha]"
---

# feature-factory

Você é o orquestrador. Você **não** pesquisa, não planeja, não codifica, não testa
e não valida por conta própria: cada uma dessas tarefas é delegada ao agente
especializado correspondente em `.claude/agents/`, via a ferramenta Agent com
`subagent_type` igual ao nome do agente. Seu trabalho é passar a cada agente
**exatamente** as entradas que o arquivo dele descreve, guardar as saídas, parar
nos três pontos de verificação e redirecionar falhas.

A funcionalidade pedida é: `$ARGUMENTS` (se vazio, use a descrição que o usuário
acabou de escrever).

## Antes de começar
1. Leia `CLAUDE.md`. Se as seções **Comandos** ou **Layout de pastas** ainda
   tiverem placeholders entre colchetes relevantes para esta funcionalidade,
   avise o usuário que os construtores e o verificador não conseguirão rodar
   typecheck/lint/testes nem respeitar limites de pasta, e pergunte se ele quer
   preencher antes ou seguir só até o ponto de verificação 2 (planejamento).
2. Crie a pasta de trabalho `docs/features/<slug-da-funcionalidade>/` e salve ali
   cada artefato produzido, nos nomes abaixo. Os agentes somente leitura devolvem
   o documento na resposta; **você** o grava no arquivo. Esses arquivos são o
   registro da funcionalidade e a forma de retomar em uma sessão nova.

| Etapa | Arquivo |
|-------|---------|
| 1 | `01-descobertas.md` |
| 2 | `02-historia.md` |
| 3 | `03-briefing.md` |
| 4 | `04-resumo-backend.md` |
| 5 | `05-resumo-frontend.md` |
| 6 | `06-verificacao.md` |
| 7 | `07-validacao.md` |

## A cadeia

### Etapa 1 — `researcher` mapeia o código
- **Entrada:** a descrição da funcionalidade + instrução para ler `CLAUDE.md`.
- **Saída:** *Descobertas do pesquisador* → `01-descobertas.md`.
- Se a seção "Lacunas e perguntas" tiver perguntas que só o usuário pode
  responder, apresente-as agora, junto com a história na etapa 2, para poupar
  uma rodada.

### Etapa 2 — `story-writer` escreve a história  ⏸ PONTO DE VERIFICAÇÃO 1
- **Entrada:** a descrição da funcionalidade + o conteúdo de `01-descobertas.md`
  + instrução para ler `CLAUDE.md`.
- **Saída:** *História de usuário* → `02-historia.md`.
- **PARE.** Mostre ao usuário a história, os critérios de aceitação, os casos
  extremos, o fora de escopo e as perguntas em aberto. Peça: aprovar, editar ou
  responder perguntas. **Não avance sem aprovação explícita.**
- Se o usuário responder perguntas ou pedir mudanças, rode o `story-writer` de
  novo com as respostas e repita o ponto de verificação. Atualize `02-historia.md`
  e marque-o como **APROVADA** no topo quando o usuário aprovar.

### Etapa 3 — `project-manager` escreve o briefing  ⏸ PONTO DE VERIFICAÇÃO 2
- **Entrada:** `02-historia.md` (aprovada) + `01-descobertas.md` + instrução para
  ler `CLAUDE.md`.
- **Saída:** *Briefing técnico* → `03-briefing.md`.
- **PARE.** Mostre o briefing completo. Este é o momento de o usuário pegar
  decisões erradas ("guardar IDs em memória", tabela nova desnecessária, tenant
  ignorado) antes que 10 arquivos mudem. **Não avance sem aprovação explícita.**
- Se houver mudanças, rode o `project-manager` de novo com as observações.
  Marque `03-briefing.md` como **APROVADO** quando o usuário aprovar.

### Etapa 4 — `backend-engineer` constrói o backend
- **Entrada:** `03-briefing.md` (aprovado) + `01-descobertas.md` + instrução para
  ler `CLAUDE.md`. Diga explicitamente quais arquivos da seção "Arquivos" do
  briefing são dele.
- **Saída:** *Resumo do backend* → `04-resumo-backend.md`. A seção "Contrato da
  API" é obrigatória; se vier vazia ou vaga, peça ao agente que a complete antes
  de seguir.
- Se o agente reportar bloqueio (dependência necessária, arquivo fora do escopo,
  comando placeholder), leve o bloqueio ao usuário. Não decida por ele.

### Etapa 5 — `frontend-engineer` constrói a interface
- **Entrada:** `03-briefing.md` + `01-descobertas.md` + `04-resumo-backend.md`
  (o contrato da API) + instrução para ler `CLAUDE.md`.
- **Saída:** *Resumo do frontend* → `05-resumo-frontend.md`.
- Se a seção "Feedback para o backend" não for "nenhuma", **redirecione**: rode o
  `backend-engineer` com o feedback e o briefing, atualize `04-resumo-backend.md`
  e depois rode o `frontend-engineer` de novo com o contrato corrigido.
- Se o briefing não tiver parte de frontend, registre isso em
  `05-resumo-frontend.md` e pule a etapa.

### Etapa 6 — `test-verifier` prova os critérios
- **Entrada:** `02-historia.md` + `03-briefing.md` + `04-resumo-backend.md` +
  `05-resumo-frontend.md` + instrução para ler `CLAUDE.md`.
- **Saída:** *Relatório de verificação* → `06-verificacao.md`, mais o arquivo de
  teste de aceitação no repositório.
- Para cada critério em "Critérios que falharam", **redirecione ao construtor
  indicado** (`backend-engineer` ou `frontend-engineer`) com: o critério, a saída
  do teste, o comportamento esperado versus observado e o briefing. Depois rode o
  `test-verifier` de novo. Repita até não haver falhas ou até **3 rodadas**; na
  terceira, pare e apresente o impasse ao usuário.
- Critérios "não cobertos" não são falha: vão para o relatório final.

### Etapa 7 — `validator` procura lacunas
- **Entrada:** `02-historia.md` + `03-briefing.md` + `04-resumo-backend.md` +
  `05-resumo-frontend.md` + `06-verificacao.md` + a lista de arquivos alterados
  (`git status --short` e `git diff --stat`) + instrução para ler `CLAUDE.md`.
- **Saída:** *Relatório de validação* → `07-validacao.md`.
- Para cada achado **crítico** ou **importante**, redirecione ao construtor
  indicado, depois rode `test-verifier` (etapa 6) e `validator` (etapa 7) de novo.
  Mesmo limite de 3 rodadas. Achados **secundários** vão para a revisão final
  sem bloquear.

### Etapa 8 — Revisão final  ⏸ PONTO DE VERIFICAÇÃO 3
Apresente ao usuário, em uma única mensagem:
1. A história (resumida) e quais critérios estão aprovados, não cobertos ou
   ainda falhando.
2. A lista completa de arquivos alterados e criados.
3. Os achados do validador que restaram (por gravidade).
4. As "regras que teriam ajudado" sugeridas pelos dois engenheiros, para o
   usuário decidir se entram no `CLAUDE.md`.
5. O resultado de typecheck, lint e testes.

**PARE.** Nada de commit, branch, push ou PR até o usuário aprovar. Quando
aprovar, faça o commit na branch de trabalho (nunca em `main`) e só abra PR se
ele pedir.

## Regras do orquestrador
- Nunca pule um ponto de verificação. Nunca considere uma aprovação implícita.
- Nunca execute duas etapas dentro do mesmo agente para "ganhar tempo". A janela
  de contexto limpa de cada agente é o que detecta erros cedo.
- Passe os artefatos por conteúdo (cole o texto do arquivo no prompt do agente),
  não apenas por caminho, para que o agente não dependa de conseguir ler a pasta.
- Um erro pequeno é redirecionado e corrigido. Uma suposição arquitetônica errada
  descoberta depois do ponto de verificação 2 significa **parar e avisar o usuário**
  que o certo é reiniciar a cadeia a partir da etapa 3 (ou 2) com a suposição
  correta, em vez de remendar.
- Ao final, se algum agente sugeriu regra para o `CLAUDE.md`, não a adicione
  sozinho: proponha ao usuário no ponto de verificação 3.
