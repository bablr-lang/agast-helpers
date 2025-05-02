import * as btree from './btree.js';
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
  TokenGroup,
  EmbeddedNode,
  AttributeDefinition,
} from './symbols.js';

const { freeze } = Object;
const { isArray } = Array;

const isObject = (val) => val !== null && typeof val === 'object';

function* relatedNodes(properties) {
  for (const value of Object.values(properties)) {
    if (isArray(value)) {
      for (let value of btree.traverse(value)) {
        yield value.node;
      }
    } else {
      yield value.node;
    }
  }
}

const find = (predicate, iterable) => {
  for (const value of iterable) {
    if (predicate(value)) return value;
  }
};

export const buildTokenGroup = (tokens) => {
  return freeze({ type: TokenGroup, value: tokens });
};

export const buildEmbeddedNode = (node) => {
  if (!isObject(node)) throw new Error();
  return freeze({ type: EmbeddedNode, value: node });
};

export const buildBeginningOfStreamToken = () => {
  return freeze({ type: Symbol.for('@bablr/beginning-of-stream'), value: undefined });
};

export const buildReferenceTag = (
  type = null,
  name = null,
  isArray = false,
  flags = referenceFlags,
  index = null,
) => {
  if (type != null && !isString(type)) throw new Error();
  if (name != null && !isString(name)) throw new Error();
  if (index != null && !Number.isFinite(index)) throw new Error();

  let { hasGap, expression } = flags;

  hasGap = !!hasGap;
  expression = !!expression;

  return freeze({
    type: ReferenceTag,
    value: freeze({ type, name, isArray, index, flags: freeze({ hasGap, expression }) }),
  });
};

export const buildNullTag = () => {
  return freeze({ type: NullTag, value: undefined });
};

export const buildInitializerTag = (isArray = false) => {
  return freeze({ type: InitializerTag, value: freeze({ isArray }) });
};

export const buildGapTag = () => {
  return freeze({ type: GapTag, value: undefined });
};

export const buildShiftTag = (index) => {
  if (!Number.isFinite(index)) throw new Error();
  return freeze({ type: ShiftTag, value: freeze({ index }) });
};

export const buildDoctypeTag = (attributes = {}) => {
  return freeze({
    type: DoctypeTag,
    value: freeze({ doctype: 'cstml', version: 0, attributes: freeze(attributes) }),
  });
};

export const buildOpenNodeTag = (
  flags = nodeFlags,
  language = null,
  type = null,
  attributes = {},
) => {
  if (printType(type).startsWith('https://')) throw new Error();

  return freeze({
    type: OpenNodeTag,
    value: freeze({
      flags: freeze(flags),
      language,
      type: isString(type) ? Symbol.for(type) : type,
      attributes,
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
  cover: false,
});

const hasGap = (properties) => {
  return find((node) => node.flags.hasGap, relatedNodes(properties));
};

const getFlags = (flags, properties) => {
  if (!hasGap(properties)) {
    return flags;
  } else {
    return getFlagsWithGap(flags);
  }
};

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
