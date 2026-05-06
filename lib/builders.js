import * as BList from './b-list.js';
import { arrayValues } from './iterable.js';
import { hasOwn, isObject, isArray, isSymbol, isString, isFrozen, freezeRecord } from './object.js';
import { buildParser, match } from './parse.js';
import { printTag } from './print.js';

import {
  DoctypeTag,
  OpenNodeTag,
  CloseTag,
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
  IOStreamOpenTag,
} from './symbols.js';

export const symbolName = (name) => {
  return isString(name) ? Symbol.for(name) : name;
};

export const buildSpan = (name, guard = null, props = '{}') => {
  if (!name) throw new Error();
  if (!isString(props)) throw new Error();

  return freezeRecord({ name, guard, props });
};

export const buildSpanEntry = (name, guard = null, props = '{}') => {
  return freezeRecord([name, buildSpan(name, guard, props)]);
};

export const buildProperty = (tags, shift) => {
  if (shift && !shift.index) throw new Error();
  let { 0: open, 1: bindings, 2: node } = tags[1];

  if (
    !(
      (isArray(open) && open[0] === 0) ||
      (isString(open) && [ReferenceTag, ShiftTag].includes(parseTagType(open)))
    )
  )
    throw new Error();
  if (tags[1].length > 1 && !isArray(bindings)) throw new Error();

  // if (property.node && !(tags.length === 3)) throw new Error();
  // if (tags[0].type === ShiftTag && !property.shift) throw new Error();

  if (!isArray(open) && (parseTagType(open) === ShiftTag) !== !!shift) throw new Error();
  if (node && ![NullNode, GapNode, TreeNode].includes(node.type)) throw new Error();

  return freezeRecord({
    tags,
    reference: shift ? null : (!isArray(open) && parseTag(open).value) || buildReference(),
    bindings: freezeRecord(
      bindings ? [...BList.traverse(bindings)].map((tag) => parseTag(tag).value) : [],
    ),
    node: node || null,
    shift: shift ? shift : null,
  });
};

export const buildPathFrame = (property, parentIndex = null, isGap = false) => {
  return freezeRecord({ property, parentIndex, isGap });
};

export const buildPropertyTag = (tags, shift) => {
  return buildTag(Property, buildProperty(tags, shift));
};

export const buildDocument = (doctypeTag, tree) => {
  return buildTag(Document, { doctypeTag, tree });
};

export const buildBeginningOfStreamToken = () => {
  return buildTag(Symbol.for('@bablr/beginning-of-stream'));
};

export const buildReferenceTag = (type = null, name = null, flags = referenceFlags) => {
  return buildTag(ReferenceTag, buildReference(type, name, flags));
};

export const buildReference = (type = null, name = null, flags = referenceFlags) => {
  if (!Object.isFrozen(flags)) throw new Error();
  if (type != null && !['_', '.', '#', '@'].includes(type)) throw new Error();
  if (type && ['_', '#', '@'].includes(type) && (flags.intrinsic || flags.hasGap))
    throw new Error();
  if (name != null && (!isString(name) || !name)) throw new Error();
  let { array, expression, intrinsic, hasGap } = flags;

  array = !!array;
  expression = !!expression;
  intrinsic = !!intrinsic;
  hasGap = !!hasGap;

  let type_ = type == null && name == null ? '.' : type;

  return freezeRecord({
    type: type_,
    name,
    flags: freezeRecord({ array, expression, intrinsic, hasGap }),
  });
};

export const referenceFromMatcher = (matcher) => {
  if (!matcher) return buildReference();
  let { type, name, flags } = matcher;

  return buildReference(type, name, flags);
};

export const buildBounds = (leading, trailing) => {
  return freezeRecord({ leading, trailing });
};

export const buildShift = (index, height) => {
  if (index == null || height == null) throw new Error();

  return freezeRecord({ index, height });
};

export const buildNullTag = () => {
  return buildTag(NullTag);
};

export const buildBinding = (type, name) => {
  if (type && (!isSymbol(type) || !['..', '_'].includes(type.desription))) throw new Error();
  if (name && !isSymbol(name)) throw new Error();
  if (type && name) throw new Error();

  return freezeRecord({ type, name });
};

export const buildBindingTag = (type, name) => {
  return buildTag(BindingTag, buildBinding(type, name));
};

export const buildIOStreamOpenTag = (processPath, stream) => {
  if (stream && !(stream >= 1 && stream <= 4)) throw new Error();

  return buildTag(IOStreamOpenTag, { processPath, stream });
};

export const buildChild = (type, value) => {
  if (!isSymbol(type)) throw new Error();
  let child = buildTag(type, value);
  if (!parseTag(child)) throw new Error();
  return child;
};

export const buildGapTag = () => {
  return buildTag(GapTag);
};

export const buildShiftTag = () => {
  return buildTag(ShiftTag);
};

export const buildDoctype = (version = 0, attributes = freezeRecord({})) => {
  return freezeRecord({ doctype: 'cstml', version, attributes });
};

export const buildTag = (type, value) => {
  return freezeRecord({ type, value });
};

export const buildDoctypeTag = (version = 0, attributes = freezeRecord({})) => {
  return buildTag(DoctypeTag, buildDoctype(version, attributes));
};

export const buildOpenFragmentTag = (flags = nodeFlags, selfClosing = false) => {
  return buildFullOpenNodeTag(flags, Symbol.for('__'), null, null, {}, selfClosing);
};

export const buildOpenCoverTag = (flags = nodeFlags, name = null, selfClosing = false) => {
  return buildFullOpenNodeTag(flags, Symbol.for('_'), name, null, {}, selfClosing);
};

export const buildOpenNodeTag = (
  flags,
  name,
  literalValue = null,
  attributes = freezeRecord({}),
  selfClosing = !!literalValue,
) => {
  return buildFullOpenNodeTag(flags, null, name, literalValue, attributes, selfClosing);
};

export const buildOpenNode = (
  flags = nodeFlags,
  type = Symbol.for('__'),
  name = null,
  literalValue = null,
  attributes = {},
  selfClosing = !!literalValue,
) => {
  if (!isObject(attributes)) throw new Error();
  if (literalValue && !isString(literalValue)) throw new Error();
  if (!type && !name && !flags.token && literalValue != null) throw new Error();
  if (literalValue != null && !selfClosing) throw new Error();

  return freezeRecord({
    flags,
    name: symbolName(name),
    type: symbolName(type),
    literalValue,
    attributes,
    selfClosing,
  });
};

export const buildFullOpenNodeTag = (
  flags = nodeFlags,
  type = Symbol.for('__'),
  name = null,
  literalValue = null,
  attributes = freezeRecord({}),
  selfClosing = !!literalValue,
) => {
  if (!hasOwn(flags, 'token')) throw new Error();
  return buildTag(
    OpenNodeTag,
    buildOpenNode(flags, type, name, literalValue, attributes, selfClosing),
  );
};

export const buildCloseTag = () => {
  return buildTag(CloseTag);
};

export const buildLiteralTag = (value) => {
  if (!isString(value)) throw new Error('invalid literal');
  return buildTag(LiteralTag, value);
};

export const buildAttributeDefinition = (key, value) => {
  if (!key?.length) throw new Error();

  return freezeRecord({ path: key, value });
};

export const buildAttributeDefinitionTag = (key, value) => {
  return buildTag(AttributeDefinition, buildAttributeDefinition(key, value));
};

const flagsWithGap = new WeakMap();

export const getFlagsWithGap = (flags, hasGap = true) => {
  if (flags.hasGap === hasGap) return flags;

  let gapFlags = flagsWithGap.get(flags);
  if (!gapFlags) {
    gapFlags = freezeRecord({
      token: flags.token,
      hasGap,
    });
    flagsWithGap.set(flags, gapFlags);
  }
  return gapFlags;
};

export const nodeFlags = freezeRecord({
  token: false,
  hasGap: false,
});

export const tokenFlags = freezeRecord({
  token: true,
  hasGap: false,
});

export const referenceFlags = freezeRecord({
  array: false,
  expression: false,
  intrinsic: false,
  hasGap: false,
});

export const intrinsicReferenceFlags = freezeRecord({
  array: false,
  expression: false,
  intrinsic: true,
  hasGap: false,
});

export const gapReferenceFlags = freezeRecord({
  array: false,
  expression: false,
  intrinsic: false,
  hasGap: true,
});

export const expressionReferenceFlags = freezeRecord({
  array: false,
  expression: true,
  intrinsic: false,
  hasGap: false,
});

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
  let p = buildTagParser(input);
  let { str, idx } = p;
  if (str == null) return null;
  if (isObject(str)) return str.type;
  if (!isString(str)) throw new Error();
  if (!str.length) throw new Error();

  switch (str[idx]) {
    case 'n':
      return str[idx + 1] === 'u' && str[idx + 2] === 'l' && str[idx + 3] === 'l'
        ? NullTag
        : ReferenceTag;
    case '<':
      return str[idx + 1] === '!'
        ? DoctypeTag
        : str[idx + 1] === '/'
        ? str[idx + 2] === '/'
          ? GapTag
          : CloseTag
        : OpenNodeTag;
    case '^':
      return ShiftTag;
    case ':':
      return BindingTag;
    case '.':
    case '#':
    case '@':
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
  while (sep && chr !== '}') {
    let key = `'"`.includes(chr) ? parseString(p) : parseIdentifier(p);
    chr = str[p.idx];

    if (chr !== ':') throw new Error();
    chr = str[++p.idx];

    while (chr === ' ') chr = str[++p.idx];

    let value = parseExpression(p);
    chr = str[p.idx];

    obj[key] = value;

    sep = chr === ',' ? chr : null;
    if (sep) {
      chr = str[++p.idx];
    }

    while (chr === ' ') chr = str[++p.idx];
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

  let value = parseExpression(p);
  chr = str[p.idx];

  arr.push(value);

  while (chr === ' ') {
    chr = str[++p.idx];
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

export const parseUnsignedInteger = (input) => {
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
        throw new Error();
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
        return parseUnsignedInteger(p);
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
        // TODO str is sometimes not a string!
        return { idx: 0, str: typeof tag === 'string' ? tag : printTag(tag) };
      } else {
        return tag;
      }
  }
};

export const parseOpenNodeTag = (tag) => {
  let p = buildTagParser(tag);
  let { str } = p;
  let chr = str[p.idx];

  if (chr !== '<') throw new Error();
  chr = str[++p.idx];
  let token = false;
  let hasGap = false;
  if (chr === '*') {
    chr = str[++p.idx];
    token = true;
  }
  if (chr === '$') {
    chr = str[++p.idx];
    hasGap = true;
  }

  let flags = token ? tokenFlags : nodeFlags;

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
  if (!` {'"/>`.includes(chr)) {
    name = parseIdentifier(p);
    chr = str[p.idx];
  }

  while (chr === ' ') {
    chr = str[++p.idx];
  }

  let literalValue = null;

  if (`'"`.includes(chr)) {
    literalValue = parseString(p);
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

  if (hasGap) flags = getFlagsWithGap(flags);

  return buildTag(OpenNodeTag, {
    flags,
    name: symbolName(name),
    type: symbolName(type),
    literalValue,
    attributes,
    selfClosing,
  });
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

  if ('.#@_'.includes(chr)) {
    type = chr;
    chr = str[++p.idx];
  }

  if (!type || (type === '#' && canStartIdentifier(chr))) {
    name = parseIdentifier(p);
    chr = str[p.idx];
  }
  while (chr === ' ') chr = str[++p.idx];

  let flags = parseReferenceFlags(p);
  chr = str[p.idx];

  while (chr === ' ') chr = str[++p.idx];

  if (chr !== ':') throw new Error();
  chr = str[++p.idx];

  if (isString(tag) && p.idx !== p.str.length) throw new Error();

  return buildTag(ReferenceTag, { type, name, flags });
};

export const parseLiteralTag = (tag) => {
  let p = buildTagParser(tag);

  let str = parseString(p);

  if (isString(tag) && p.idx !== p.str.length) throw new Error();

  return buildLiteralTag(str);
};

export const parseCloseTag = (tag) => {
  let p = buildTagParser(tag);
  if (!match(p, '</>')) throw new Error();
  p.idx += 3;

  if (isString(tag) && p.idx !== p.str.length) throw new Error();

  return buildCloseTag();
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
  if (!match(p, 'null')) throw new Error();
  p.idx += 4;
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

  return buildTag(AttributeDefinition, { path: key, value });
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

  let attributes = {};
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

export const parseIOStreamOpenTag = (tag) => {
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

  return buildIOStreamOpenTag(processPath, stream);
};

export const parseTag = (tag) => {
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
    case CloseTag:
      return parseCloseTag(tag);
    case GapTag:
      return parseGapTag(tag);
    case NullTag:
      return parseNullTag(tag);
    case ShiftTag:
      return parseShiftTag(tag);
    case Property:
    case TreeNode:
    case GapNode:
    case NullNode:
    case 'Effect':
      return buildTag(tag.type, tag.value);
    default:
      throw new Error();
  }
};

export const parseIOTag = (tag) => {
  let p = buildTagParser(tag);
  if (tag == null) return null;
  let { str, idx } = p;
  let idx2 = idx + 1;
  if (str[idx] === '<' && (str[idx2] === '-' || (str[idx2] >= '0' && str[idx2] <= '9'))) {
    return parseIOStreamOpenTag(tag);
  } else {
    return parseTag(tag);
  }
};

export const isValidTag = (tag) => {
  if (isString(tag)) return !!parseTag(tag);
  if (!isFrozen(tag)) return false;
  if (!hasOwn(tag, 'type') || !hasOwn(tag, 'value')) return false;

  switch (tag.type) {
    case ReferenceTag:
    case OpenNodeTag:
    case AttributeDefinition:
    case CloseTag:
    case ShiftTag:
    case NullTag:
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
