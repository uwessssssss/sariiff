import * as Crypto from "expo-crypto";

/**
 * Secure random hex for secrets kept on the phone (trusted-device id, phone-sign-in secret).
 *
 * React Native's Hermes engine has no crypto.getRandomValues unless a polyfill is loaded, so
 * the trusted-device id (AU4) could come out empty (every office sign-in asked for an SMS
 * code) and the phone-sign-in secret fell back to Math.random. expo-crypto reads the
 * system's secure random source. Returns undefined when no secure source works: never Math.random.
 */
export function secureRandomHex(byteCount = 24): string | undefined {
  let bytes: Uint8Array | undefined;
  try {
    bytes = Crypto.getRandomBytes(byteCount);
  } catch {
    const g: any = globalThis as any;
    if (g.crypto?.getRandomValues) {
      bytes = new Uint8Array(byteCount);
      g.crypto.getRandomValues(bytes);
    }
  }
  return bytes && bytes.length === byteCount ? Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") : undefined;
}
