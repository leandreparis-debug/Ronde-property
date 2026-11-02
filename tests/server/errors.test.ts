import { describe, expect, it } from "vitest";

import {
  ConflictError,
  ForbiddenError,
  translateError,
  UnexpectedError,
  userMessage,
  ValidationError,
} from "@/server/errors";

describe("translateError", () => {
  it.each([
    ["42501", ForbiddenError],
    ["23505", ConflictError],
    ["23514", ValidationError],
    ["22P02", ValidationError],
    ["23502", ValidationError],
    ["23503", ValidationError],
  ])("maps SQLSTATE %s", (code, expected) => {
    expect(translateError({ code, message: "x" })).toBeInstanceOf(expected);
  });

  it("maps unknown errors to UnexpectedError with a generic message", () => {
    const error = translateError(new Error("connection refused"));
    expect(error).toBeInstanceOf(UnexpectedError);
    expect(error.message).not.toMatch(/connection refused/);
    expect(userMessage("anything")).toMatch(/inattendue/);
  });

  it("passes business errors through", () => {
    const original = new ForbiddenError("Non.");
    expect(translateError(original)).toBe(original);
  });
});
