/**
 * Caminho interno seguro para redirecionar após o login (?next=).
 * Compartilhado: o servidor usa no 303 do formulário nativo, o cliente na navegação após login.
 *
 * Aceita só strings que começam por "/", não começam por "//" nem "/\", não contêm
 * "\", CR ou LF, nem esquema (":" antes da primeira "/" adicional). Tudo o resto vira "/".
 */
export function toSafeInternalPath(value: string | null | undefined): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (/[\\\r\n]/.test(value)) return "/";
  // Um ":" antes de qualquer "/" (além do inicial), "?" ou "#" indicaria um esquema.
  const firstSegment = value.slice(1).split(/[/?#]/, 1)[0] ?? "";
  if (firstSegment.includes(":")) return "/";
  return value;
}
