import * as BList from './b-list.js';
import {
  hasOwn,
  isObject,
  isArray,
  isSymbol,
  deepFreeze,
  freeze,
  isString,
  isFrozen,
  isDeepFrozen,
} from './object.js';
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
} from './symbols.js';

export const symbolName = (name) => {
  return isString(name) ? Symbol.for(name) : name;
};

export const buildSpan = (name, guard = null, props = {}) => {
  if (!name) throw new Error();

  deepFreeze(props);

  return freeze({ name, guard, props });
};

export const buildSpanEntry = (name, guard = null, props = {}) => {
  return freeze([name, buildSpan(name, guard, props)]);
};

export const buildProperty = (tags, shift) => {
  if (shift && !shift.index) throw new Error();

  if (tags[1][0] && ![ReferenceTag, ShiftTag].includes(tags[1][0].type)) throw new Error();
  if (tags[1].length > 1 && !isArray(tags[1][1])) throw new Error();

  // if (property.node && !(tags.length === 3)) throw new Error();
  // if (tags[0].type === ShiftTag && !property.shift) throw new Error();

  if ((tags[1][0]?.type == ShiftTag) !== !!shift) throw new Error();
  if (tags[1][2] && ![NullNode, GapNode, TreeNode].includes(tags[1][2].type)) throw new Error();

  return freeze({
    tags,
    reference: tags[1][0]?.type === ShiftTag ? null : tags[1][0]?.value || buildReference(),
    bindings: tags[1][1]
      ? freeze([...BList.traverse(tags[1][1])].map((tag) => parseTag(tag).value))
      : freeze([]),
    node: tags[1][2] || null,
    shift: tags[1][0]?.type == ShiftTag ? shift : null,
  });
};

export const buildPathFrame = (property, parentIndex = null, isGap = false) => {
  return freeze({ property, parentIndex, isGap });
};

export const buildPropertyTag = (tags, shift) => {
  return freeze({ type: Property, value: buildProperty(tags, shift) });
};

export const buildDocument = (doctypeTag, tree) => {
  return freeze({ type: Document, value: freeze({ doctypeTag, tree }) });
};

export const buildBeginningOfStreamToken = () => {
  return freeze({ type: Symbol.for('@bablr/beginning-of-stream'), value: undefined });
};

export const buildReferenceTag = (type = null, name = null, flags = referenceFlags) => {
  return freeze({
    type: ReferenceTag,
    value: buildReference(type, name, flags),
  });
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

  return freeze({ type: type_, name, flags: freeze({ array, expression, intrinsic, hasGap }) });
};

export const referenceFromMatcher = (matcher) => {
  if (!matcher) return buildReference();
  let { type, name, flags } = matcher;

  return buildReference(type, name, flags);
};

export const buildBounds = (leading, trailing) => {
  return freeze({ leading, trailing });
};

export const buildShift = (index, height) => {
  if (index == null || height == null) throw new Error();

  return freeze({ index, height });
};

export const buildNullTag = () => {
  return freeze({ type: NullTag, value: undefined });
};

export const buildBinding = (segments = []) => {
  // TODO relax this restriction
  if (!isArray(segments) || !segments.length) throw new Error();
  if (segments.includes(undefined)) throw new Error();

  return freeze({
    segments: freeze(
      segments.map((segment) =>
        freeze(isString(segment) ? { type: null, name: segment } : segment),
      ),
    ),
  });
};

export const buildBindingTag = (segments = []) => {
  return freeze({
    type: BindingTag,
    value: buildBinding(segments),
  });
};

export const buildChild = (type, value) => {
  if (!isSymbol(type)) throw new Error();
  let child = freeze({ type, value });
  if (!isValidTag(child)) throw new Error();
  return child;
};

export const buildGapTag = () => {
  return freeze({ type: GapTag, value: undefined });
};

export const buildShiftTag = () => {
  return freeze({ type: ShiftTag, value: undefined });
};

export const buildDoctype = (version = 0, attributes = freeze({})) => {
  deepFreeze(attributes);

  return freeze({ doctype: 'cstml', version, attributes });
};

export const buildDoctypeTag = (version = 0, attributes = freeze({})) => {
  return freeze({
    type: DoctypeTag,
    value: buildDoctype(version, attributes),
  });
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
  attributes = freeze({}),
  selfClosing = !!literalValue,
) => {
  return buildFullOpenNodeTag(flags, null, name, literalValue, attributes, selfClosing);
};

export const buildOpenNode = (
  flags = nodeFlags,
  type = Symbol.for('__'),
  name = null,
  literalValue = null,
  attributes = freeze({}),
  selfClosing = !!literalValue,
) => {
  if (!isObject(attributes)) throw new Error();
  if (literalValue && !isString(literalValue)) throw new Error();
  if (!type && !name && !flags.token && literalValue != null) throw new Error();
  if (literalValue != null && !selfClosing) throw new Error();

  deepFreeze(attributes);
  freeze(flags);

  return freeze({
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
  attributes = freeze({}),
  selfClosing = !!literalValue,
) => {
  if (!hasOwn(flags, 'token')) throw new Error();
  return freeze({
    type: OpenNodeTag,
    value: buildOpenNode(flags, type, name, literalValue, attributes, selfClosing),
  });
};

export const buildCloseNodeTag = () => {
  return freeze({ type: CloseNodeTag, value: undefined });
};

export const buildLiteralTag = (value) => {
  if (!isString(value)) throw new Error('invalid literal');
  return freeze({ type: LiteralTag, value });
};

export const buildAttributeDefinition = (key, value) => {
  if (!key?.length) throw new Error();

  deepFreeze(value);

  return freeze({ path: key, value });
};

export const buildAttributeDefinitionTag = (key, value) => {
  return freeze({ type: AttributeDefinition, value: buildAttributeDefinition(key, value) });
};

const flagsWithGap = new WeakMap();

export const getFlagsWithGap = (flags, hasGap = true) => {
  if (flags.hasGap === hasGap) return flags;

  let gapFlags = flagsWithGap.get(flags);
  if (!gapFlags) {
    gapFlags = freeze({
      token: flags.token,
      hasGap,
    });
    flagsWithGap.set(flags, gapFlags);
  }
  return gapFlags;
};

export const nodeFlags = freeze({
  token: false,
  hasGap: false,
});

export const tokenFlags = freeze({
  token: true,
  hasGap: false,
});

export const referenceFlags = freeze({
  array: false,
  expression: false,
  intrinsic: false,
  hasGap: false,
});

export const intrinsicReferenceFlags = freeze({
  array: false,
  expression: false,
  intrinsic: true,
  hasGap: false,
});

export const gapReferenceFlags = freeze({
  array: false,
  expression: false,
  intrinsic: false,
  hasGap: true,
});

export const expressionReferenceFlags = freeze({
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

export const parseTagType = (tag) => {
  if (isObject(tag)) return tag.type;
  if (!isString(tag)) throw new Error();
  if (!tag.length) throw new Error();

  switch (tag[0]) {
    case 'n':
      return tag[1] === 'u' && tag[2] === 'l' && tag[3] === 'l' ? NullTag : ReferenceTag;
    case '<':
      return tag[1] === '!'
        ? DoctypeTag
        : tag[1] === '/'
        ? tag[2] === '/'
          ? GapTag
          : CloseNodeTag
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
      if (canStartIdentifier(tag[0])) {
        return ReferenceTag;
      } else {
        throw new Error();
      }
  }
};

export const parseObject = (p) => {
  let { str } = buildParser(p);
  let obj = {};
  let chr = str[p.idx];

  if (chr !== '{') throw new Error();
  chr = str[++p.idx];

  if (chr === ' ') {
    chr = str[++p.idx];
  }

  let sep = true;
  while (sep && chr !== '}') {
    let key = `'"`.includes(chr) ? parseString(p) : parseIdentifier(p);
    chr = str[p.idx];

    if (chr !== ':') throw new Error();
    chr = str[++p.idx];

    if (chr === ' ') {
      chr = str[++p.idx];
    }

    let value = parseExpression(p);
    chr = str[p.idx];

    obj[key] = value;

    sep = chr === ',' ? chr : null;
    if (sep) {
      chr = str[++p.idx];
    }

    if (chr === ' ') {
      chr = str[++p.idx];
    }
  }

  if (chr !== '}') throw new Error();
  chr = str[++p.idx];

  return obj;
};

export const parseArray = (p) => {
  let { str } = buildParser(p);
  let arr = [];
  let chr = str[p.idx];

  if (chr !== '[') throw new Error();
  chr = str[++p.idx];

  if (chr === ' ') {
    chr = str[++p.idx];
  }

  let value = parseExpression(p);
  chr = str[p.idx];

  arr.push(value);

  if (chr === ' ') {
    chr = str[++p.idx];
  }

  if (chr !== ']') throw new Error();
  chr = str[++p.idx];

  return arr;
};

export const parseString = (p) => {
  let { str } = buildParser(p);
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

export const parseNumber = (p) => {
  let { str } = buildParser(p);
  let chr = str[p.idx];
  let digits = [];

  while (chr >= '0' && chr <= '9') {
    digits.push(chr);
    chr = str[++p.idx];
  }

  return parseInt(digits.join(''), 10);
};

let match = (p, literal) => {
  let idx = 0;
  let endIdx = literal.length;
  let { idx: pIdx, str } = p;

  while (idx < endIdx) {
    if (str[pIdx + idx] !== literal[idx]) return null;
    idx++;
  }
  return literal;
};

export const parseEscape = (p) => {
  let { str } = buildParser(p);
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

export const parseExpression = (p) => {
  let { str } = buildParser(p);
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
        return parseNumber(p);
      } else {
        throw new Error();
      }
  }
};

export const parseIdentifier = (p) => {
  let { str } = buildParser(p);
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
  return value.join([]);
};

let buildTagParser = (tag) => {
  return { idx: 0, str: typeof tag === 'string' ? tag : printTag(tag) };
};

let buildParser = (str) => {
  return isObject(str) ? str : { idx: 0, str };
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

  if (chr === ' ') {
    chr = str[++p.idx];
  }

  let literalValue = null;

  if (`'"`.includes(chr)) {
    literalValue = parseString(p);
    chr = str[p.idx];

    if (chr === ' ') {
      chr = str[++p.idx];
    }
  }

  let attributes = freeze({});

  if (chr === '{') {
    attributes = parseObject(p);
    chr = str[p.idx];

    if (chr === ' ') {
      chr = str[++p.idx];
    }
  }

  let selfClosing = false;

  if (chr === '/') {
    chr = str[++p.idx];
    selfClosing = true;
  }

  if (chr === '>') {
    chr = str[++p.idx];
  }

  if (p.idx !== str.length) throw new Error();

  if (hasGap) flags = getFlagsWithGap(flags);

  return buildFullOpenNodeTag(flags, type, name, literalValue, attributes, selfClosing);
};

export const parseReferenceTag = (str) => {
  let str_ = isObject(str) ? printTag(str) : str;
  let {
    1: type,
    2: namedType,
    3: name,
    4: array,
    5: expressionToken,
    6: intrinsicToken,
    7: hasGapToken,
  } = /^\s*(?:([.#@_])|(#)?([a-zA-Z\u{80}-\u{10ffff}][a-zA-Z0-9_\u{80}-\u{10ffff}-]*))\s*(\[\])?\s*(\+)?(\*)?(\$)?\s*:/u.exec(
    str_,
  );

  let flags = freeze({
    array: !!array,
    expression: !!expressionToken,
    intrinsic: !!intrinsicToken,
    hasGap: !!hasGapToken,
  });

  type = type || namedType || null;
  name = name || null;

  return buildReferenceTag(type, name, flags);
};

export const parseLiteralTag = (tag) => {
  let p = buildTagParser(tag);
  return buildLiteralTag(parseString(p));
};

export const parseCloseNodeTag = (tag) => {
  let p = buildTagParser(tag);
  if (!match(p, '</>')) throw new Error();
  return buildCloseNodeTag();
};

export const parseGapTag = (tag) => {
  let p = buildTagParser(tag);
  if (!match(p, '<//>')) throw new Error();
  return buildGapTag();
};

export const parseNullTag = (tag) => {
  let p = buildTagParser(tag);
  if (!match(p, 'null')) throw new Error();
  return buildNullTag();
};

export const parseShiftTag = (tag) => {
  let p = buildTagParser(tag);
  if (!match(p, '^^^')) throw new Error();
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

  return freeze(segments);
};

export const parseBindingSegment = (p) => {
  let { str } = buildParser(p);
  let chr = str[p.idx];
  let segments = [];

  let sep = true;
  while (sep) {
    if (chr === '.' && str[p.idx + 1] === '.') {
      p.idx += 2;
      segments.push(freeze({ type: '..', name: null }));
    } else {
      segments.push(freeze({ type: null, name: parseIdentifier(p) }));
      chr = str[p.idx];
    }

    sep = chr === '/' ? chr : null;
  }

  return freeze(segments);
};

export const parseAttributeDefinitionTag = (tag) => {
  let p = buildTagParser(tag);
  let { str } = p;
  let chr = str[p.idx];

  if (chr !== '{') throw new Error();
  chr = str[++p.idx];

  if (chr === ' ') {
    chr = str[++p.idx];
  }

  let key = parseIdentifierPath(p);
  chr = str[p.idx];

  if (chr !== ':') throw new Error();
  chr = str[++p.idx];

  if (chr === ' ') {
    chr = str[++p.idx];
  }

  let value = parseExpression(p);
  chr = str[p.idx];

  if (chr === ' ') {
    chr = str[++p.idx];
  }

  if (chr !== '}') throw new Error();
  chr = str[++p.idx];

  return buildAttributeDefinitionTag(key, value);
};

export const parseBindingTag = (tag) => {
  let p = buildTagParser(tag);
  let { str } = p;
  let chr = str[p.idx];

  if (chr !== ':') throw new Error();
  chr = str[++p.idx];

  if (chr === ' ') {
    chr = str[++p.idx];
  }

  let segments = parseBindingSegment(p);
  chr = str[p.idx];

  if (chr === ' ') {
    chr = str[++p.idx];
  }

  if (chr !== ':') throw new Error();
  chr = str[++p.idx];

  return buildBindingTag(segments);
};

export const parseTag = (tag) => {
  if (tag == null) return tag;

  let tagType = parseTagType(tag);

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
    case CloseNodeTag:
      return parseCloseNodeTag(tag);
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
      return tag;
    default:
      throw new Error();
  }
};

export const isValidLiteral = (value) => {
  if (!isString(value)) return false;

  return true;
};

export const isValidReference = (value) => {
  if (!value || !isFrozen(value)) return false;
  if (!hasOwn(value, 'type') || !hasOwn(value, 'name') || !hasOwn(value, 'flags')) return false;

  if (!isValidReferenceFlags(value.flags)) return false;

  return true;
};

export const isValidBinding = (value) => {
  if (!value || !isFrozen(value)) return false;
  if (!hasOwn(value, 'segments')) return false;

  if (!isArray(value.segments)) return false;
  if (!isFrozen(value.segments)) return false;
  for (let segment of value.segments) {
    if (!isFrozen(segment)) return false;
  }

  return true;
};

export const isValidDoctype = (value) => {
  if (!value || !isFrozen(value)) return false;
  if (!hasOwn(value, 'doctype') || !hasOwn(value, 'version') || !hasOwn(value, 'attributes'))
    return false;

  if (!isDeepFrozen(value.attributes)) return false;

  if (value.doctype !== 'cstml') return false;

  return true;
};

export const isValidAttributeDefinition = (value) => {
  if (!value || !isFrozen(value)) return false;
  if (!hasOwn(value, 'path') || !hasOwn(value, 'value')) return false;

  if (!isDeepFrozen(value.value)) return false;

  return true;
};

export const isValidReferenceFlags = (value) => {
  if (!value || !isFrozen(value)) return false;
  if (
    !hasOwn(value, 'array') ||
    !hasOwn(value, 'expression') ||
    !hasOwn(value, 'intrinsic') ||
    !hasOwn(value, 'hasGap')
  )
    return false;

  return true;
};

export const isValidNodeFlags = (value) => {
  if (!value || !isFrozen(value)) return false;
  if (!hasOwn(value, 'token') || !hasOwn(value, 'hasGap')) return false;
  return true;
};

export const isValidOpenNode = (value) => {
  if (!value || !isFrozen(value)) return false;
  if (
    !hasOwn(value, 'flags') ||
    !hasOwn(value, 'name') ||
    !hasOwn(value, 'type') ||
    !hasOwn(value, 'literalValue') ||
    !hasOwn(value, 'attributes') ||
    !hasOwn(value, 'selfClosing')
  )
    return false;

  if (!isValidNodeFlags(value.flags)) return false;

  if (!isDeepFrozen(value.attributes)) return false;

  return true;
};

export const isValidProperty = (value) => {
  if (!value || !isFrozen(value)) return false;
  if (
    !hasOwn(value, 'bindings') ||
    !hasOwn(value, 'node') ||
    !hasOwn(value, 'reference') ||
    !hasOwn(value, 'shift') ||
    !hasOwn(value, 'tags')
  )
    return false;

  for (let binding of value.bindings) if (!isValidBinding(binding)) throw new Error();
  if (value.reference && !isValidReference(value.reference)) throw new Error();
  // if (value.node && !isValidNodeTag(value.node)) throw new Error();
  return true;
};

export const isValidTag = (tag) => {
  if (isString(tag)) return !!parseTag(tag);
  if (!isFrozen(tag)) return false;
  if (!hasOwn(tag, 'type') || !hasOwn(tag, 'value')) return false;

  switch (tag.type) {
    case ReferenceTag:
      return isValidReference(tag.value);
    case OpenNodeTag:
      return isValidOpenNode(tag.value);
    case AttributeDefinition:
      return isValidAttributeDefinition(tag.value);
    case CloseNodeTag:
    case ShiftTag:
    case NullTag:
    case GapTag:
      return true;
    case LiteralTag:
      return isValidLiteral(tag.value);
    case BindingTag:
      return isValidBinding(tag.value);
    case Property:
      return isValidProperty(tag.value);
    case TreeNode:
    case GapNode:
    case NullNode:
      return false;
    case DoctypeTag:
      return isValidDoctype(tag.value);
    default:
      throw new Error();
  }
};
