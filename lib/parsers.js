import {
  buildBinaryTag,
  buildBindingTag,
  buildCloseNodeTag,
  buildDoctypeTag,
  buildEscapeTag,
  buildGapTag,
  buildHashTag,
  buildLiteralTag,
  buildMuxerTag,
  buildNullTag,
  buildShiftTag,
  buildSumsTag,
  buildTag,
  symbolName,
} from './builders.js';
import { hasOwn, isObject, isArray, isString, isFrozen, freezeRecord } from './object.js';
import { buildParser, inRange, match } from './parse.js';
import { printTag } from './print.js';

import {
  DoctypeTag,
  OpenNodeTag,
  CloseNodeTag,
  ReferenceTag,
  ShiftTag,
  GapTag,
  NullTag,
  LiteralTag,
  AttributeDefinition,
  BindingTag,
  Document,
  Property,
  NullNode,
  GapNode,
  TreeNode,
  MuxerTag,
  HashTag,
  BinaryTag,
  EscapeTag,
  SumsTag,
} from './symbols.js';

let porcelain = { porcelain: true };

export const canStartIdentifier = (chr) => {
  let code = chr.charCodeAt(0);
  return (
    (code >= 97 && code <= 122) ||
    (code >= 65 && code <= 90) ||
    code === 96 ||
    (code >= 0x80 && code <= 0x10ffff)
  );
};

export const canContinueIdentifier = (chr) => {
  if (canStartIdentifier(chr)) return true;
  let code = chr.charCodeAt(0);

  return code === 45 || code === 95 || (code >= 48 && code <= 57);
};

export const parseTagType = (input) => {
  if (input == null || isArray(input)) return null;
  if (isObject(input) && input.type) return input.type;
  let p = buildTagParser(input);
  let { str, idx } = p;
  if (!isString(str)) throw new Error();
  if (!str.length) throw new Error();

  if (str[idx] >= 'a' && str[idx] <= 'z' && `"'`.includes(str[idx + 1])) {
    let tag = str[idx];
    if (tag !== 'b') throw new Error();
    return BinaryTag;
  }

  switch (str[idx]) {
    case 'n':
      return str[idx + 1] === 'u' &&
        str[idx + 2] === 'l' &&
        str[idx + 3] === 'l' &&
        !inRange(str[idx + 4], 'a', 'z')
        ? NullTag
        : ReferenceTag;
    case '<':
      if (str[idx + 1] === '-' && str[idx + 2] === '-' && str[idx + 3] === '-') {
        throw new Error('reserved syntax');
      }
      return str[idx + 1] === '!'
        ? DoctypeTag
        : str[idx + 1] === '/'
        ? str[idx + 2] === '/'
          ? GapTag
          : CloseNodeTag
        : str[idx + 1] === '-'
        ? MuxerTag
        : OpenNodeTag;
    case '^':
      if (str[idx + 1] === '^' && str[idx + 2] === '^') {
        return ShiftTag;
      } else {
        throw new Error();
      }
    case ':':
      return BindingTag;
    case '#':
      return str[idx + 1] === '#' ? HashTag : str[idx + 1] === '[' ? SumsTag : ReferenceTag;
    case '@':
      return EscapeTag;
    case '.':
    case '_':
      return ReferenceTag;
    case '"':
    case "'":
      return LiteralTag;
    case '{':
      return AttributeDefinition;
    default:
      if (canStartIdentifier(str[idx])) {
        return ReferenceTag;
      } else {
        throw new Error();
      }
  }
};

export const parseStreamTagType = (input) => {
  if (isObject(input) && input.type) return input.type;
  let p = buildTagParser(input);
  let { str, idx } = p;
  if (str == null) return null;
  if (!isString(str)) throw new Error();
  if (!str.length) throw new Error();

  if (str[idx] === '<') {
    if (str[idx + 1] === '-') {
      if (str[idx + 2] === '-') {
        return parseTagType(input);
      } else {
        return MuxerTag;
      }
      throw new Error('reserved syntax');
    } else {
      return parseTagType(input);
    }
  } else {
    return parseTagType(input);
  }
};

export const parseObject = (input) => {
  let p = buildParser(input);
  let { str } = p;
  if (!str.length) throw new Error();
  let obj = {};
  let chr = str[p.idx];

  if (chr !== '{') throw new Error();
  chr = str[++p.idx];

  while (chr === ' ') {
    chr = str[++p.idx];
  }

  let sep = true;
  let lastKey = null;
  while (sep && chr !== '}') {
    let key = `'"`.includes(chr) ? parseString(p) : parseIdentifier(p);
    chr = str[p.idx];

    if (chr !== ':') throw new Error();
    chr = str[++p.idx];

    while (chr === ' ') chr = str[++p.idx];

    let value = parseExpression(p);
    chr = str[p.idx];

    if (lastKey !== null && !(key >= lastKey)) throw new Error('object keys not alphabetized');

    obj[key] = value;

    while (chr === ' ') chr = str[++p.idx];

    sep = chr === ',' ? chr : null;
    if (sep) {
      chr = str[++p.idx];
    }

    while (chr === ' ') chr = str[++p.idx];

    lastKey = key;
  }

  if (chr !== '}') throw new Error();
  chr = str[++p.idx];

  return freezeRecord(obj);
};

export const parseArray = (input) => {
  let p = buildParser(input);
  let { str } = p;
  let arr = [];
  let chr = str[p.idx];

  if (chr !== '[') throw new Error();
  chr = str[++p.idx];

  while (chr === ' ') {
    chr = str[++p.idx];
  }

  let first = true;
  while (first || chr === ',') {
    if (!first && chr === ',') {
      chr = str[++p.idx];
      while (chr === ' ') {
        chr = str[++p.idx];
      }
    }
    let value = parseExpression(p);
    chr = str[p.idx];

    arr.push(value);

    while (chr === ' ') {
      chr = str[++p.idx];
    }
    first = false;
  }

  if (chr !== ']') throw new Error();
  chr = str[++p.idx];

  return freezeRecord(arr);
};

export const parseString = (input) => {
  let p = buildParser(input);
  let { str } = p;
  let chr = str[p.idx];
  let q = chr;
  let result = [];

  if (!`'"`.includes(q)) throw new Error();
  chr = str[++p.idx];

  while (chr && chr !== q) {
    if (chr === '\\') {
      result.push(parseEscape(p));
      chr = str[p.idx];
    } else if (chr === '\r' || chr === '\n') {
      throw new Error();
    } else {
      result.push(chr);
      chr = str[++p.idx];
    }
  }

  if (chr === q) {
    chr = str[++p.idx];
  } else {
    throw new Error();
  }

  return result.join('');
};

export const parseDigits = (input) => {
  let p = buildParser(input);
  let { str } = p;
  let chr = str[p.idx];
  let digits = [];

  while (chr >= '0' && chr <= '9') {
    digits.push(chr);
    chr = str[++p.idx];
  }

  return parseInt(digits.join(''), 10);
};

export const parseUnsignedInteger = (input) => {
  let p = buildParser(input);
  let { str } = p;
  let chr = str[p.idx];
  let digits = [];

  if (chr === '0') {
    chr = str[++p.idx];
    return 0;
  }

  while (chr >= '0' && chr <= '9') {
    digits.push(chr);
    chr = str[++p.idx];
  }

  return parseInt(digits.join(''), 10);
};

export const parseInteger = (input) => {
  let p = buildParser(input);
  let { str } = p;
  let chr = str[p.idx];
  let negative = false;

  if (chr === '-') {
    negative = true;
    chr = str[++p.idx];
  }

  return parseUnsignedInteger(p) * (negative ? -1 : 1);
};

export const parseNumber = (input) => {
  let p = buildParser(input);
  let { str } = p;
  let chr = str[p.idx];
  let startIdx = p.idx;

  if (chr === '-') {
    chr = str[++p.idx];
  }

  if (chr == '0') {
    chr = str[++p.idx];
  } else {
    parseDigits(p);
    chr = str[p.idx];
  }

  if (chr === '.') {
    chr = str[++p.idx];
    parseDigits(p);
    chr = str[p.idx];
  }

  if (chr === 'e' || chr === 'E') {
    chr = str[++p.idx];

    if (chr === '+' || chr === '-') {
      chr = str[++p.idx];
    }

    parseDigits(p);
  }

  let endIdx = p.idx;

  return parseFloat([...str.slice(startIdx, endIdx)].join(''));
};

export const parseEscape = (input) => {
  let p = buildParser(input);
  let { str } = p;
  let chr = str[p.idx];

  if (chr !== '\\') throw new Error();
  chr = str[++p.idx];

  switch (chr) {
    case 'u': {
      chr = str[++p.idx];

      let digits = [];
      let q = chr === '{' ? chr : null;
      if (q) {
        chr = str[++p.idx];
      }

      let i = 0;
      while (q ? chr !== '}' : i < 4) {
        if (
          !((chr >= '0' && chr <= '9') || (chr >= 'a' && chr <= 'z') || (chr >= 'A' && chr <= 'Z'))
        )
          throw new Error();

        digits.push(chr);
        chr = str[++p.idx];
        i++;
      }

      if (q) {
        if (chr !== '}') throw new Error();
        chr = str[++p.idx];
      }
      return String.fromCodePoint(parseInt(digits.join(''), 16));
    }
    case 'r':
      chr = str[++p.idx];
      return '\r';
    case 'n':
      chr = str[++p.idx];
      return '\n';
    case 't':
      chr = str[++p.idx];
      return '\t';
    case '\\':
    case '"':
    case "'":
    case '`':
      ++p.idx;
      return chr;
  }
};

export const parseExpression = (input) => {
  let p = buildParser(input);
  let { str } = p;
  let chr = str[p.idx];

  switch (chr) {
    case '{':
      return parseObject(p);
    case '[':
      return parseArray(p);
    case '"':
    case "'":
      return parseString(p);
    case 'n':
      if (match(p, 'null')) {
        p.idx += 4;
        return null;
      } else {
        throw new Error();
      }
    case 't':
      if (match(p, 'true')) {
        p.idx += 4;
        return true;
      } else {
        throw new Error();
      }
    case 'f':
      if (match(p, 'false')) {
        p.idx += 5;
        return false;
      } else {
        throw new Error();
      }
    case 'u':
      if (match(p, 'undefined')) {
        p.idx += 9;
        return undefined;
      } else {
        throw new Error();
      }
    case 'N':
      if (match(p, 'NaN')) {
        p.idx += 3;
        return NaN;
      } else {
        throw new Error();
      }
    case 'I':
      if (match(p, 'Infinity')) {
        p.idx += 8;
        return Infinity;
      } else {
        throw new Error();
      }
    case '-':
      if (str[p.idx + 1] === 'I' && match(p, '-Infinity')) {
        p.idx += 9;
        return -Infinity;
      } else {
        return parseNumber(p);
      }
    case '+':
      if (str[p.idx + 1] === 'I' && match(p, '+Infinity')) {
        p.idx += 9;
        return Infinity;
      } else {
        throw new Error();
      }
    default:
      if (chr >= '0' && chr <= '9') {
        return parseNumber(p);
      } else {
        throw new Error();
      }
  }
};

export const parseIdentifier = (input) => {
  let p = buildParser(input);
  let { str } = p;
  let chr = str[p.idx];
  let value = [];

  let q = chr === '`' ? chr : null;
  if (q) {
    chr = str[++p.idx];
  }

  let lit, esc;
  do {
    lit = null;
    esc = null;
    if (chr === '\\') {
      esc = parseEscape(p);
      chr = str[p.idx];
    } else {
      if (!q) {
        if (!value.length) {
          if (canStartIdentifier(chr)) {
            lit = chr;
            value.push(chr);
            chr = str[++p.idx];
          } else {
            throw new Error();
          }
        }

        while (chr && canContinueIdentifier(chr)) {
          lit = chr;
          value.push(chr);
          chr = str[++p.idx];
        }
      } else {
        while (!'`\\\r\n'.includes(chr)) {
          lit = chr;
          value.push(chr);
          chr = str[++p.idx];
        }
      }
    }
  } while (lit || esc);

  if (q) {
    if (chr !== '`') throw new Error();
    chr = str[++p.idx];
  }
  return value.join('');
};

let buildTagParser = (tag) => {
  switch (typeof tag) {
    case 'string':
      return { idx: 0, str: tag };
    case 'object':
      if (tag.type) {
        throw new Error();
      } else {
        return tag;
      }
  }
};

let flagsCache = new Map();

export const parseNodeFlags = (input) => {
  let p = buildParser(input);
  let { str } = p;
  let chr = str[p.idx];
  let token = false;
  let hasGap = false;

  let flagsStr = '';

  if (chr === '*') {
    flagsStr += chr;
    chr = str[++p.idx];
    token = true;
  }
  if (chr === '$') {
    flagsStr += chr;
    chr = str[++p.idx];
    hasGap = true;
  }

  let cached = flagsCache.get(flagsStr);
  let flags = cached || freezeRecord({ token, hasGap });
  if (!cached) flagsCache.set(flagsStr, flags);
  return flags;
};

export const parseOpenNodeTag = (tag) => {
  let p = buildTagParser(tag);
  let { str } = p;
  let chr = str[p.idx];

  if (chr !== '<') throw new Error();
  chr = str[++p.idx];

  let flagsStart = p.idx;
  let flags = parseNodeFlags(p);
  let flagsEnd = p.idx;
  chr = str[p.idx];

  let type = null;
  let name = null;

  if (chr === '_') {
    chr = str[++p.idx];
    type = Symbol.for('_');

    if (chr === '_') {
      chr = str[++p.idx];
      type = Symbol.for('__');
    }
  }

  if (type === Symbol.for('__') && flagsStart !== flagsEnd) {
    throw new Error();
  }

  if (!` \t{'"/>`.includes(chr)) {
    name = parseIdentifier(p);
    chr = str[p.idx];
  }

  while (chr === ' ') {
    chr = str[++p.idx];
  }

  let literalValue = null;

  if (`'"@b`.includes(chr)) {
    literalValue = parseTag(p);
    chr = str[p.idx];

    while (chr === ' ') chr = str[++p.idx];
  }

  let attributes = freezeRecord({});

  if (chr === '{') {
    attributes = parseObject(p);
    chr = str[p.idx];

    while (chr === ' ') chr = str[++p.idx];
  }

  let selfClosing = false;

  if (chr === '/') {
    chr = str[++p.idx];
    selfClosing = true;
  }

  if (chr === '>') {
    chr = str[++p.idx];
  }

  if (isString(tag) && p.idx !== str.length) throw new Error();

  return buildTag(
    OpenNodeTag,
    freezeRecord({
      flags,
      name: symbolName(name),
      type: symbolName(type),
      literalValue,
      attributes,
      selfClosing,
    }),
  );
};

export const parseReferenceFlags = (input) => {
  let p = buildTagParser(input);
  let { str } = p;
  let chr = str[p.idx];
  let array = false;
  let expression = false;
  let intrinsic = false;
  let hasGap = false;

  if (chr === '[') {
    chr = str[++p.idx];
    array = true;
    if (chr !== ']') throw new Error();
    chr = str[++p.idx];
  }

  if (chr === '+') {
    chr = str[++p.idx];
    expression = true;
  }

  if (chr === '*') {
    chr = str[++p.idx];
    intrinsic = true;
  }

  if (chr === '$') {
    chr = str[++p.idx];
    hasGap = true;
  }

  return freezeRecord({ array, expression, intrinsic, hasGap });
};

export const parseReferenceTag = (tag) => {
  let p = buildTagParser(tag);
  let { str } = p;
  let chr = str[p.idx];
  let type = null;
  let name = null;

  if ('.#_'.includes(chr)) {
    type = chr;
    chr = str[++p.idx];
  }

  if (type === '.' && chr === '.') {
    type = '..';
    chr = str[++p.idx];
  } else if (type === '_' && chr === '_') {
    type = '__';
    chr = str[++p.idx];
  }

  let quotedIdent = chr === '`';
  if (!type || (type === '#' && canStartIdentifier(chr))) {
    name = parseIdentifier(p);
    chr = str[p.idx];
    if (name.length === 1 && name >= 'a' && name <= 'z' && !quotedIdent) throw new Error();
  }
  if (!type && !quotedIdent && name === 'null') throw new Error();

  let flags = parseReferenceFlags(p);
  chr = str[p.idx];

  if (chr !== ':') throw new Error();
  chr = str[++p.idx];

  if (isString(tag) && p.idx !== p.str.length) throw new Error();

  return buildTag(ReferenceTag, freezeRecord({ type, name, flags }));
};

export const parseLiteralTag = (tag) => {
  let p = buildTagParser(tag);

  let str = parseString(p);

  if (isString(tag) && p.idx !== p.str.length) throw new Error();

  return buildLiteralTag(str);
};

export const parseCloseNodeTag = (tag) => {
  let p = buildTagParser(tag);
  if (!match(p, '</>')) throw new Error();
  p.idx += 3;

  if (isString(tag) && p.idx !== p.str.length) throw new Error();

  return buildCloseNodeTag();
};

export const parseGapTag = (tag) => {
  let p = buildTagParser(tag);
  if (!match(p, '<//>')) throw new Error();
  p.idx += 4;

  if (isString(tag) && p.idx !== p.str.length) throw new Error();
  return buildGapTag();
};

export const parseNullTag = (tag) => {
  let p = buildTagParser(tag);
  if (!match(p, 'null ')) throw new Error();
  p.idx += 5;

  if (isString(tag) && p.idx !== p.str.length) throw new Error();

  return buildNullTag();
};

export const parseShiftTag = (tag) => {
  let p = buildTagParser(tag);
  if (!match(p, '^^^')) throw new Error();
  p.idx += 3;
  if (isString(tag) && p.idx !== p.str.length) throw new Error();

  return buildShiftTag();
};

export const parseBinaryTag = (tag) => {
  let p = buildTagParser(tag);
  let { str } = p;
  let chr = str[p.idx];

  if (chr !== 'b') throw new Error();
  chr = str[++p.idx];

  let value = parseString(p);
  chr = str[p.idx];

  if (isString(tag) && p.idx !== p.str.length) throw new Error();

  return buildBinaryTag(value);
};

export const parseEscapeTag = (tag) => {
  let p = buildTagParser(tag);
  let { str } = p;
  let chr = str[p.idx];

  if (chr !== '@') throw new Error();
  chr = str[++p.idx];

  let hasCooked = true;
  if (chr === '@') {
    chr = str[++p.idx];
    hasCooked = false;
  }

  let cookedValue = null;
  let value = null;

  if (hasCooked) {
    cookedValue = parseString(p);
    chr = str[p.idx];
  } else {
    value = parseString(p);
    chr = str[p.idx];
  }

  if (hasCooked) {
    while (chr === ' ') {
      chr = str[++p.idx];
    }

    if (chr !== '@') throw new Error();
    chr = str[++p.idx];
    if (chr !== '@') throw new Error();
    chr = str[++p.idx];

    value = parseString(p);
    chr = str[p.idx];
  }

  if (isString(tag) && p.idx !== p.str.length) throw new Error();

  return buildEscapeTag(value, cookedValue);
};

export const parseBase64 = (input) => {
  let p = buildParser(input);
  let { str } = p;
  let chr = str[p.idx];

  let content = '';

  while (
    inRange(chr, 'a', 'z') ||
    inRange(chr, 'A', 'Z') ||
    inRange(chr, '0', '9') ||
    '=+/'.includes(chr)
  ) {
    content += chr;
    chr = str[++p.idx];
  }

  return content;
};

export const parseHashTag = (tag) => {
  let p = buildTagParser(tag);

  if (!match(p, '##')) throw new Error();
  p.idx += 2;

  let hash = parseBase64(p);

  if (!match(p, '##')) throw new Error();
  p.idx += 2;

  return buildHashTag(hash);
};

export const parseRefSums = (p) => {
  let { str } = buildParser(p);
  let chr = str[p.idx];

  let ref = parseReferenceTag(p);
  chr = str[p.idx];

  while (chr === ' ') {
    chr = str[++p.idx];
  }
  let count = parseNumber(p);
  chr = str[p.idx];

  while (chr === ' ') {
    chr = str[++p.idx];
  }
  if (chr !== ',') throw new Error();
  chr = str[++p.idx];
  while (chr === ' ') {
    chr = str[++p.idx];
  }

  let isArray;
  if (chr === '0') {
    isArray = false;
  } else if (chr === '1') {
    isArray = true;
  } else {
    throw new Error();
  }
  return freezeRecord([printTag(ref), count, isArray]);
};

export const parseRefsSums = (p) => {
  let { str } = buildParser(p);
  let chr = str[p.idx];

  let refsSums = [];

  if (chr !== '{') throw new Error();
  chr = str[++p.idx];

  while (chr === ' ') {
    chr = str[++p.idx];
  }

  let sep = true;
  let lastRef = null;

  while (sep && chr !== '}') {
    let refSums = parseRefSums(p);
    chr = str[p.idx];

    let { 0: ref, 1: count, 2: isArray } = refSums;

    if (lastRef && printTag(lastRef, porcelain) > printTag(ref, porcelain)) throw new Error();

    refsSums.push(ref, count, isArray);

    chr = str[p.idx];
    while (chr === ' ') {
      chr = str[++p.idx];
    }
    sep = chr === ',';
    if (sep) {
      while (chr === ' ') {
        chr = str[++p.idx];
      }
    }
    lastRef = ref;
  }

  while (chr === ' ') {
    chr = str[++p.idx];
  }

  if (chr !== '}') throw new Error();
  chr = str[++p.idx];

  return freezeRecord(refsSums);
};

export const parseSumsTag = (tag) => {
  let p = buildTagParser(tag);
  let { str } = p;
  let chr = str[p.idx];

  if (!match(p, '#[')) throw new Error();
  p.idx += 2;
  chr = str[p.idx];

  while (chr === ' ') {
    chr = str[++p.idx];
  }

  let refsSums = parseRefsSums(p);
  chr = str[p.idx];

  while (chr === ' ') {
    chr = str[++p.idx];
  }
  if (chr !== ',') throw new Error();
  chr = str[++p.idx];
  while (chr === ' ') {
    chr = str[++p.idx];
  }

  let gearHash = parseString(p);
  chr = str[p.idx];

  while (chr === ' ') {
    chr = str[++p.idx];
  }
  if (chr !== ',') throw new Error();
  chr = str[++p.idx];
  while (chr === ' ') {
    chr = str[++p.idx];
  }

  let lineBreaks = parseNumber(p);
  chr = str[p.idx];

  while (chr === ' ') {
    chr = str[++p.idx];
  }
  if (chr !== ',') throw new Error();
  chr = str[++p.idx];
  while (chr === ' ') {
    chr = str[++p.idx];
  }

  let gaps = parseNumber(p);
  chr = str[p.idx];

  while (chr === ' ') {
    chr = str[++p.idx];
  }

  if (!match(p, ']#')) throw new Error();
  p.idx += 2;
  chr = str[p.idx];

  return buildSumsTag(refsSums, gearHash, lineBreaks, gaps);
};

export const parseIdentifierPath = (p) => {
  let { str } = buildParser(p);
  let chr = str[p.idx];
  let segments = [];

  let sep = true;
  while (sep) {
    segments.push(parseIdentifier(p));
    chr = str[p.idx];

    sep = chr === '.' ? chr : null;
  }

  return freezeRecord(segments);
};

export const parseAttributeDefinitionTag = (tag) => {
  let p = buildTagParser(tag);
  let { str } = p;
  let chr = str[p.idx];

  if (chr !== '{') throw new Error();
  chr = str[++p.idx];

  while (chr === ' ') {
    chr = str[++p.idx];
  }

  let key = parseIdentifierPath(p);
  chr = str[p.idx];

  if (chr !== ':') throw new Error();
  chr = str[++p.idx];

  while (chr === ' ') {
    chr = str[++p.idx];
  }

  let value = parseExpression(p);
  chr = str[p.idx];

  while (chr === ' ') {
    chr = str[++p.idx];
  }

  if (chr !== '}') throw new Error();
  chr = str[++p.idx];

  if (isString(tag) && p.idx !== p.str.length) throw new Error();

  return buildTag(AttributeDefinition, freezeRecord({ path: key, value }));
};

export const parseBindingTag = (tag) => {
  let p = buildTagParser(tag);
  let { str } = p;
  let chr = str[p.idx];
  let type = null;
  let name = null;

  if (chr !== ':') throw new Error();
  chr = str[++p.idx];

  if (chr === '.' && str[p.idx + 1] === '.') {
    p.idx += 2;
    type = Symbol.for('..');
  } else {
    name = Symbol.for(parseIdentifier(p));
    chr = str[p.idx];
  }

  if (chr !== ':') throw new Error();
  chr = str[++p.idx];

  if (isString(tag) && p.idx !== p.str.length) throw new Error();

  return buildBindingTag(type, name);
};

export const parseDoctypeTag = (tag) => {
  let p = buildTagParser(tag);
  let { str } = p;
  let chr = str[p.idx];

  if (chr !== '<' || str[p.idx + 1] !== '!') throw new Error();
  p.idx += 2;

  let version = parseUnsignedInteger(p);
  chr = str[p.idx];

  if (!match(p, ':cstml')) throw new Error();
  p.idx += 6;
  chr = str[p.idx];

  while (chr === ' ') {
    chr = str[++p.idx];
  }

  let attributes = freezeRecord({});

  if (chr === '{') {
    attributes = parseObject(p);
    chr = str[p.idx];

    while (chr === ' ') chr = str[++p.idx];
  }

  if (chr !== '>') throw new Error();
  chr = str[++p.idx];

  if (isString(tag) && p.idx !== p.str.length) throw new Error();

  return buildDoctypeTag(version, attributes);
};

export const parseMuxerTag = (tag) => {
  let p = buildTagParser(tag);
  let { str } = p;
  let chr = str[p.idx];

  if (chr !== '<') throw new Error();
  chr = str[++p.idx];

  let processPath = [];
  let stream = 1;

  if (chr >= '0' && chr <= '9') {
    do {
      let digits = [];
      while (chr >= '0' && chr <= '9') {
        digits.push(chr);
        chr = str[++p.idx];
      }
      processPath.push(parseInt(digits.join(''), 10));
    } while (chr === '.');
  }

  if (chr === '-') {
    chr = str[++p.idx];
    if ('1234'.includes(chr)) {
      stream = parseInt(chr, 10);
      chr = str[++p.idx];
    }
  }

  if (chr !== '>') throw new Error();
  chr = str[++p.idx];

  return buildMuxerTag(processPath, stream);
};

export const parseTag = (tag) => {
  if (isObject(tag) && tag.type === Property) return tag;

  let p = buildTagParser(tag);
  if (tag == null) return null;

  let tagType = parseTagType(p);

  switch (tagType) {
    case DoctypeTag:
      return parseDoctypeTag(tag);
    case AttributeDefinition:
      return parseAttributeDefinitionTag(tag);
    case OpenNodeTag:
      return parseOpenNodeTag(tag);
    case ReferenceTag:
      return parseReferenceTag(tag);
    case BindingTag:
      return parseBindingTag(tag);
    case LiteralTag:
      return parseLiteralTag(tag);
    case BinaryTag:
      return parseBinaryTag(tag);
    case EscapeTag:
      return parseEscapeTag(tag);
    case CloseNodeTag:
      return parseCloseNodeTag(tag);
    case GapTag:
      return parseGapTag(tag);
    case NullTag:
      return parseNullTag(tag);
    case ShiftTag:
      return parseShiftTag(tag);
    case HashTag:
      return parseHashTag(tag);
    case SumsTag:
      return parseSumsTag(tag);
    case Property:
      return tag;
    case TreeNode:
    case GapNode:
    case NullNode:
    default:
      throw new Error();
  }
};

export const parseStreamTag = (tag) => {
  if (isObject(tag) && tag.type === Property) return tag;
  let p = buildTagParser(tag);
  if (tag == null) return null;

  let tagType = parseStreamTagType(p);

  return tagType === MuxerTag ? parseMuxerTag(tag) : parseTag(tag);
};

export const isValidTag = (tag) => {
  if (isString(tag)) return !!parseTag(tag);
  if (!isFrozen(tag)) return false;
  if (!hasOwn(tag, 'type') || !hasOwn(tag, 'value')) return false;

  switch (tag.type) {
    case ReferenceTag:
    case OpenNodeTag:
    case AttributeDefinition:
    case CloseNodeTag:
    case ShiftTag:
    case NullTag:
    case HashTag:
    case GapTag:
    case LiteralTag:
    case BindingTag:
    case DoctypeTag:
      return parseTag(tag);
    case Property:
    case TreeNode:
    case GapNode:
    case NullNode:
      return false;

    default:
      throw new Error();
  }
};
