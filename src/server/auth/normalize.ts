/** E-mail comparado ignorando maiúsculas e espaços nas pontas, em todo o domínio de auth. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
