/**
 * Cria uma conta do painel a partir do terminal (CA-14, CA-31, CA-32):
 *   npm run auth:create-user -- --email <e-mail> --role OWNER|ADMIN|MARKETING
 * A senha é digitada duas vezes sem eco; nunca vem de argumento, variável ou seed,
 * e nunca é impressa. Saída 1 em qualquer erro (e-mail duplicado incluído).
 */
import "dotenv/config";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { parseArgs } from "node:util";
import { prisma } from "@/server/db";
import { getAuthService } from "../auth.deps";
import { EmailAlreadyInUseError, isAuthError } from "../auth.errors";
import { roleSchema } from "../schemas";

function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    let muted = false;
    const output = new Writable({
      write(chunk, _encoding, callback) {
        if (!muted) process.stdout.write(chunk);
        callback();
      },
    });
    const rl = createInterface({ input: process.stdin, output, terminal: true });
    rl.question(prompt, (answer) => {
      muted = false;
      process.stdout.write("\n");
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

function usage(): never {
  console.error("uso: npm run auth:create-user -- --email <e-mail> --role OWNER|ADMIN|MARKETING");
  process.exit(1);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { email: { type: "string" }, role: { type: "string" } },
    strict: true,
  });
  if (!values.email || !values.role) usage();
  const role = roleSchema.safeParse(values.role.toUpperCase());
  if (!role.success) {
    console.error("cargo inválido: use OWNER, ADMIN ou MARKETING");
    process.exit(1);
  }

  const password = await askHidden("Senha (mínimo 10 caracteres): ");
  if (password.length < 10) {
    console.error("a senha deve ter pelo menos 10 caracteres");
    process.exit(1);
  }
  const confirmation = await askHidden("Repita a senha: ");
  if (confirmation !== password) {
    console.error("as senhas não coincidem");
    process.exit(1);
  }

  try {
    const user = await getAuthService().createUser({
      email: values.email,
      role: role.data,
      password,
    });
    console.log(`conta criada: ${user.email} (${user.role})`);
  } catch (error) {
    if (error instanceof EmailAlreadyInUseError) {
      console.error("já existe uma conta com este e-mail");
    } else if (isAuthError(error)) {
      console.error(error.message);
    } else {
      console.error(
        "não foi possível criar a conta",
        error instanceof Error ? error.message : error,
      );
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("falhou:", error instanceof Error ? error.message : error);
  process.exit(1);
});
