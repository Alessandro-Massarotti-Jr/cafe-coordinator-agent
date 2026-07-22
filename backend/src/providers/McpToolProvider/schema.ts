import { Parameter } from "../../agents/Tool";

type JsonSchema = {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
};

/**
 * Converte o `inputSchema` (JSON Schema) de uma ferramenta MCP para a lista de
 * `Parameter` usada internamente pelas tools dos agentes. Aceita `unknown` para
 * absorver as pequenas diferenças de tipo do schema devolvido pelo SDK do MCP.
 */
export function toParameters(input: unknown): Parameter[] {
  const schema = (input ?? {}) as JsonSchema;
  const properties = schema.properties ?? {};
  const required = schema.required ?? [];

  return Object.entries(properties).map(([name, definition]) =>
    toParameter(name, definition, required.includes(name)),
  );
}

function toParameter(
  name: string,
  definition: JsonSchema,
  required: boolean,
): Parameter {
  const type = normalizeType(definition.type);
  const description = definition.description ?? "";

  if (type === "array") {
    return {
      name,
      type,
      description,
      required,
      items: toParameter("item", definition.items ?? { type: "string" }, true),
    };
  }

  if (type === "object") {
    return {
      name,
      type,
      description,
      required,
      properties: toParameters(definition),
    };
  }

  return { name, type, description, required };
}

function normalizeType(
  type: string | undefined,
): "string" | "number" | "boolean" | "object" | "array" {
  switch (type) {
    case "integer":
      return "number";
    case "number":
    case "boolean":
    case "object":
    case "array":
      return type;
    default:
      return "string";
  }
}
