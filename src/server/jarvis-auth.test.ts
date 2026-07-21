import { describe, expect, it } from "vitest";
import { getJarvisRequestToken, validateJarvisRequest } from "./jarvis-auth";

describe("jarvis auth", () => {
  it("returns 503 when the server token is not configured", () => {
    const result = validateJarvisRequest(new Headers({ authorization: "Bearer secret" }), "");

    expect(result).toEqual({ ok: false, status: 503, message: "Jarvis API no configurada" });
  });

  it("extracts bearer and x-jarvis-token credentials", () => {
    expect(getJarvisRequestToken(new Headers({ authorization: "Bearer secret" }))).toBe("secret");
    expect(getJarvisRequestToken(new Headers({ "x-jarvis-token": "fallback" }))).toBe("fallback");
  });

  it("rejects missing or invalid tokens", () => {
    expect(validateJarvisRequest(new Headers(), "secret")).toMatchObject({ ok: false, status: 401 });
    expect(validateJarvisRequest(new Headers({ authorization: "Bearer wrong" }), "secret")).toMatchObject({ ok: false, status: 401 });
  });

  it("accepts a valid token from either supported header", () => {
    expect(validateJarvisRequest(new Headers({ authorization: "Bearer secret" }), "secret")).toEqual({ ok: true });
    expect(validateJarvisRequest(new Headers({ "x-jarvis-token": "secret" }), "secret")).toEqual({ ok: true });
  });
});
