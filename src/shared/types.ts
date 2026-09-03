/**
 * Contratos compartilhados entre backend e frontend.
 * Alterar este arquivo exige aviso no resumo do engenheiro (ver CLAUDE.md).
 */

/** Loja como exposta pela API. Nunca inclui tokens ou segredos. */
export interface StoreSummary {
  id: string;
  domain: string;
  name: string;
  shopifyDomain: string | null;
  timezone: string;
  currency: string;
  isActive: boolean;
  /** true quando a loja tem token de acesso salvo. */
  isConnected: boolean;
}

export interface ApiError {
  error: { code: string; message: string };
}
