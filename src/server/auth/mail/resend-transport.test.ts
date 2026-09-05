import { describe, expect, it, vi } from "vitest";
import { createResendTransport } from "./resend-transport";

function fakeFetch(status: number, body: unknown = { id: "email_1" }) {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}

describe("resend-transport", () => {
  it("envia com POST /emails, Bearer e corpo { from, to, subject, text }", async () => {
    const fetchImpl = fakeFetch(200);
    const transport = createResendTransport({
      apiKey: "re_teste",
      from: "RIDS <rids@exemplo.com>",
      fetchImpl,
    });
    await transport.send({ to: "a@b.co", subject: "S", text: "T" });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_teste");
    expect(JSON.parse(init.body as string)).toEqual({
      from: "RIDS <rids@exemplo.com>",
      to: "a@b.co",
      subject: "S",
      text: "T",
    });
  });

  it("lança quando o Resend responde erro ou corpo inesperado, sem expor o corpo", async () => {
    const failing = createResendTransport({
      apiKey: "k",
      from: "f",
      fetchImpl: fakeFetch(500, { message: "segredo" }),
    });
    await expect(failing.send({ to: "a@b.co", subject: "S", text: "T" })).rejects.toThrow(/500/);
    await expect(failing.send({ to: "a@b.co", subject: "S", text: "T" })).rejects.not.toThrow(
      /segredo/,
    );
    const odd = createResendTransport({
      apiKey: "k",
      from: "f",
      fetchImpl: fakeFetch(200, { nope: 1 }),
    });
    await expect(odd.send({ to: "a@b.co", subject: "S", text: "T" })).rejects.toThrow(/inesperada/);
  });

  it("ping faz GET /domains e lança em erro", async () => {
    const ok = fakeFetch(200, { data: [] });
    await createResendTransport({ apiKey: "k", from: "f", fetchImpl: ok }).ping();
    const [url, init] = (ok as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.resend.com/domains");
    expect(init.method).toBe("GET");
    await expect(
      createResendTransport({ apiKey: "k", from: "f", fetchImpl: fakeFetch(401, {}) }).ping(),
    ).rejects.toThrow(/401/);
  });
});
