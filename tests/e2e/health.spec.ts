import { expect, test } from "@playwright/test";

test("CA-0: o serviço responde em /api/health", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: "ok" });
});
