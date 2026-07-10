/* global btoa */
import { freezeRecord } from '@bablr/record';
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
  MuxerTag,
  HashTag,
  BinaryTag,
  EscapeTag,
} from './symbols.js';
import { parseObject } from './builders.js';
import { arrayValues } from './iterable.js';
import { arrayJoin, arrayMap } from './object.js';

let { isInteger, isFinite } = Number;
let { isArray } = Array;
let { freeze, entries } = Object;
let isString = (val) => typeof val === 'string';
let isNumber = (val) => typeof val === 'number';
let isObject = (val) => val && typeof val === 'object' && !isArray(val);

export const printArray = (arr) =>
  `[${[...arrayValues(arr)].map((v) => printExpression(v)).join(', ')}]`;

export const printObject = (obj) => {
  let entries_ = entries(obj);
  return entries_.length
    ? `{ ${entries_.map(([k, v]) => `${k}: ${printExpression(v)}`).join(', ')} }`
    : '{}';
};

export const printExpression = (expr) => {
  if (isString(expr)) {
    return printString(expr);
  } else if (typeof expr === 'symbol') {
    return printString(expr.description);
  } else if (expr == null || typeof expr === 'boolean') {
    return String(expr);
  } else if (isNumber(expr)) {
    if (!isFinite(expr)) {
      if (isNaN(expr)) throw new Error();
      return expr === -Infinity ? '-Infinity' : '+Infinity';
    } else if (isInteger(expr)) {
      return String(expr);
    } else {
      throw new Error();
    }
  } else if (isArray(expr)) {
    return printArray(expr);
  } else if (isObject(expr)) {
    return printObject(expr);
  } else {
    throw new Error();
  }
};

export const printAttributes = (attributes) => {
  const printed =
    attributes && printObject(isString(attributes) ? parseObject(attributes) : attributes);
  return !printed || printed === '{}' ? '' : printed;
};

export const printIdentifierPath = (path) => {
  return arrayMap(path, (segment) => {
    let { name, type } = segment;
    if (name) {
      return printIdentifier(name);
    }
    if (type) {
      if (type !== '..') throw new Error();
      return type;
    } else {
      throw new Error();
    }
  }).join('.');
};

let escapeReplacer = (esc) => {
  if (esc === '\r') {
    return '\\r';
  } else if (esc === '\n') {
    return '\\n';
  } else if (esc === '\t') {
    return '\\t';
  } else if (esc === '\0') {
    return '\\0';
  } else if (esc < ' ') {
    return `\\u${esc.charCodeAt(0).toString(16).padStart(4, '0')}`;
  } else {
    return `\\${esc}`;
  }
};

export const printIdentifier = (id) => {
  return /^[a-zA-Z\u{80}-\u{10ffff}][a-zA-Z\u{80}-\u{10ffff}0-9_-]*$/u.test(id)
    ? id
    : printEscapedIdentifier(id);
};

export const printEscapedIdentifier = (id) => {
  return `\`${id
    .replace(/[`\\]/g, '\\`')
    .replace(/[\x00-\x20\x7f]/g, (value) => `\\u00${value.toString(16).padStart(2, '0')}`)}\``;
};

export const printSingleString = (str) => {
  return `'${str.replace(/['\\\0\r\n\t\u0000-\u001A]/g, escapeReplacer)}'`;
};

export const printDoubleString = (str) => {
  return `"${str.replace(/["\\\0\r\n\t\u0000-\u001A]/g, escapeReplacer)}"`;
};

export const printString = (str) => {
  return str === "'" ? printDoubleString(str) : printSingleString(str);
};

export const printGapTag = (tag) => {
  if (tag?.type !== GapTag) throw new Error();

  return `<//>`;
};

export const printShiftTag = (tag) => {
  if (tag?.type !== ShiftTag) throw new Error();

  return `^^^`;
};

export const printHashTag = (tag) => {
  if (tag?.type !== HashTag) throw new Error();
  let { hash } = tag.value;
  if (!hash) throw new Error();

  return `##${hash}##`;
};

export const printReference = (ref) => {
  let { type, name, flags } = ref;

  if (type && type !== '#' && name) throw new Error();
  if (type && !['_', '__', '.', '#'].includes(type)) throw new Error();

  return `${type || ''}${
    name
      ? name.length === 1 && name >= 'a' && name <= 'z'
        ? printEscapedIdentifier(name)
        : printIdentifier(name)
      : ''
  }${printReferenceFlags(flags)}:`;
};

export const printBinding = (binding) => {
  let { type, name } = binding;
  if (type) {
    if (type !== '..') throw new Error();
    return `:${type}:`;
  } else if (name) {
    return `:${printIdentifier(name.description)}:`;
  } else {
    throw new Error();
  }
};

export const printReferenceTag = (tag) => {
  return printReference(tag.value);
};

export const printBindingTag = (tag) => {
  return printBinding(tag.value);
};

export const printBase64 = (arrayBuffer) => {
  return `b${btoa(arrayBuffer)}`;
};

export const printBinaryTag = (tag) => {
  if (tag?.type !== BinaryTag) throw new Error();

  return printBase64(tag.value);
};
export const printEscape = (escape) => {
  let { value, cookedValue } = escape;
  let cookedPart = cookedValue ? `@${printString(cookedValue)}` : '';
  return `${cookedPart}@@${printString(value)}`;
};

export const printEscapeTag = (tag) => {
  if (tag?.type !== EscapeTag) throw new Error();

  return printEscape(tag.value);
};

export const printNullTag = (tag) => {
  if (tag && tag.type !== NullTag && tag !== 'null') throw new Error();

  return 'null';
};

export const printName = (type) => {
  return typeof type === 'string'
    ? type
    : typeof type === 'symbol'
    ? printIdentifier(type.description)
    : String(type);
};

export const printType = (type) => {
  return type == null ? '' : typeof type === 'symbol' ? type.description : String(type);
};

export const printDoctypeTag = (tag) => {
  if (tag?.type !== DoctypeTag) throw new Error();

  let { doctype, version, attributes } = tag.value;

  attributes =
    attributes && Object.values(attributes).length ? ` ${printAttributes(attributes)}` : '';

  return `<!${version}:${doctype}${attributes}>`;
};

export const printLiteralTag = (tag) => {
  if (tag?.type !== LiteralTag) throw new Error();

  return printString(tag.value);
};

let defaultFlags = freezeRecord({
  array: false,
  expression: false,
  intrinsic: false,
  hasGap: false,
});

export const printReferenceFlags = (flags = defaultFlags) => {
  let array = flags.array ? `[]` : '';
  let plus = flags.expression ? '+' : '';
  let star = flags.intrinsic ? '*' : '';
  let dollar = flags.hasGap ? '$' : '';

  return `${array}${plus}${star}${dollar}`;
};

export const printNodeFlags = (flags) => {
  let star = flags.token ? '*' : '';
  let dollar = flags.hasGap ? '$' : '';

  return `${star}${dollar}`;
};

export const printNodeType = (type) => {
  if (![Symbol.for('_'), Symbol.for('__')].includes(type)) throw new Error();

  return type.description;
};

export const printOpenNodeTag = (tag) => {
  if (tag?.type !== OpenNodeTag) throw new Error();

  let { flags, type, name, literalValue, attributes, selfClosing } = tag.value;

  if (isString(literalValue)) throw new Error();

  if (literalValue && !selfClosing) throw new Error();
  let selfClosingFrag = selfClosing ? ' /' : '';
  let literalFrag = literalValue ? ` ${printTag(literalValue)}` : '';
  let flagsFrag = printNodeFlags(flags);
  let printedAttributes = printAttributes(attributes);
  let attributesFrag = printedAttributes ? ` ${printedAttributes}` : '';
  let typeFrag = type ? printNodeType(type) : '';
  let nameFrag = name ? printType(name) : '';

  return `<${flagsFrag}${typeFrag}${nameFrag}${literalFrag}${attributesFrag}${selfClosingFrag}>`;
};

export const printSelfClosingNodeTag = (tag) => {
  if (tag?.type !== OpenNodeTag) throw new Error();

  let { flags, type, name, attributes, literalValue } = tag.value;

  let printedAttributes = printAttributes(attributes);
  let attributesFrag = printedAttributes ? ` ${printedAttributes}` : '';
  let literalFrag = literalValue ? ` ${printString(literalValue)}` : '';
  let typeFrag = type ? printNodeType(type) : '';
  let nameFrag = name ? printType(name) : '';

  return `<${printNodeFlags(flags)}${typeFrag}${nameFrag}${literalFrag}${attributesFrag} />`;
};

export const printMuxerTag = (tag) => {
  if (tag?.type !== MuxerTag) throw new Error();

  let { processPath, stream } = tag.value;

  return `<${arrayJoin(processPath, '.')}-${stream}>`;
};

export const printCloseNodeTag = (tag) => {
  if (tag?.type !== CloseNodeTag) throw new Error();

  return `</>`;
};

export const printAttributeDefinition = (tag) => {
  if (tag?.type !== AttributeDefinition) throw new Error();
  if (!tag.value.path?.length) throw new Error();
  let { path, value } = tag.value;

  return `{ ${printIdentifierPath(
    arrayMap(path, (name) => freeze({ type: null, name })),
  )}: ${printExpression(value)} }`;
};

const printers = {
  [NullTag]: printNullTag,
  [GapTag]: printGapTag,
  [BindingTag]: printBindingTag,
  [ShiftTag]: printShiftTag,
  [LiteralTag]: printLiteralTag,
  [BinaryTag]: printBinaryTag,
  [EscapeTag]: printEscapeTag,
  [DoctypeTag]: printDoctypeTag,
  [ReferenceTag]: printReferenceTag,
  [OpenNodeTag]: printOpenNodeTag,
  [CloseNodeTag]: printCloseNodeTag,
  [HashTag]: printHashTag,
  [MuxerTag]: printMuxerTag,
  [AttributeDefinition]: printAttributeDefinition,
};

export const printTag = (tag) => {
  if (tag == null || isString(tag)) return tag;
  if (!isObject(tag)) throw new Error();

  let printer = printers[tag.type];

  return printer ? printer(tag) : tag;
};

export const printIOTag = (tag) => {
  if (tag == null || isString(tag)) return tag;
  if (!isObject(tag)) throw new Error();

  if (tag.type === MuxerTag) {
    return printMuxerTag(tag);
  }
  return printTag(tag);
};
