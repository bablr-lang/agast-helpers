import emptyStack from '@iter-tools/imm-stack';
import { isObject, isSymbol } from './object.js';
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

const { freeze, deepFreeze } = Object;
const { isArray } = Array;

export const buildSpan = (name, guard = null, props = {}) => {
  if (!name) throw new Error();
  deepFreeze(props);
  return freeze({ name, guard, props });
};

export const buildProperty = (tags, shift) => {
  if (shift && !shift.index) throw new Error();
  freeze(tags);

  if (tags[0] && ![ReferenceTag, ShiftTag].includes(tags[0].type)) throw new Error();
  if (tags.length > 1 && !isArray(tags[1])) throw new Error();

  freeze(tags[1]);

  // if (property.node && !(tags.length === 3)) throw new Error();
  // if (tags[0].type === ShiftTag && !property.shift) throw new Error();

  if ((tags[0]?.type == ShiftTag) !== !!shift) throw new Error();
  if (tags[2] && ![NullNode, GapNode, TreeNode].includes(tags[2].type)) throw new Error();

  return freeze({
    tags,
    reference: tags[0]?.type === ShiftTag ? null : tags[0]?.value || buildReference(),
    bindings: freeze(tags[1]?.map((tag) => tag.value) || []),
    node: tags[2] || null,
    shift: tags[0]?.type == ShiftTag ? shift : null,
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
  if (!Object.isFrozen(flags)) throw new Error();

  return freeze({
    type: ReferenceTag,
    value: buildReference(type, name, flags),
  });
};

export const buildReference = (type = null, name = null, flags = referenceFlags) => {
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
    segments: segments.map((segment) =>
      freeze(isString(segment) ? { type: null, name: segment } : segment),
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
  return freeze({ type, value });
};

export const buildGapTag = () => {
  return freeze({ type: GapTag, value: undefined });
};

export const buildShiftTag = () => {
  let value = Object.defineProperties(
    {},
    {
      index: {
        get() {
          throw new Error('moved');
        },
      },
      height: {
        get() {
          throw new Error('moved');
        },
      },
    },
  );
  return freeze({ type: ShiftTag, value });
};

export const buildDoctypeTag = (version = 0, attributes = freeze({})) => {
  return freeze({
    type: DoctypeTag,
    value: freeze({ doctype: 'cstml', version, attributes }),
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
  attributes = {},
  selfClosing = !!literalValue,
) => {
  if (!name && !flags.token) throw new Error();
  return buildFullOpenNodeTag(flags, null, name, literalValue, attributes, selfClosing);
};

export const buildFullOpenNodeTag = (
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

  deepFreeze(attributes);

  return freeze({
    type: OpenNodeTag,
    value: freeze({
      flags: freeze(flags),
      name: isString(name) ? Symbol.for(name) : name,
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

export const buildAttributeDefinition = (key, value) => {
  if (!key?.length) throw new Error();
  freeze(key);
  return freeze({ type: AttributeDefinition, value: freeze({ path: key, value }) });
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
