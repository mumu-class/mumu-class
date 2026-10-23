// PIN 只是防止學生在白板上誤按老師的功能，不是資安措施，所以在前端比對（設計 §3.2）
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export const isValidPin = (pin: string) => /^\d{4}$/.test(pin);

export function newSalt(): string {
  return hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${pin}`)));
}

export async function verifyPin(pin: string, salt: string | null, hash: string | null): Promise<boolean> {
  return !!salt && !!hash && (await hashPin(pin, salt)) === hash;
}
