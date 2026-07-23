import { toolSuccess } from "../../agents/ToolResponse";
import {
  createPostToolUseHook,
  maskCustomerName,
  redactOrdersListing,
} from "./postToolUse";

describe("maskCustomerName", () => {
  it("mantém o primeiro nome e abrevia o restante", () => {
    expect(maskCustomerName("Ana Maria Souza")).toBe("Ana M. S.");
  });

  it("mantém nome único inalterado", () => {
    expect(maskCustomerName("Ana")).toBe("Ana");
  });
});

describe("redactOrdersListing", () => {
  it("filtra dados de cliente antes de o modelo ver", () => {
    const result = redactOrdersListing(
      toolSuccess({
        message: "ok",
        userFriendlyMessage: "ok",
        data: {
          count: 1,
          orders: [{ id: "ORD-0001", customerName: "Ana Maria Souza" }],
        },
      }),
    );

    const orders = (result.data as { orders: Array<{ customerName: string }> })
      .orders;
    expect(orders[0]?.customerName).toBe("Ana M. S.");
  });

  it("ignora payload sem lista de pedidos", () => {
    const original = toolSuccess({
      message: "ok",
      userFriendlyMessage: "ok",
      data: null,
    });

    expect(redactOrdersListing(original)).toBe(original);
  });
});

describe("createPostToolUseHook", () => {
  it("registra o uso da ferramenta", () => {
    const logger = { log: jest.fn() };
    const hook = createPostToolUseHook(logger);

    hook({
      toolName: "getOrder",
      args: {},
      result: toolSuccess({ message: "ok", userFriendlyMessage: "ok" }),
      session: undefined,
    });

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("name=getOrder"),
    );
  });

  it("não altera resultado de ferramenta sem redator registrado", () => {
    const hook = createPostToolUseHook({ log: jest.fn() });
    const result = toolSuccess({ message: "ok", userFriendlyMessage: "ok" });

    expect(hook({ toolName: "getOrder", args: {}, result })).toBe(result);
  });
});
