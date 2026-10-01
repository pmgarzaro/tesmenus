import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the right password only", async () => {
    const hash = await hashPassword("poireau-curry");
    expect(hash).not.toContain("poireau");
    expect(await verifyPassword("poireau-curry", hash)).toBe(true);
    expect(await verifyPassword("autre", hash)).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });

  it("salts each hash", async () => {
    expect(await hashPassword("abc")).not.toBe(await hashPassword("abc"));
  });
});
