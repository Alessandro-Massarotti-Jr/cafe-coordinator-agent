# Plano de Adequação às Guidelines Agênticas

Plano por fases para alinhar o `backend/` às guidelines do [README](../README.md) (seções _Agentic Architecture_, _Tool Design & MCP_, _Prompt Engineering_ e _Context & Reliability_).

As fases estão ordenadas por dependência e risco: cada uma entrega valor sozinha e as posteriores assumem a infra criada pelas anteriores.

| Fase | Tema | Guidelines cobertas | Esforço |
| --- | --- | --- | --- |
| 1 | Loop de execução confiável | 36, 37, 46 | P |
| 2 | Contrato de erro unificado | 74-88, 90 | M |
| 3 | Resiliência e propagação de falhas | 85, 89, 140, 141 | M |
| 4 | Escalação para humano | 60-64, 134-138 | M |
| 5 | Prompts do Coordenador e subagentes | 41-44, 47, 55, 114-121 | M |
| 6 | Gestão de contexto e memória | 68, 131-133, 142 | G |
| 7 | Guards, PostToolUse e roteamento de modelo | 58, 66, 67 | M |
| 8 | Qualidade de RAG | 149-152 | P |
| 9 | Testes e eval | 153-157, 124 | G |

---

## Fase 1 — Loop de execução confiável

**Problema:** o loop de agente decide continuar apenas olhando `message.tool_calls`, descarta o `done_reason` do Ollama, não tem limite de iterações e devolve resultados de tool sem identificar de qual chamada vieram.

**Arquivos:** [ILlmProvider.ts](../backend/src/providers/LlmProvider/interfaces/ILlmProvider.ts), [OllamaLlmProvider.ts](../backend/src/providers/LlmProvider/implementations/OllamaLlmProvider.ts), [AgentRunner.ts](../backend/src/services/AgentRunner.ts)

### ⚠️ O `done_reason` do Ollama não equivale ao `stop_reason` do Claude

A guideline (linha 36 do README) foi escrita para a API da Anthropic, onde `stop_reason: "tool_use"` **é** o sinal de que o modelo quer chamar uma ferramenta. **No Ollama isso não existe.** Os valores documentados de `done_reason` são:

| `done_reason` | Significado |
| --- | --- |
| `stop` | Fim de geração — **inclusive quando há `tool_calls`** |
| `length` | Geração truncada por atingir `num_predict` / limite de contexto |
| `load` | Resposta de carregamento do modelo, com `message` vazia |
| `unload` | Resposta de descarregamento do modelo, com `message` vazia |

Ou seja: uma resposta com `tool_calls` e uma resposta final de texto chegam **ambas** com `done_reason: "stop"`. Não dá para usar `done_reason` como condição do loop — a presença de `message.tool_calls` continua sendo o único sinal disponível.

O valor do `done_reason` aqui é outro: detectar os casos que hoje passam despercebidos. `length` significa resposta truncada (potencialmente um `tool_calls` JSON incompleto), e `load`/`unload` retornam `message` vazia — que o código atual entregaria ao cliente como resposta final em branco.

**Duas ressalvas adicionais:**

- **Overflow de contexto é silencioso.** O Ollama trunca o prompt sem sinalizar em `done_reason`. Não existe verificação possível no provider — é o que motiva a gestão de contexto da Fase 6.
- **`num_predict` precisa ser confirmado no ambiente.** A documentação do Ollama é inconsistente sobre o default (`128` vs `-1`), e isso determina se `length` chega a ocorrer. Vale fixar o valor explicitamente nas options da requisição em vez de depender do default.

### Passos

1. Adicionar `stopReason` ao `LlmChatResult`, mas derivando-o de **duas** fontes, não só do `done_reason`:
   - `message.tool_calls?.length` presente → `tool_calls` (inferido da mensagem, não do `done_reason`);
   - `done_reason: "stop"` sem tool calls → `end_turn`;
   - `done_reason: "length"` → `truncated`;
   - `done_reason: "load" | "unload"` → `no_completion`;
   - `done_reason` ausente (versões antigas / streaming) → `unknown`, tratado defensivamente.
2. Manter o `while` do `AgentRunner` guiado pela presença de `tool_calls`, agora através do `stopReason` normalizado — a mudança é de expressividade e de tratamento dos demais casos, não da condição em si.
3. Tratar explicitamente os estados que hoje são ignorados:
   - `truncated`: não entregar o texto cortado como resposta final; sinalizar resposta parcial. Se houver `tool_calls` truncados, o JSON de argumentos provavelmente está incompleto — hoje o `safeParse` engole isso e devolve `{}` silenciosamente, fazendo a tool rodar sem argumentos.
   - `no_completion`: `message` vazia não é resposta; retentar em vez de devolver string vazia ao cliente.
4. Fazer o `safeParse` de argumentos falhar de forma explícita em vez de retornar `{}` — argumento inválido deve virar erro de `validation` para o modelo corrigir e retentar (encaixa no envelope da Fase 2).
5. Introduzir `MAX_ITERATIONS` (sugestão: 8) no loop. Ao estourar, encerrar com um resultado que informa ao chamador que o limite foi atingido, junto do que já foi coletado.
6. Propagar identidade da tool no resultado: incluir `tool_call_id` (ou índice estável) e `name` na mensagem `role: "tool"`, para que chamadas paralelas sejam correlacionáveis pelo modelo.
7. Correlacionar os resultados do `Promise.all` por índice antes de dar `push` no histórico, garantindo ordem determinística independente de qual tool terminou primeiro.

**Critério de pronto:** duas tools chamadas em paralelo produzem duas mensagens `tool` distinguíveis por nome; um modelo em loop é interrompido no limite com mensagem explícita; resposta truncada ou de `load`/`unload` nunca chega ao cliente como resposta final.

**Fontes:** [Ollama API — chat](https://docs.ollama.com/api/chat) · [Ollama API — generate](https://docs.ollama.com/api/generate)

---

## Fase 2 — Contrato de erro unificado nas tools

**Problema:** o `products-mcp` já implementa o envelope estruturado do README, mas as tools locais do backend usam três formatos diferentes (`{success,message}`, `{found,message}`, array cru do Qdrant, `{error}`).

**Arquivos:** novo `backend/src/agents/ToolResponse.ts`, todas as tools em `agents/*/tools/`, [AgentRunner.ts](../backend/src/services/AgentRunner.ts)

**Passos**

1. Criar o tipo `ToolResponse` no backend espelhando o do MCP:
   ```ts
   type ToolResponse<T> = {
     isError: boolean;
     errorCategory?: "transient" | "validation" | "business" | "permission" | null;
     isRetryable?: boolean | null;
     message: string;
     userFriendlyMessage: string;
     data?: T | null;
   };
   ```
2. Tipar `Tool.execute` como `Promise<ToolResponse<unknown>>` para que o compilador force a adequação de todas as implementações.
3. Migrar as tools, mapeando cada falha para sua categoria:
   - `CreateOrderTool`: produto inexistente e quantidade inválida → `validation`; estoque insuficiente → `business`.
   - `GetOrderTool` / `ListOrdersTool`: "não encontrado" é resultado vazio de sucesso, não erro — `isError: false` com `data: null` e `userFriendlyMessage` explicando.
   - `UpdateOrderStatusTool`: status fora do enum → `validation`; pedido inexistente → `business`.
   - `FindCompanyInfoTool`: envelopar o retorno do Qdrant; busca sem resultado → sucesso com `data: []`.
4. Padronizar o caso "ferramenta não encontrada" do `AgentRunner` como `ToolResponse` com `errorCategory: "validation"` e `isRetryable: false`.
5. Reaproveitar o envelope do MCP sem reembrulhar: `McpTool.execute` já recebe o formato correto — apenas validar o shape e repassar.

**Critério de pronto:** toda tool do sistema, local ou MCP, responde no mesmo envelope, e o modelo consegue decidir retentativa a partir de `isRetryable`.

---

## Fase 3 — Resiliência e propagação de falhas

**Problema:** não há retry para falhas transientes em Ollama/Qdrant/MCP, e uma exceção dentro de um subagente derruba a request inteira, sem chegar ao Coordenador.

**Arquivos:** novo `backend/src/services/retry.ts`, providers, [DelegateAgentTool.ts](../backend/src/agents/coordinator/tools/DelegateAgentTool.ts), [index.ts](../backend/src/index.ts)

**Passos**

1. Criar um helper de retry com backoff exponencial e teto de tentativas, aplicável apenas a erros classificados como `transient` (timeout, ECONNREFUSED, 5xx).
2. Aplicar no `OllamaLlmProvider`, `OllamaEmbeddingProvider`, `QdrantCompanyRepository` e `McpToolProvider`. Erros não-transientes falham imediatamente, sem gastar tentativa.
3. Envolver a execução de cada tool no `AgentRunner` em try/catch, convertendo exceções não tratadas em `ToolResponse` com `errorCategory: "transient"` — uma tool que quebra nunca deve matar o loop.
4. Dar try/catch ao `DelegateAgentTool`, retornando ao Coordenador um resultado estruturado de falha contendo: especialista, o que foi tentado, resultados parciais obtidos, e a falha que não foi contornada (guideline 89).
5. Aplicar _graceful degradation_ no endpoint SSE: se parte das delegações teve sucesso, o Coordenador compõe resposta parcial explicando o que faltou, em vez do erro genérico atual.
6. Emitir um evento SSE de degradação para o frontend distinguir "resposta parcial" de "falha total".

**Critério de pronto:** derrubar o `products-mcp` com o Ollama no ar ainda produz resposta útil ao cliente sobre horário/endereço, explicando que o cardápio está indisponível.

---

## Fase 4 — Escalação para humano

**Problema:** a seção de escalação do README não tem nenhuma cobertura no código — não há tool, critério, nem formato de handoff.

**Arquivos:** novo `backend/src/agents/coordinator/tools/EscalateToHumanTool.ts`, novo repositório de escalações, [coordinator/index.ts](../backend/src/agents/coordinator/index.ts)

**Passos**

1. Criar `EscalateToHumanTool` com o payload estruturado da guideline 60-64: dados do cliente e cenário, análise de causa raiz, ação requisitada pelo cliente, recomendações de solução.
2. Persistir a escalação (repositório em memória, no mesmo padrão de `InMemoryOrdersRepository`) e devolver um protocolo ao cliente.
3. Adicionar ao prompt do Coordenador os critérios **de escalar**: pedido explícito por humano, situação fora da política do agente, limite de capacidade do agente, agente travado após tentativas.
4. Adicionar explicitamente os critérios **de não escalar** (guideline 136): múltiplas preocupações numa mensagem, cliente frustrado, baixa confiança do próprio agente, tarefa complexa mas dentro da política.
5. Definir gatilhos numéricos concretos em vez de linguagem vaga — ex.: pedido acima de determinado valor, ou cancelamento de pedido já entregue.
6. Instruir o comportamento diante de frustração: tentar resolver e oferecer alternativas primeiro; escalar só se persistir.

**Critério de pronto:** "quero falar com um atendente humano" gera escalação com protocolo; "meu pedido está demorando" não gera.

---

## Fase 5 — Prompts do Coordenador e subagentes

**Problema:** o prompt do Coordenador não tem guidelines de decomposição, nenhum prompt pede raciocínio explícito, e os exemplos few-shot são escassos e sem justificativa.

**Arquivos:** todos os `agents/*/index.ts`, [Agent.ts](../backend/src/agents/Agent.ts)

**Passos**

1. Adicionar ao Coordenador a etapa de **enumerar tópicos antes de decompor** (guideline 43) para perguntas amplas ou com múltiplas intenções.
2. Documentar critérios de granularidade — o que é específico demais e o que é genérico demais — para evitar decomposição inútil.
3. Instruir o **agrupamento por conteúdo** ao dividir tarefas entre subagentes, evitando dois especialistas retornando a mesma informação (guideline 44).
4. Generalizar o padrão de pré-busca já usado em recomendação: buscar dados comuns antes de decompor quando a pergunta traz várias preocupações (guideline 65).
5. Reforçar no prompt que subagentes **não conhecem o histórico** e que o campo `task` deve ser autocontido, com exemplo de tarefa bem e mal formulada.
6. Alinhar a divisão de responsabilidade da guideline 47: prompt do Coordenador com procedimento e critérios de qualidade; prompts dos subagentes com o conhecimento da ação.
7. Adicionar few-shot com o **porquê** nos pontos de ambiguidade conhecidos (guideline 119) — pedido por nome sem código de produto, produto sem estoque, cliente pedindo recomendação sem contexto.
8. Adicionar instrução de clarificação em resultado ambíguo (guideline 139): vários pedidos do mesmo cliente → perguntar qual, em vez de escolher.
9. Corrigir `Agent.getInstructions()`, que hoje prefixa `"Seu nome é X sua instrução é Y"` — montar um cabeçalho estruturado em vez de concatenação em frase.

**Critério de pronto:** uma pergunta com três intenções ("qual o horário, o que tem de doce e quero pedir dois") resulta em delegações distintas e sem sobreposição.

---

## Fase 6 — Gestão de contexto e memória

**Problema:** o histórico completo é reenviado a cada turno, sem sumarização nem poda, e não existe memória entre sessões do mesmo cliente.

**Arquivos:** novo `backend/src/services/ConversationStore.ts`, novo `ContextCompactor`, [index.ts](../backend/src/index.ts)

**Passos**

1. Criar conceito de sessão de conversa persistida por `sessionId`, separado do `pendingChats` (que hoje é só um buffer de 60s entre POST e SSE).
2. Implementar sumarização por limiar: ao passar de N mensagens ou N tokens, resumir os turnos antigos e manter íntegros só os recentes (guidelines 131-132).
3. Colocar o resumo **no início** do contexto, com as informações e ações relevantes preservadas, seguindo a guideline 132.
4. Manter memória das últimas interações do cliente e injetá-la no início do contexto de uma nova conversa (guideline 133).
5. Preservar metadados de desambiguação ao sumarizar (guideline 143): datas, códigos e valores nunca podem ser perdidos no resumo, para não gerar contexto conflitante.
6. Separar conteúdo de metadados ao passar contexto aos subagentes (guideline 53) e nunca resumir a busca antes de repassar (guideline 54).
7. Quebrar tarefas de contexto muito grande em fases menores no Coordenador (guideline 142).

**Critério de pronto:** conversa de 30 turnos mantém o nome do cliente e o pedido em aberto sem reenviar o histórico completo.

---

## Fase 7 — Guards, PostToolUse e roteamento de modelo

**Arquivos:** [Tool.ts](../backend/src/agents/Tool.ts), [AgentRunner.ts](../backend/src/services/AgentRunner.ts), [Agent.ts](../backend/src/agents/Agent.ts), tools de pedidos

**Passos**

1. Criar um mecanismo de pré-condição por tool (guideline 58). Caso concreto: `updateOrderStatus` só executa se `getOrder` do mesmo pedido tiver ocorrido antes na sessão — é o exemplo literal do README.
2. Violação de guard retorna `errorCategory: "permission"`, `isRetryable: false`, orientando o modelo a buscar o pedido primeiro.
3. Criar um hook `PostToolUse` no `AgentRunner` (guideline 66) rodando depois de toda tool, para: registrar uso de ferramenta, e transformar/filtrar o resultado antes de o modelo ver.
4. Usar o hook para filtrar dados sensíveis do retorno — dados de cliente em `listOrders` não precisam chegar íntegros ao modelo.
5. Trocar o tipo literal `model: "gemma4"` por um enum de modelos, habilitando roteamento (guideline 67).
6. Rotear os agentes simples para o modelo mais barato/rápido — Recomendação e Atendente não precisam do mesmo modelo do Coordenador.

**Critério de pronto:** cancelar um pedido sem tê-lo consultado é bloqueado com mensagem acionável; troca de modelo por agente é uma linha de configuração.

---

## Fase 8 — Qualidade do RAG

**Problema:** o chunking usa `slice` de 500 caracteres, cortando no meio de palavras e frases (guideline 149-152).

**Arquivos:** [seedCompany.ts](../backend/src/seeds/seedCompany.ts)

**Passos**

1. Trocar o corte por caractere por separação em parágrafos, agrupando parágrafos até o tamanho alvo sem quebrar frase.
2. Manter o overlap por sentença completa, não por caractere.
3. Enriquecer o payload indexado com metadados (seção do documento, título), para o agente citar de onde veio a informação.
4. Retornar score de similaridade junto do resultado da busca, permitindo ao agente reconhecer resultado fraco e admitir que não sabe.

**Critério de pronto:** nenhum chunk indexado começa ou termina no meio de uma palavra.

---

## Fase 9 — Testes e eval

**Problema:** o `backend` tem zero testes (`npm test` retorna erro) e não existe eval de prompt. O `JudgeAgent` existe em `build/` mas foi removido do `src/`.

**Passos**

1. Configurar Jest no `backend`, no mesmo padrão já usado no `products-mcp`.
2. Testar o determinístico, sem testar a LLM (guideline 154): tools, repositórios, chunking, helper de retry, guards, `parseMcpResult`.
3. Testar o `AgentRunner` com um `ILlmProvider` fake, cobrindo: `stopReason`, limite de iterações, execução paralela, correlação de resultados e falha de tool.
4. Restaurar o `JudgeAgent` em `src/`, aplicando a guideline 124: validar a resposta numa instância limpa, sem o contexto de como foi obtida.
5. Montar um golden dataset de perguntas por especialista, com o resultado esperado, para eval de prompt (guideline 155).
6. Registrar as métricas de eval no LangSmith, aproveitando o tracing já instrumentado.

**Critério de pronto:** `npm test` verde no `backend`, e o golden dataset roda produzindo taxa de acerto comparável entre versões de prompt.
