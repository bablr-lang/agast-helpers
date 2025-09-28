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
} from './symbols.js';
import { referenceFlags } from './builders.js';

let { isInteger, isFinite } = Number;
let { isArray } = Array;
let isString = (val) => typeof val === 'string';
let isNumber = (val) => typeof val === 'number';
let isObject = (val) => val && typeof val === 'object' && !isArray(val);

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
  return /^[a-zA-Z\u{80}-\u{10ffff}][a-zA-Z\u{80}-\u{10ffff}0-9_-]*$/u.test(id)
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

export const printShiftTag = (tag) => {
  if (tag?.type !== ShiftTag) throw new Error();

  return `^^^`;
};

export const printReference = (ref) => {
  let { type, name, isArray, flags } = ref;
  let pathBraces = isArray ? `[]` : '';

  if (type && type !== '#' && name) throw new Error();
  if (type && !['.', '#', '@'].includes(type)) throw new Error();

  return `${type || ''}${printIdentifier(name) || ''}${pathBraces}${printReferenceFlags(flags)}:`;
};

export const printBinding = (binding) => {
  let { languagePath } = binding;
  return `:${languagePath ? printIdentifierPath(languagePath) : ''}:`;
};

export const printReferenceTag = (tag) => {
  return printReference(tag.value);
};

export const printBindingTag = (tag) => {
  return printBinding(tag.value);
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
  let fragment = flags.fragment ? '_' : '';
  let multiFragment = fragment && !flags.cover ? '_' : '';

  return `${star}${dollar}${fragment}${multiFragment}`;
};

export const printOpenNodeTag = (tag) => {
  if (tag?.type !== OpenNodeTag) throw new Error();

  let { flags, type, literalValue, attributes, selfClosing } = tag.value;

  if (literalValue && !selfClosing) throw new Error();
  let selfClosingFrag = selfClosing ? ' /' : '';
  let literalFrag = literalValue ? ` ${printString(literalValue)}` : '';

  let printedAttributes = printAttributes(attributes);
  let attributesFrag = printedAttributes ? ` ${printedAttributes}` : '';
  let typeFrag = type ? printType(type) : '';

  return `<${printNodeFlags(flags)}${typeFrag}${literalFrag}${attributesFrag}${selfClosingFrag}>`;
};

export const printSelfClosingNodeTag = (tag, literalValue) => {
  if (tag?.type !== OpenNodeTag) throw new Error();

  let { flags, type, attributes } = tag.value;

  let printedAttributes = printAttributes(attributes);
  let attributesFrag = printedAttributes ? ` ${printedAttributes}` : '';
  let intrinsicFrag = literalValue ? ` ${printString(literalValue)}` : '';

  return `<${printNodeFlags(flags)}${printType(type)}${intrinsicFrag}${attributesFrag} />`;
};

export const printCloseNodeTag = (tag) => {
  if (tag?.type !== CloseNodeTag) throw new Error();

  return `</>`;
};

export const printAttributeDefinition = (tag) => {
  if (tag?.type !== AttributeDefinition) throw new Error();
  if (!tag.value.path?.length) throw new Error();
  let { path, value } = tag.value;

  return `{ ${printIdentifierPath(path)}: ${printExpression(value)} }`;
};

const printers = {
  [NullTag]: printNullTag,
  [GapTag]: printGapTag,
  [BindingTag]: printBindingTag,
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
