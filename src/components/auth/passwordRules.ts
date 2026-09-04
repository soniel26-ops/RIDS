/** Regras locais da nova senha (CA-20, CA-27): mesmas mensagens do servidor. */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_TOO_SHORT_MESSAGE = "A senha deve ter pelo menos 10 caracteres.";
export const PASSWORDS_MISMATCH_MESSAGE = "As senhas não coincidem.";

export interface NewPasswordErrors {
  newPassword?: string;
  confirmPassword?: string;
}

export function validateNewPassword(
  newPassword: string,
  confirmPassword: string,
): NewPasswordErrors {
  const errors: NewPasswordErrors = {};
  if (newPassword.length < PASSWORD_MIN_LENGTH) errors.newPassword = PASSWORD_TOO_SHORT_MESSAGE;
  else if (newPassword !== confirmPassword) errors.confirmPassword = PASSWORDS_MISMATCH_MESSAGE;
  return errors;
}
