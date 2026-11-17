import assert from "node:assert/strict";
import { test } from "node:test";
import { isUniqueViolation } from "./db-errors";

test("recognizes PostgreSQL unique violations wrapped by Drizzle", () => {
  const postgresError = Object.assign(new Error("duplicate key"), {
    code: "23505",
  });
  const drizzleError = new Error("Failed query", { cause: postgresError });

  assert.equal(isUniqueViolation(drizzleError), true);
});

test("ignores other database errors and handles cyclic causes", () => {
  const otherError = new Error("Failed query", {
    cause: Object.assign(new Error("invalid input"), { code: "22P02" }),
  });
  const cyclicError: { cause?: unknown } = {};
  cyclicError.cause = cyclicError;

  assert.equal(isUniqueViolation(otherError), false);
  assert.equal(isUniqueViolation(cyclicError), false);
});
