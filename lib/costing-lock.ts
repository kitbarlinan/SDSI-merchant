/**
 * Password lock for the Costing screen.
 *
 * IMPORTANT: this only protects the screen in the browser (demo). The password hash lives in this
 * browser's storage, so anyone with access to the browser's developer tools could get around it.
 * Real protection must be done on the server: costing tables readable only by the admin through
 * Supabase row-level security, and the password (or a fresh admin sign-in) checked server-side
 * before any save.
 */
const KEY = 'sdsi-wellness:costing-lock';
const ITERATIONS = 150_000;
const MIN_LENGTH = 8;

interface Stored {
  salt: string;
  hash: string;
  iterations: number;
}

const toHex = (bytes: ArrayBuffer | Uint8Array): string =>
  [...new Uint8Array(bytes instanceof Uint8Array ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const fromHex = (hex: string): Uint8Array =>
  new Uint8Array((hex.match(/.{2}/g) ?? []).map((pair) => parseInt(pair, 16)));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('This browser cannot protect the password (a secure https page is needed).');
  const material = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    256,
  );
  return toHex(bits);
}

function read(): Stored | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return parsed.salt && parsed.hash && parsed.iterations ? (parsed as Stored) : null;
  } catch {
    return null;
  }
}

export const hasCostingPassword = (): boolean => read() !== null;

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_LENGTH) return `Use at least ${MIN_LENGTH} characters.`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use both letters and numbers.';
  return null;
}

export async function setCostingPassword(password: string): Promise<void> {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  window.localStorage.setItem(
    KEY,
    JSON.stringify({ salt: toHex(salt), hash, iterations: ITERATIONS } satisfies Stored),
  );
}

export async function verifyCostingPassword(password: string): Promise<boolean> {
  const stored = read();
  if (!stored) return false;
  const hash = await derive(password, fromHex(stored.salt), stored.iterations);
  // Compare every character so the check does not stop at the first difference.
  let diff = hash.length ^ stored.hash.length;
  for (let i = 0; i < Math.max(hash.length, stored.hash.length); i += 1) {
    diff |= (hash.charCodeAt(i) || 0) ^ (stored.hash.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export async function changeCostingPassword(current: string, next: string): Promise<void> {
  if (!(await verifyCostingPassword(current))) throw new Error('The current password is not correct.');
  await setCostingPassword(next);
}
