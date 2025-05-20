import {
  DoctypeTag,
  OpenNodeTag,
  CloseNodeTag,
  ReferenceTag,
  ShiftTag,
  GapTag,
  NullTag,
  InitializerTag,
  LiteralTag,
  AttributeDefinition,
  BindingTag,
} from './symbols.js';
import { referenceFlags } from './tree.js';

let { isInteger, isFinite } = Number;
let { isArray } = Array;
let isString = (val) => typeof val === 'string';
let isNumber = (val) => typeof val === 'number';
let isObject = (val) => val && typeof val === 'object' && !isArray(val);
let isFunction = (val) => typeof val === 'function';

let when = (condition, value) =>
  condition ? (isFunction(value) ? value() : value) : { *[Symbol.iterator]() {} };

export const printArray = (arr) => `[${arr.map((v) => printExpression(v)).join(', ')}]`;

export const printObject = (obj) => {
  let entries = Object.entries(obj);
  return entries.length
    ? `{ ${entries.map(([k, v]) => `${k}: ${printExpression(v)}`).join(', ')} }`
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
  } else {
    throw new Error();
  }
};

export const printAttributes = (attributes) => {
  const printed = attributes && printObject(attributes);
  return !printed || printed === '{}' ? '' : printed;
};

export const printLanguage = (language) => {
  if (isString(language)) {
    return printSingleString(language);
  } else {
    return language.map(printIdentifier).join('.');
  }
};

export const printTagPath = (language, type) => {
  return [
    ...when(type && language?.length, () => [printLanguage(language)]),
    ...when(type, [printType(type)]),
  ].join(':');
};

export const printIdentifierPath = (path) => {
  return path.map(printIdentifier).join('.');
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
  return /^[a-zA-Z\u{80}-\u{10ffff}][a-zA-Z\u{80}-\u{10ffff}0-9_-]+$/u.test(id)
    ? id
    : `\`${id
        .replace(/[`\\]/g, '\\`')
        .replace(/[\x00-\x20\x7f]/g, (value) => `\\u00${value.toString(16)}`)}\``;
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

export const printInitializerTag = (tag) => {
  if (tag?.type !== InitializerTag) throw new Error();

  if (tag.value.isArray) {
    return `[]`;
  } else {
    return 'undefined';
  }
};

export const printShiftTag = (tag) => {
  if (tag?.type !== ShiftTag) throw new Error();

  return `^^^`;
};

export const printReferenceTag = (tag) => {
  if (tag?.type !== ReferenceTag) throw new Error();

  let { type, name, isArray, flags, index } = tag.value;
  let pathBraces = isArray ? `[${index || ''}]` : '';

  if (type && name) throw new Error();
  if (type && !['.', '#', '@'].includes(type)) throw new Error();

  return `${type || printIdentifier(name) || ''}${pathBraces}${printReferenceFlags(flags)}:`;
};

export const printNullTag = (tag) => {
  if (tag && tag.type !== NullTag) {
    throw new Error();
  }

  return 'null';
};

export const printType = (type) => {
  return typeof type === 'string'
    ? type
    : typeof type === 'symbol'
    ? printIdentifier(type.description)
    : String(type);
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

export const printReferenceFlags = (flags = referenceFlags) => {
  let plus = flags.expression ? '+' : '';
  let dollar = flags.hasGap ? '$' : '';

  return `${plus}${dollar}`;
};

export const printNodeFlags = (flags) => {
  if (flags.cover && !flags.fragment) throw new Error();
  let star = flags.token ? '*' : '';
  let dollar = flags.hasGap ? '$' : '';

  return `${star}${dollar}`;
};

export const printBindingTag = (tag) => {
  let { languagePath } = tag.value;
  return `:${languagePath ? printIdentifierPath(languagePath) : ''}:`;
};

export const printOpenNodeTag = (tag) => {
  if (tag?.type !== OpenNodeTag) throw new Error();

  let { flags, language: tagLanguage, type, attributes } = tag.value;

  if (!type) {
    return `<${printNodeFlags(flags)}_>`;
  }

  let printedAttributes = printAttributes(attributes);
  let attributesFrag = printedAttributes ? ` ${printedAttributes}` : '';

  return `<${printNodeFlags(flags)}${printTagPath(null, type)}${attributesFrag}>`;
};

export const printSelfClosingNodeTag = (tag, intrinsicValue) => {
  if (tag?.type !== OpenNodeTag) throw new Error();

  let { flags, language: tagLanguage, type, attributes } = tag.value;

  let printedAttributes = printAttributes(attributes);
  let attributesFrag = printedAttributes ? ` ${printedAttributes}` : '';
  let intrinsicFrag = intrinsicValue ? ` ${printString(intrinsicValue)}` : '';

  return `<${printNodeFlags(flags)}${printTagPath(
    tagLanguage,
    type,
  )}${intrinsicFrag}${attributesFrag} />`;
};

export const printCloseNodeTag = (tag) => {
  if (tag?.type !== CloseNodeTag) throw new Error();

  return `</>`;
};

export const printAttributeDefinition = (tag) => {
  if (tag?.type !== AttributeDefinition) throw new Error();
  let { path, value } = tag.value;

  return `{ ${printIdentifierPath(path)}: ${printExpression(value)} }`;
};

const printers = {
  [NullTag]: printNullTag,
  [GapTag]: printGapTag,
  [BindingTag]: printBindingTag,
  [InitializerTag]: printInitializerTag,
  [ShiftTag]: printShiftTag,
  [LiteralTag]: printLiteralTag,
  [DoctypeTag]: printDoctypeTag,
  [ReferenceTag]: printReferenceTag,
  [OpenNodeTag]: printOpenNodeTag,
  [CloseNodeTag]: printCloseNodeTag,
  [AttributeDefinition]: printAttributeDefinition,
};

export const printTag = (tag) => {
  if (!isObject(tag)) throw new Error();

  let printer = printers[tag?.type];

  return printer(tag);
};
