import { describe, expect, it } from "vitest";
import { hashPin, isValidPin, newSalt, verifyPin } from "./pin";

describe("PIN", () => {
  it("hashPin 是「salt:pin」的 SHA-256", async () => {
    expect(await hashPin("1234", "abc")).toBe("1755a2d5b309d75bede226f2b6cf858bb14287b917e76ad3b943de0dda4683fb");
  });
  it("verifyPin 比對正確與錯誤的 PIN；沒設定時一律失敗", async () => {
    const salt = newSalt();
    const hash = await hashPin("0420", salt);
    expect(await verifyPin("0420", salt, hash)).toBe(true);
    expect(await verifyPin("0421", salt, hash)).toBe(false);
    expect(await verifyPin("0420", null, null)).toBe(false);
  });
  it("newSalt 每次不同", () => expect(newSalt()).not.toBe(newSalt()));
  it("isValidPin 只接受 4 位數字", () => {
    expect(isValidPin("0420")).toBe(true);
    expect(isValidPin("042")).toBe(false);
    expect(isValidPin("04a0")).toBe(false);
  });
});
