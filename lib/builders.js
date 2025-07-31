import { isSymbol } from './object.js';
import { printType } from './print.js';
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
  Document,
} from './symbols.js';

const { freeze, hasOwn } = Object;
const { isArray } = Array;

export const buildProperty = (reference, binding = null, node = undefined) => {
  if (node?.binding) throw new Error();
  if (!reference.flags) throw new Error();
  if (!isArray(node) && typeof node === 'object' && !hasOwn(node, 'tags')) throw new Error();

  if (reference.value) throw new Error();

  return freeze({ reference, binding, node });
};

export const buildPropertyWrapper = (tags, property) => {
  freeze(tags);
  freeze(property);

  if (![ReferenceTag, ShiftTag].includes(tags[0].type)) throw new Error();
  if (property.node && !(tags[1]?.type === InitializerTag || tags.length === 3)) throw new Error();

  return freeze({ tags, property });
};

export const buildDocument = (doctypeTag, fragment) => {
  return freeze({ type: Document, value: freeze({ doctypeTag, fragment }) });
};

export const buildFacadeProperty = (reference, binding, node) => {
  if (node?.binding) throw new Error();
  if (!reference.flags) throw new Error();
  if (!isArray(node) && typeof node === 'object' && !node.tags) throw new Error();

  if (reference.value) throw new Error();

  return freeze({ reference, binding, node });
};

export const buildBeginningOfStreamToken = () => {
  return freeze({ type: Symbol.for('@bablr/beginning-of-stream'), value: undefined });
};

export const buildReferenceTag = (
  type = null,
  name = null,
  isArray = false,
  flags = referenceFlags,
  index,
) => {
  if (type != null && !['.', '#', '@', '_'].includes(type)) throw new Error();
  if (name != null && !isString(name)) throw new Error();
  if (name == null && type == null) throw new Error();
  if (index) throw new Error();
  let { hasGap, expression } = flags;

  hasGap = !!hasGap;
  expression = !!expression;

  return freeze({
    type: ReferenceTag,
    value: freeze({ type, name, isArray, flags: freeze({ hasGap, expression }) }),
  });
};

export const buildReference = (
  type = null,
  name = null,
  isArray = false,
  flags = referenceFlags,
  index,
) => {
  return buildReferenceTag(type, name, isArray, flags, index).value;
};

export const buildNullTag = () => {
  return freeze({ type: NullTag, value: undefined });
};

export const buildInitializer = (isArray = false) => {
  return freeze({ isArray });
};

export const buildInitializerTag = (isArray = false) => {
  return freeze({ type: InitializerTag, value: buildInitializer(isArray) });
};

export const buildBinding = (languagePath = []) => {
  if (!isArray(languagePath)) throw new Error();
  return freeze({ languagePath });
};

export const buildBindingTag = (languagePath = []) => {
  if (!isArray(languagePath)) throw new Error();
  return freeze({ type: BindingTag, value: freeze({ languagePath }) });
};

export const buildChild = (type, value) => {
  if (!isSymbol(type)) throw new Error();
  return freeze({ type, value });
};

export const buildGapTag = () => {
  return freeze({ type: GapTag, value: undefined });
};

export const buildShiftTag = (index, height) => {
  if (!Number.isFinite(index)) throw new Error();
  if (!Number.isFinite(height)) throw new Error();
  return freeze({ type: ShiftTag, value: freeze({ index, height }) });
};

export const buildDoctypeTag = (version = 0) => {
  return freeze({
    type: DoctypeTag,
    value: freeze({ doctype: 'cstml', version }),
  });
};

export const buildOpenNodeTag = (
  flags = nodeFlags,
  type = null,
  attributes = {},
  literalValue = null,
  selfClosing = !!literalValue,
) => {
  if (printType(type).startsWith('https://')) throw new Error();
  if (literalValue && (!isString(literalValue) || !flags.token)) throw new Error();

  return freeze({
    type: OpenNodeTag,
    value: freeze({
      flags: freeze(flags),
      type: isString(type) ? Symbol.for(type) : type,
      literalValue,
      attributes,
      selfClosing,
    }),
  });
};

export const buildCloseNodeTag = () => {
  return freeze({ type: CloseNodeTag, value: undefined });
};

const isString = (val) => typeof val === 'string';

export const buildLiteralTag = (value) => {
  if (!isString(value)) throw new Error('invalid literal');
  return freeze({ type: LiteralTag, value });
};

export const buildAttributeDefinition = (path, value) => {
  if (!path?.length) throw new Error();
  freeze(path);
  return freeze({ type: AttributeDefinition, value: freeze({ path, value }) });
};

const flagsWithGap = new WeakMap();

export const getFlagsWithGap = (flags, hasGap = true) => {
  if (flags.hasGap === hasGap) return flags;

  let gapFlags = flagsWithGap.get(flags);
  if (!gapFlags) {
    gapFlags = { ...flags, hasGap };
    flagsWithGap.set(flags, gapFlags);
  }
  return gapFlags;
};

export const nodeFlags = freeze({
  token: false,
  hasGap: false,
  fragment: false,
  cover: false,
});

export const fragmentFlags = freeze({
  token: false,
  hasGap: false,
  fragment: true,
  cover: true,
});

export const multiFragmentFlags = freeze({
  token: false,
  hasGap: false,
  fragment: true,
  cover: false,
});

export const tokenFlags = freeze({
  token: true,
  hasGap: false,
  fragment: false,
  cover: false,
});

export const referenceFlags = freeze({
  expression: false,
  hasGap: false,
});

export const gapReferenceFlags = freeze({
  expression: false,
  hasGap: true,
});

export const expressionReferenceFlags = freeze({
  expression: true,
  hasGap: false,
});
