export type GoldenCase = {
  id: string;
  specialist: "coordinator" | "attendant" | "products" | "orders" | "recommendation";
  question: string;
  expectations: string[];
  shouldEscalate?: boolean;
};

export const GOLDEN_DATASET: GoldenCase[] = [
  {
    id: "attendant-horario",
    specialist: "attendant",
    question: "Vocês abrem no domingo? Que horas?",
    expectations: [
      "Informa que abre aos domingos",
      "Informa o horário das 8h às 18h",
    ],
  },
  {
    id: "attendant-pets",
    specialist: "attendant",
    question: "Posso levar meu cachorro?",
    expectations: [
      "Informa que pets são aceitos apenas no terraço externo",
      "Menciona a exigência de coleira ou caixa de transporte",
    ],
  },
  {
    id: "attendant-desconhecido",
    specialist: "attendant",
    question: "Vocês têm sala de cinema no local?",
    expectations: [
      "Admite não ter a informação em vez de inventar",
      "Não afirma que existe sala de cinema",
    ],
  },
  {
    id: "products-cardapio",
    specialist: "products",
    question: "O que vocês têm de doce hoje?",
    expectations: [
      "Lista produtos reais do catálogo",
      "Inclui o código PROD-XXX de cada item",
      "Informa preços em reais",
    ],
  },
  {
    id: "orders-sem-codigo",
    specialist: "orders",
    question: "Quero dois pão de queijo, meu nome é Ana",
    expectations: [
      "Não inventa código de produto",
      "Obtém o código do produto antes de criar o pedido, ou pede o código",
    ],
  },
  {
    id: "orders-consulta-inexistente",
    specialist: "orders",
    question: "Como está meu pedido ORD-9999?",
    expectations: [
      "Informa que não encontrou o pedido",
      "Não trata a ausência como erro do sistema",
    ],
  },
  {
    id: "recommendation-sem-contexto",
    specialist: "recommendation",
    question: "Me indica alguma coisa boa aí",
    expectations: [
      "Recomenda de 1 a 3 itens existentes no catálogo",
      "Justifica brevemente cada sugestão",
    ],
  },
  {
    id: "coordinator-multiplas-intencoes",
    specialist: "coordinator",
    question:
      "Qual o horário de vocês, o que tem de doce e quero pedir dois cafés. Meu nome é Bruno.",
    expectations: [
      "Responde o horário de funcionamento",
      "Lista as opções de doce",
      "Trata o pedido dos dois cafés ou pede o código do produto",
      "Entrega uma única resposta coesa, sem repetir informação",
    ],
  },
  {
    id: "coordinator-fora-de-escopo",
    specialist: "coordinator",
    question: "Qual a previsão do tempo para amanhã?",
    expectations: [
      "Explica educadamente que só ajuda com assuntos da cafeteria",
      "Não responde sobre o tempo",
    ],
  },
  {
    id: "coordinator-escalacao-explicita",
    specialist: "coordinator",
    question: "Quero falar com um atendente humano agora.",
    expectations: [
      "Escala o atendimento",
      "Informa o número de protocolo ao cliente",
    ],
    shouldEscalate: true,
  },
  {
    id: "coordinator-frustracao-sem-escalar",
    specialist: "coordinator",
    question: "Meu pedido está demorando demais, isso é um absurdo!",
    expectations: [
      "Reconhece a frustração do cliente",
      "Tenta resolver consultando o pedido ou pedindo o código",
      "Não transfere para atendente humano",
    ],
    shouldEscalate: false,
  },
];
