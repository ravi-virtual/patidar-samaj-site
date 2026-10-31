const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '@#$%&*!';

const pick = (chars: string): string => chars[crypto.getRandomValues(new Uint32Array(1))[0]! % chars.length]!;

/** A random 14-character password with letters, digits and a symbol. Uses the browser's secure RNG. */
export function generatePassword(length = 14): string {
  const all = LETTERS + DIGITS + SYMBOLS;
  const chars = [pick(LETTERS), pick(LETTERS.toLowerCase()), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(all));
  // Fisher-Yates shuffle so the guaranteed characters are not always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0]! % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}
