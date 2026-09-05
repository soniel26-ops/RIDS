/** Validação local da nova senha (CA-20, CA-27): limite e texto vêm de `src/shared/auth-rules.ts`. */
import { PASSWORD_MIN_LENGTH, PASSWORD_TOO_SHORT_MESSAGE } from "@/shared/auth-rules";

export { PASSWORD_MIN_LENGTH };
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
