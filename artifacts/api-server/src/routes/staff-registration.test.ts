import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";

process.env.DATABASE_URL = "mysql://localhost/nss_connect_test";

const { default: staffRegistrationRouter } = await import("./staff-registration");

test("public staff registration cannot create an account", async () => {
  const app = express();
  app.use(express.json(), staffRegistrationRouter);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/auth/staff`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Unapproved User",
        email: "unapproved@example.test",
        password: "A-long-test-password-123",
        confirmPassword: "A-long-test-password-123",
      }),
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: "Staff accounts must be created by an authorized staff member.",
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
