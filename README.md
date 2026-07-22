# cafe-coordinator-agent

<p>
  <img src="https://img.shields.io/badge/made%20by-Alessandro%20Massarotti%20Jr-4f46e5?style=flat-square">
  <img src="https://img.shields.io/badge/Node.js-24-4f46e5?style=flat-square">
  <img alt="GitHub language count" src="https://img.shields.io/github/languages/count/Alessandro-Massarotti-Jr/cafe-coordinator-agent?color=4f46e5&style=flat-square">
  <img alt="GitHub Top Language" src="https://img.shields.io/github/languages/top/Alessandro-Massarotti-Jr/cafe-coordinator-agent?color=4f46e5&style=flat-square">
</p>


Este repositorio é um estudo dos conceitos apresentados para a CCA-F em como usar o claude para construções de agente e fluxo de trabalho

[https://www.anthropiccertifications.com](https://www.anthropiccertifications.com)

Alem disso quero criar um sistema relativamente funcional com cada um do agente tendo suas ferramentas de forma variada, RAG com Banco de dados vetorial, conexão com MCPs, prompt com conceito bem definido, etc ...

Para não ficar gastando dinheiro com API da Anthropic Vou utilizar o [Ollama](https://ollama.com) com algum modelo gratuito, como é um projeto de aprendizado não preciso do poder de um modelo pago

Optei por testar os modelos:

- gemma4 para os agentes trabalharem
- embeddinggemma para gerar embedings para o banco verotial

O Projeto em si seguira a ideia de ser um agente de IA para atendimentos de uma cafeteria, aqui quero ter alguns agentes com topicos especificos de responsabilidades variando a estrategia entre eles

- Um que se conecta a um MCP
- Um realizando RAG para buscar dados da empresa
- Um sendo somente um exemplo de prompt com guidelines a serem seguidas



# CCA-F

## Agentic Architecture

- [ ] Sempre verificar o stop_reasson do modelo para indicar quando ele parou, evitando antipatterne de pegar na resposta
- [ ] Usar tools em paralelo para otimizar processo quando o modelo solicitar mais de uma tool
- [ ] Um agente Coordenador com responsabilidade de chamar outros (Hub-spoke)
- [ ] Sub agentes recebem somente o contexto necessario para o trabalho, a maior parte fica no Coordenador
- [ ] O coordenador é o agente principla que recebe as perguntas e devolve respostas, lida com erros e julga se a resposta é o sulficiente para devolver ao client
- [ ] Coordenador docompoe um topico grande em topicos e tarefas menores para passar para os sub agentes
  - [ ] Para melhorar esta decomposição é interessante deixar explicito as guidelines de como fazer isso para evitar ele deixar especifico de mais ou de menos
  - [ ] Uma estrategia é pedir para ele enumerar os topicos disponiveis para o assunto antes de decompor em tarefas, por exemplo "Falar sobre a Historia da arte" antes de decompor em tarefas, solicitar para o coordenador listar todos os topicos de "Historia da arte"
  - [ ] Dividir cada topico menor agrupado por conteudo para cada subagente para evitar resultados duplicados
- [ ] Para delefar tasks aos subagentes considere que eles não sabem nada do contexto atual e passe o maximo de informação possivel para eles no prompt de chamada
- [ ] Sempre use chamadas de tool paralelas quando possivel para minimizar roudtrips
- [ ] Prompt do coordenador deve ter especificado o passo a passo procedural de como realizar instruções e criterios de qualidade e objetivos, isso para manter as qualidades enquando os subagents tem o como fazer. coordenador mantendo qualidade e subagente o conhecimento da ação
- [ ] A definição de um agente deve especificar oque ele faz, suas limitações e capacidades
  - [ ] Descrição usada para definir quando o agente deve ser usado
  - [ ] System prompt define o comportamento do agente
  - [ ] Ferramentas que o agente pode acessar
- [ ] Melhores praticas de contexto são
  - [ ] Separar o conteudo de metadados para os subagentes
  - [ ] Passar a busca completa para os subagentes, não resumir dados sempre passar todo o contexto necessario
  - [ ] Prompts baseados em Objetivos, não um passo a passo de como fazer mas sim um objetivo do que deve ser feito
- [ ] Em alguns cenarios pode ser interessante reforçar informações no fluxo de trabalho
  - [ ] Reforçar com exemplos de como usar ou realizar algo
  - [ ] Criar guards para bloquear chamadas não autorizadas, por exemplo só pode estornar um pedido se tiver buscado este pedido previamente
  - [ ] Sistema de workflows para definir o fluxo de trabalho deste agente
- [ ] Quando escalar para um Humano o problema deve ser passado com as informações necessarias estruturadas e sumarizadas
  - [ ] Informações do cliente e do cenario
  - [ ] Analise da causa Raiz
  - [ ] Ação requisitada pelo cliente
  - [ ] Recomendações de solução para o caso
- [ ] Para problemas complexos antes de decompor uma tarefa pode ser interessante ter uma etapa antes disso, por exemplo uma tarefa de "Fui cobrado duas vezes, meu desconto não foi aplicado e quero cancelar", antes de iniciar a decomposição e paralezização disso, é interessante buscar coisas uteis em comun antes, por exemplo, neste caso os dados do usuario podem ser buscados e em seguida decompor a tarefa em topicos menores e chamar um subagente para cada uma delas
- [ ] PostToolUse pode ser interessante para garantir comportamentos, como salvar o uso das ferramentas, transformar os dados antes de passar para o modelo, por exemplo uma busca de usuarios filtrar os dados sensiveis antes do modelo ver eles
- [ ] é interessante Rotear as tarefas para modelos mais baratos quando forem mais simples para economizar e tambem pq usualmente estes modelos são mais rapidos
- [ ] Agentes de longa duração casualmente tem muitas sessões de trablho, é interessante manejar estas sessões para não perder contexto

## Tool Design & MCP

- [ ] Definir bem as ferramentas com nome e descrição os mais descritivos possiveis, como para que a função serve e quando usar ela evitando descrições e nomes que geram ambiguidade, definir de forma clara os schemas de dados que uma ferramenta usa, se uma tool for muito generica é interessante dividila em mais tools, por exemplo "Analizar documento" pode virar "Extrair dados importantes" "Sumarizar conteudo" "Verificar veracidade dos dados"
- [ ] Adicionar key words no system prompt do agente pode ajudar a incentivar ele a escolher certas ferramentas
- [ ] A tool deve ter uma resposta estruturada deixando claro se foi um sucesso ou um erro, e se foi um erro qual tipo de erro foi e se é um erro que o agente pode retentar chamar a tool novamente, por exemplo
   ```json
  {
    "isError": true,
    "errorCategory": "business", 
    "isRetryable": false,
    "message": "Refund exceeds $500 policy limit",
    "userFriendlyMessage": "This refund requires manager approval. Let me escalate this for you."
  }
   ```
- [ ] Uma forma de dividir os erros seria como 
  - [ ] Transient, Timeout ou serviço indisponivel, pode ser retentado, tentar após aguardar um pouco até um limite maximo
  - [ ] Validation, Formato de input invalido, não pode ser retentado, deve ser corrigido o parametro e tentado com o parametro correto
  - [ ] Business, Erro de regra de negocio do sistema, não deve ser retentado e deve informar o usuario oque ocorreu e sugerir alternativas
  - [ ] Permission, Não autorizado a realizar a ação, não deve ser retentado, escalar para um Humano ou solicitar credenciais de acesso caso seja uma possibilidade
- [ ] SubAgentes devem lidar com falhas transientes de forma local e caso não consigam devem informar o Coordenador, com resultados obtidos, oque foi tentado, qual falha não foi possivel ser contornada 
- [ ] As ferramentas devem ser distribuidas com o principio de menor privilegio possivel somente fornecendo o minimo necessario para o agente
- [ ] As ferramentas de MCP devem ser descritivas 
- [ ] Servidores MCP podem ser da comunidade (Github Jira, ...) ou Criados, é interessante saber quando usar cada um
  - [ ] Criar um servidor proprio é interessante quando tiver fluxo de trabalho muito especificos, APIs internas, requisitos de segurança, ou definir melhor descrições

## Claude Code & WorkFlows

- [ ] Claude.md é onde fica os pontos principais do projeto
- [ ] CLAUDE.md pode ser modular usando o comando `@import` mas pode ser mais interessante separar em rules para não ocupar o contexto inicial do projeto
- [ ] skills são para o claude ter dados do que e de como fazer elas podem ter as seguintes props
  - [ ] description, para definir oque é e quando deve ser usada
  - [ ] allowed-tools, as ferramentas que ela pode usar
  - [ ] context, quando for fork ao invés de ser executada no agente principal ela sera executada em um subagente
  - [ ] model, modelo que aquela skill ira usar
  - [ ] argument-hint: "migration name", para ajudar o usuario a passar uma prop para a skill
- [ ] as rules são regras aplicadas a um formato de codigo especifico para que ela por exemplo paths: `["**/*.test.tsx"]`
- [ ] Modo plano serve para planejar uma implementação antes de executar qualquer coisa, eu pessoalmente não gosto de usar ela e prefiro um fluxo gerando arquivos e specs com um SDD (Spec Driven Development)
- [ ] Uma otimização para deixar o claude assertivo pode ser uma abordagem de TDD (Test Driven Development) assim tu escrevendo os testes antes de pedir algo para o claude assim dando a ele mais clareza do que precisa ser feito
- [ ] Algo para ajudar é um padrão de entrevistas onde você pede para o claude te perguntar sobre abordagens diferentes e duvidas e depois pedir para ele fazer algo
- [ ] Claude no CI/CD é interessante deixar o output dele em um formato definido, por exemplo ao avaliar um PR no github, pedir como resposta um JSON no formato para enviar uma RC usando a API do github
- [ ] ao usar o claude em CI/CD é interessante passar para ele um cenario geral com os pontos ja levantados para evitar ele repetir RCs

## Prompt Engineering

- [ ] Criterios especificos ao invés de informações vagas, ao invés de "Categorize produtos" usar um "Marque produtos com menos de 10 items como acabando" "Marque produtos com valor acima de R$ 10,00 como muito baratos"
- [ ] Um prompt deve ter limites eespecificos sobre oque deve e oque não deve ser feito
- [ ] Evitar prompts que causem um falso positivo devido a ambiguidades, caso isso aconteça o idela é remover tudo que causa ambiguidade e ir melhorando o prompt aos poucos para ele parar com isso
- [ ] A técnica de few shot é interessante para o prompt saber melhor como lidar com cenarios ambiguos
- [ ] Usar um chain of thought (Pedir para o modelo explicar a linha de raciocinio) evita ele a fugir demais do cenario que esta atuando
- [ ] Nos exemplos incluir o "Porque" daquele cenario ser correto e não somente um "Este é o correto"
- [ ] Show dont tell, mostar no prompt exemplos do que esta correto e formatos esperados de inuts e outputs
- [ ] Retentar mas pasando feedback de erros anteriores sobre oque deve ser feito
- [ ] Usar estrategis de batch processing quando possivel para economizar nos prompts
- [ ] Usar cache de prompt para economizar nos custos de chamadas a LLM
- [ ] Uma estrategia para melhorar a confiabilidade das respostas é de gerar uma instancia limpa para testar a solição sem o contexto de como ela foi encontrada, isso para ter duas validações da mesma coisa uma com o contexto todo e a outra recebendo somente a resposta e as guidelines para verificar se esta correto
- [ ] Para evitar conflitos e alucinação, ao invés de avaliar tudo em um unico prompt pode ser interessante seprar isso em varios arquivos separados e depois juntar todos em um unico local

## Context & Reliability

- [ ] Usar RAG para buscar informações
- [ ] Usar tools para buscar informações
- [ ] Contextos muito longos tendem a perder o meio deles, o ideal seria manter o contexto baixo
- [ ] Contextos longos são um problema, o ideal é sumarizar os dados importantes no inicio dele e limpar estes contextos deixando apenas informações e ações relevantes
- [ ] Ao lidar com usuarios pode ser interessante ter uma memoria das ultimas interações com ele e iniciar o contexto ja com ela
- [ ] é interessante ter criterios de quando escalar para um Humano, 
  - [ ] Para escalar é interassante quando a situação for, Alguma defice de politica do Agente, o cliente pediu explicitamente para falar com um humano, Limites do que o agente pode fazer, o agente ficar preso ao tentar resolver um problema
  - [ ] Motivos ruims para escalar são, multiplas preocupações em uma mensagem, cliente estar frustrado, Reports de confianças do proprio agente, tarefa complexa mas esta dentro das politicas do agente
  - [ ] Para isso é interessante deixar claro ao agente oque ele deve fazerm, por exemplo "Preço esta menor que R$ 10,00" e "Escale para um humano com o preço exceder R$ 10,00"
  - [ ] Quando o cliente estiver frustrado tente resolver e sugerir sugestões, só escale para humano se for realmente necessario
- [ ] caso o agente busque por resultados e encontre valores ambiguos ele deve buscar por clarificação com o cliente, por exemplo se ele encontrar uma listas de usuarios com o nome "Lucas" ele pode solicitar para o cliente um Email para confirmar qual dos Lucas é o correto
- [ ] Quando um subagente tem um erro o ideal é ele propagar ele com o maximo de informações possiveis para o agente principal
- [ ] Graceful degradation: é preferivel dar informações parcials explicando o motivo dela não estar completa do que simplesmente retornar que teve um problema
- [ ] Quando uma tarefa tiver um contexto muito grande é interessante quebra-la em varias fases menores
- [ ] Ao lidar com dados conflitantes no contexto sempre deixe o maximo d informação possivel por exemplo ao buscar um relatorio financeiro o valor de vendas, ao invés de buscar "R$200,00", "R$ 100,00", adicione tambem uma informação do ano deste valores, assim o agente pode ter um contexto de queda ou alta do valor ao invpes apenas do valor jogado ali
- [ ] Para buscas na Web é interessante o agente sempre deixar as fontes que ele usou e usar somente fontes confiaveis, limitando o escopo dele para somente dominios conhecidos


# Problemas em arquitetura agentica:

- [ ] Como fazer um processo descente de chunking para um documento ser utilizado em um fluxo com RAG
  - Separar por paragrafos
  - Separar por contexto
  - Fazer Overlap de informações 
- [ ] Como criar testes automatizados para sistemas agenticos?
  - Mesmos testes de sistemas normais, mas sem testar a LLM
- [ ] Como fazer Eval de prompts
  - LangChain ? 
  - Golden Dataset?
- [ ] Como manter contexto em um agente orquestrador
- [ ] Como delegar corretamente o atendimento a um Humano?


<br>

---

Developed by [Alessandro Massarotti Jr](https://github.com/Alessandro-Massarotti-Jr) 🤖