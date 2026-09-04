import { defineConfig } from "@playwright/test";

/**
 * Testes de aceitação: exercitam o RIDS de fora, como um usuário ou cliente HTTP.
 * Rodar com `npm run test:e2e`. Sobe o servidor de desenvolvimento automaticamente.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
    env: { MAIL_TRANSPORT: "captured" },
    url: "http://127.0.0.1:3000/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
