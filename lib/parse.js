import { isObject } from './object.js';

export const buildParser = (str) => {
  return isObject(str) ? str : { idx: 0, str };
};

export const inRange = (value, lower, upper) => value >= lower && value <= upper;

let refChrs = ['.', '#', '@', '_', '`'];

export const canStartIdentifier = (chr) => {
  return (
    inRange(chr, 'a', 'z') ||
    inRange(chr, 'A', 'Z') ||
    refChrs.includes(chr) ||
    inRange(chr, '\u0080', '\u{10ffff}')
  );
};

export const match = (p, literal) => {
  let idx = 0;
  let endIdx = literal.length;
  let { idx: pIdx, str } = p;

  while (idx < endIdx) {
    if (str[pIdx + idx] !== literal[idx]) return null;
    idx++;
  }
  return literal;
};
