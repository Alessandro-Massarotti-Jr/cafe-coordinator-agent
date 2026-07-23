import { isTransientError, withRetry } from "./retry";

const noSleep = async () => {};

describe("isTransientError", () => {
  it("classifica códigos de rede como transientes", () => {
    expect(isTransientError({ code: "ECONNREFUSED" })).toBe(true);
    expect(isTransientError({ code: "ETIMEDOUT" })).toBe(true);
  });

  it("classifica 5xx e 429 como transientes", () => {
    expect(isTransientError({ response: { status: 503 } })).toBe(true);
    expect(isTransientError({ response: { status: 429 } })).toBe(true);
  });

  it("não classifica 4xx comum como transiente", () => {
    expect(isTransientError({ response: { status: 400 } })).toBe(false);
    expect(isTransientError(new Error("produto inválido"))).toBe(false);
  });
});

describe("withRetry", () => {
  it("retorna o resultado sem retentar quando a operação passa", async () => {
    const operation = jest.fn().mockResolvedValue("ok");

    await expect(withRetry(operation, { sleep: noSleep })).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retenta falhas transientes até o teto de tentativas", async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce({ code: "ECONNREFUSED" })
      .mockRejectedValueOnce({ code: "ECONNREFUSED" })
      .mockResolvedValue("ok");

    await expect(
      withRetry(operation, { attempts: 3, sleep: noSleep }),
    ).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("falha imediatamente em erro não transiente sem gastar tentativa", async () => {
    const operation = jest.fn().mockRejectedValue(new Error("validação"));

    await expect(
      withRetry(operation, { attempts: 3, sleep: noSleep }),
    ).rejects.toThrow("validação");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("propaga o erro quando as tentativas se esgotam", async () => {
    const operation = jest.fn().mockRejectedValue({ code: "ETIMEDOUT" });

    await expect(
      withRetry(operation, { attempts: 2, sleep: noSleep }),
    ).rejects.toEqual({ code: "ETIMEDOUT" });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("aplica backoff exponencial crescente", async () => {
    const delays: number[] = [];
    const operation = jest.fn().mockRejectedValue({ code: "ETIMEDOUT" });

    await expect(
      withRetry(operation, {
        attempts: 4,
        baseDelayMs: 100,
        sleep: async (ms) => {
          delays.push(ms);
        },
      }),
    ).rejects.toBeDefined();

    expect(delays).toEqual([100, 200, 400]);
  });
});
