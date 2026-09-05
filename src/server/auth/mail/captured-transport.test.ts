import { afterEach, describe, expect, it, vi } from "vitest";
import { TimeoutError } from "../with-timeout";
import { createCapturedTransport, outboxKey, readCapturedMessages } from "./captured-transport";

const NOW = new Date("2026-09-04T12:00:00Z");
const MESSAGE = { to: "a@b.co", subject: "Assunto", text: "corpo" };
const hanging = () => new Promise<never>(() => {});

afterEach(() => vi.useRealTimers());

describe("captured-transport", () => {
  it("grava a mensagem com LPUSH na chave do e-mail normalizado e EXPIRE 3600", async () => {
    const store = { lpush: vi.fn(async () => 1), expire: vi.fn(async () => 1) };
    await createCapturedTransport(store, () => NOW).send({
      to: " Ruben@Exemplo.com ",
      subject: "Assunto",
      text: "corpo",
    });
    expect(store.lpush).toHaveBeenCalledTimes(1);
    const [key, value] = store.lpush.mock.calls[0] as unknown as [string, string];
    expect(key).toBe("dev:outbox:ruben@exemplo.com");
    expect(JSON.parse(value)).toEqual({
      to: " Ruben@Exemplo.com ",
      subject: "Assunto",
      text: "corpo",
      createdAt: NOW.toISOString(),
    });
    expect(store.expire).toHaveBeenCalledWith(key, 3600);
  });

  it("ping não faz nada", async () => {
    const store = { lpush: vi.fn(async () => 1), expire: vi.fn(async () => 1) };
    await expect(createCapturedTransport(store).ping()).resolves.toBeUndefined();
    expect(store.lpush).not.toHaveBeenCalled();
  });

  it("lê as mensagens mais recentes primeiro e ignora entradas corrompidas", async () => {
    const newest = {
      to: "a@b.co",
      subject: "2",
      text: "t2",
      createdAt: "2026-09-04T12:01:00.000Z",
    };
    const oldest = {
      to: "a@b.co",
      subject: "1",
      text: "t1",
      createdAt: "2026-09-04T12:00:00.000Z",
    };
    const reader = {
      lrange: vi.fn(async () => [
        JSON.stringify(newest),
        "{corrompido",
        JSON.stringify({ x: 1 }),
        JSON.stringify(oldest),
      ]),
    };
    const messages = await readCapturedMessages(reader, "A@b.co");
    expect(reader.lrange).toHaveBeenCalledWith(outboxKey("a@b.co"), 0, -1);
    expect(messages).toEqual([newest, oldest]);
  });

  describe("timeout dos comandos Redis (R-3 / S-3)", () => {
    it("send: LPUSH sem resposta → TimeoutError dentro do limite e EXPIRE nunca é chamado", async () => {
      const store = { lpush: vi.fn(hanging), expire: vi.fn(async () => 1) };
      await expect(
        createCapturedTransport(store, () => NOW, 10).send(MESSAGE),
      ).rejects.toBeInstanceOf(TimeoutError);
      expect(store.expire).not.toHaveBeenCalled();
    });

    it("send: EXPIRE sem resposta → TimeoutError", async () => {
      const store = { lpush: vi.fn(async () => 1), expire: vi.fn(hanging) };
      await expect(
        createCapturedTransport(store, () => NOW, 10).send(MESSAGE),
      ).rejects.toBeInstanceOf(TimeoutError);
    });

    it("send: erro do Redis passa tal como é (não vira TimeoutError)", async () => {
      const store = {
        lpush: vi.fn(async () => {
          throw new Error("ECONNREFUSED");
        }),
        expire: vi.fn(async () => 1),
      };
      await expect(createCapturedTransport(store, () => NOW, 10).send(MESSAGE)).rejects.toThrow(
        "ECONNREFUSED",
      );
    });

    it("send: o limite por defeito é 2 s", async () => {
      vi.useFakeTimers();
      const store = { lpush: vi.fn(hanging), expire: vi.fn(async () => 1) };
      const settled = vi.fn<(outcome: unknown) => void>();
      const pending = createCapturedTransport(store)
        .send(MESSAGE)
        .then(
          () => settled("ok"),
          (error: unknown) => settled(error),
        );
      await vi.advanceTimersByTimeAsync(1_999);
      expect(settled).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(settled).toHaveBeenCalledTimes(1);
      expect(settled.mock.calls[0][0]).toBeInstanceOf(TimeoutError);
    });

    it("readCapturedMessages: LRANGE sem resposta → TimeoutError", async () => {
      const reader = { lrange: vi.fn(hanging) };
      await expect(readCapturedMessages(reader, "a@b.co", 10)).rejects.toBeInstanceOf(TimeoutError);
    });
  });
});
