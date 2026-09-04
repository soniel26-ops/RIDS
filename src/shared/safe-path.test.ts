import { describe, expect, it } from "vitest";
import { toSafeInternalPath } from "./safe-path";

describe("toSafeInternalPath", () => {
  it("aceita caminhos internos", () => {
    expect(toSafeInternalPath("/")).toBe("/");
    expect(toSafeInternalPath("/conta/senha")).toBe("/conta/senha");
    expect(toSafeInternalPath("/lojas?pagina=2&ordem=nome#topo")).toBe(
      "/lojas?pagina=2&ordem=nome#topo",
    );
  });

  it("devolve / para ausente, vazio ou não-string", () => {
    expect(toSafeInternalPath(undefined)).toBe("/");
    expect(toSafeInternalPath(null)).toBe("/");
    expect(toSafeInternalPath("")).toBe("/");
  });

  it("rejeita URLs absolutas e com esquema", () => {
    expect(toSafeInternalPath("https://evil.example")).toBe("/");
    expect(toSafeInternalPath("javascript:alert(1)")).toBe("/");
    expect(toSafeInternalPath("/javascript:alert(1)")).toBe("/");
    expect(toSafeInternalPath("evil.example/x")).toBe("/");
  });

  it("rejeita caminhos relativos a protocolo", () => {
    expect(toSafeInternalPath("//evil.example")).toBe("/");
    expect(toSafeInternalPath("/\\evil.example")).toBe("/");
  });

  it("rejeita barras invertidas e quebras de linha", () => {
    expect(toSafeInternalPath("/a\\b")).toBe("/");
    expect(toSafeInternalPath("/a\r\nSet-Cookie: x")).toBe("/");
    expect(toSafeInternalPath("/a\nb")).toBe("/");
  });

  it("aceita dois-pontos depois do primeiro segmento", () => {
    expect(toSafeInternalPath("/busca?q=a:b")).toBe("/busca?q=a:b");
    expect(toSafeInternalPath("/lojas/a:b")).toBe("/lojas/a:b");
  });

  it("rejeita caminhos demasiado longos", () => {
    expect(toSafeInternalPath("/" + "a".repeat(2048))).toBe("/");
  });
});
