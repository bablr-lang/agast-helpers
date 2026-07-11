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
import { parseObject, parseStreamTag } from './builders.js';
import { arrayValues } from './iterable.js';
import { arrayJoin, arrayMap } from './object.js';

let { isInteger, isFinite } = Number;
let { isArray } = Array;
let { freeze, entries } = Object;
let isString = (val) => typeof val === 'string';
let isNumber = (val) => typeof val === 'number';
let isObject = (val) => val && typeof val === 'object' && !isArray(val);

export const printArray = (arr, options) =>
  `[${[...arrayValues(arr)].map((v) => printExpression(v)).join(', ')}]`;

export const printObject = (obj, options = {}) => {
  let entries_ = entries(obj);
  return entries_.length
    ? `{ ${entries_.map(([k, v]) => `${k}: ${printExpression(v)}`).join(', ')} }`
    : '{}';
};

export const printExpression = (expr, options = {}) => {
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

export const printAttributes = (attributes, options = {}) => {
  const printed =
    attributes && printObject(isString(attributes) ? parseObject(attributes) : attributes);
  return !printed || printed === '{}' ? '' : printed;
};

export const printIdentifierPath = (path, options = {}) => {
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

export const printIdentifier = (id, options = {}) => {
  return /^[a-zA-Z\u{80}-\u{10ffff}][a-zA-Z\u{80}-\u{10ffff}0-9_-]*$/u.test(id)
    ? id
    : printEscapedIdentifier(id);
};

export const printEscapedIdentifier = (id, options = {}) => {
  return `\`${id
    .replace(/[`\\]/g, '\\`')
    .replace(/[\x00-\x20\x7f]/g, (value) => `\\u00${value.toString(16).padStart(2, '0')}`)}\``;
};

export const printSingleString = (str, options = {}) => {
  return `'${str.replace(/['\\\0\r\n\t\u0000-\u001A]/g, escapeReplacer)}'`;
};

export const printDoubleString = (str, options = {}) => {
  return `"${str.replace(/["\\\0\r\n\t\u0000-\u001A]/g, escapeReplacer)}"`;
};

export const printString = (str, options = {}) => {
  return str === "'" ? printDoubleString(str) : printSingleString(str);
};

export const printGapTag = (tag, options = {}) => {
  if (tag?.type !== GapTag) throw new Error();

  return `<//>`;
};

export const printShiftTag = (tag, options = {}) => {
  if (tag?.type !== ShiftTag) throw new Error();

  return `^^^`;
};

export const printHashTag = (tag, options = {}) => {
  if (tag?.type !== HashTag) throw new Error();
  let { hash } = tag.value;
  if (!hash) throw new Error();

  return `##${hash}##`;
};

export const printReference = (ref, options = {}) => {
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

export const printBinding = (binding, options = {}) => {
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

export const printBindingTag = (tag, options = {}) => {
  return printBinding(tag.value);
};

export const printBase64 = (arrayBuffer) => {
  return `b${btoa(arrayBuffer)}`;
};

export const printBinaryTag = (tag, options = {}) => {
  if (tag?.type !== BinaryTag) throw new Error();

  return printBase64(tag.value);
};
export const printEscape = (escape, options = {}) => {
  let pclSpace = options.porcelain ? '' : ' ';
  let { value, cookedValue } = escape;
  let cookedPart = cookedValue ? `@${printString(cookedValue)}${pclSpace}` : '';
  return `${cookedPart}@@${printString(value)}`;
};

export const printEscapeTag = (tag, options = {}) => {
  if (tag?.type !== EscapeTag) throw new Error();

  return printEscape(tag.value, options);
};

export const printNullTag = (tag, options = {}) => {
  if (tag && tag.type !== NullTag && tag !== 'null') throw new Error();

  return 'null';
};

export const printName = (type, options = {}) => {
  return typeof type === 'string'
    ? type
    : typeof type === 'symbol'
    ? printIdentifier(type.description)
    : String(type);
};

export const printType = (type, options = {}) => {
  return type == null ? '' : typeof type === 'symbol' ? type.description : String(type);
};

export const printDoctypeTag = (tag, options = {}) => {
  if (tag?.type !== DoctypeTag) throw new Error();

  let { doctype, version, attributes } = tag.value;

  attributes =
    attributes && Object.values(attributes).length ? ` ${printAttributes(attributes)}` : '';

  return `<!${version}:${doctype}${attributes}>`;
};

export const printLiteralTag = (tag, options = {}) => {
  if (tag?.type !== LiteralTag) throw new Error();

  return printString(tag.value);
};

let defaultFlags = freezeRecord({
  array: false,
  expression: false,
  intrinsic: false,
  hasGap: false,
});

export const printReferenceFlags = (flags = defaultFlags, options = {}) => {
  let array = flags.array ? `[]` : '';
  let plus = flags.expression ? '+' : '';
  let star = flags.intrinsic ? '*' : '';
  let dollar = flags.hasGap ? '$' : '';

  return `${array}${plus}${star}${dollar}`;
};

export const printNodeFlags = (flags, options = {}) => {
  let star = flags.token ? '*' : '';
  let dollar = flags.hasGap ? '$' : '';

  return `${star}${dollar}`;
};

export const printNodeType = (type, options = {}) => {
  if (![Symbol.for('_'), Symbol.for('__')].includes(type)) throw new Error();

  return type.description;
};

export const printOpenNodeTag = (tag, options = {}) => {
  let pclSpace = options.porcelain ? '' : ' ';
  if (tag?.type !== OpenNodeTag) throw new Error();

  let { flags, type, name, literalValue, attributes, selfClosing } = tag.value;

  if (isString(literalValue)) throw new Error();

  if (literalValue && !selfClosing) throw new Error();
  let selfClosingFrag = selfClosing ? `${pclSpace}/` : '';
  let literalFrag = literalValue ? `${pclSpace}${printTag(literalValue)}` : '';
  let flagsFrag = printNodeFlags(flags);
  let printedAttributes = printAttributes(attributes);
  let attributesFrag = printedAttributes ? `${pclSpace}${printedAttributes}` : '';
  let typeFrag = type ? printNodeType(type) : '';
  let nameFrag = name ? printType(name) : '';

  return `<${flagsFrag}${typeFrag}${nameFrag}${literalFrag}${attributesFrag}${selfClosingFrag}>`;
};

export const printSelfClosingNodeTag = (tag, options = {}) => {
  if (tag?.type !== OpenNodeTag) throw new Error();

  let { flags, type, name, attributes, literalValue } = tag.value;

  let pclSpace = options.porcelain ? '' : ' ';
  let printedAttributes = printAttributes(attributes);
  let attributesFrag = printedAttributes ? `${pclSpace}${printedAttributes}` : '';
  let literalFrag = literalValue ? `${pclSpace}${printString(literalValue)}` : '';
  let typeFrag = type ? printNodeType(type) : '';
  let nameFrag = name ? printType(name) : '';

  return `<${printNodeFlags(
    flags,
  )}${typeFrag}${nameFrag}${literalFrag}${attributesFrag}${pclSpace}/>`;
};

export const printMuxerTag = (tag, options = {}) => {
  if (tag?.type !== MuxerTag) throw new Error();

  let { processPath, stream } = tag.value;

  return `<${arrayJoin(processPath, '.')}-${stream}>`;
};

export const printCloseNodeTag = (tag, options = {}) => {
  if (tag?.type !== CloseNodeTag) throw new Error();

  return `</>`;
};

export const printAttributeDefinition = (tag, options = {}) => {
  if (tag?.type !== AttributeDefinition) throw new Error();
  if (!tag.value.path?.length) throw new Error();
  let pclSpace = options.porcelain ? '' : ' ';
  let { path, value } = tag.value;

  return `{${pclSpace}${printIdentifierPath(
    arrayMap(path, (name) => freeze({ type: null, name })),
  )}: ${printExpression(value)}${pclSpace}}`;
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

export const printTag = (tag, options = {}) => {
  if (tag == null) return tag;
  if (!(isObject(tag) || isString(tag))) throw new Error();
  let tag_ = isObject(tag) ? tag : parseStreamTag(tag);

  let printer = printers[tag_.type];

  return printer ? printer(tag_, options) : tag_;
};
