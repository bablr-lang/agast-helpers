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

const { freeze } = Object;
const { isArray } = Array;

export const deepFreeze = (object) => {
  let list = emptyStack.push(object);
  while (list.size) {
    let item = list.value;
    list = list.pop();

    for (const value of Object.values(item)) {
      if (isObject(value)) {
        list = list.push(value);
      }
    }

    Object.freeze(item);
  }
};

export const buildProperty = (tags, shift) => {
  if (shift && !shift.index) throw new Error('deprecated');
  freeze(tags);

  if (!tags.length || ![ReferenceTag, ShiftTag].includes(tags[0].type)) throw new Error();
  if (tags.length > 1 && !isArray(tags[1])) throw new Error();

  if (![ReferenceTag, ShiftTag].includes(tags[0].type)) throw new Error();
  // if (property.node && !(tags.length === 3)) throw new Error();
  // if (tags[0].type === ShiftTag && !property.shift) throw new Error();

  if ((tags[0].type == ShiftTag) !== !!shift) throw new Error();
  if (tags[2] && ![NullNode, GapNode, TreeNode].includes(tags[2].type)) throw new Error();

  return freeze({
    tags,
    reference: tags[0].type == ReferenceTag ? tags[0].value : null,
    bindings: freeze(tags[1]?.map((tag) => tag.value) || []),
    node: tags[2] || null,
    shift: tags[0].type == ShiftTag ? shift : null,
    // get property() {
    //   throw new Error('deprecated');
    // },
  });
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

export const buildReferenceTag = (
  type = null,
  name = null,
  isArray = false,
  flags = referenceFlags,
) => {
  return freeze({
    type: ReferenceTag,
    value: buildReference(type, name, isArray, flags),
  });
};

export const buildReference = (
  type = null,
  name = null,
  isArray = false,
  flags = referenceFlags,
) => {
  if (type != null && !['_', '.', '#', '@'].includes(type)) throw new Error();
  if (type && ['_', '#', '@'].includes(type) && (flags.intrinsic || flags.hasGap))
    throw new Error();
  if (name != null && (!isString(name) || !name)) throw new Error();
  let { expression, intrinsic, hasGap } = flags;

  expression = !!expression;
  intrinsic = !!intrinsic;
  hasGap = !!hasGap;

  let type_ = type == null && name == null ? '.' : type;

  return freeze({ type: type_, name, isArray, flags: freeze({ expression, intrinsic, hasGap }) });
};

export const referenceFromMatcher = (matcher) => {
  let { type, name, isArray, flags } = matcher;
  return buildReference(type, name, isArray, flags);
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

export const buildDoctypeTag = (version = 0, attributes = Object.freeze({})) => {
  return freeze({
    type: DoctypeTag,
    value: freeze({ doctype: 'cstml', version, attributes }),
  });
};

export const buildOpenNodeTag = (
  flags = nodeFlags,
  name = null,
  literalValue = null,
  attributes = {},
  selfClosing = !!literalValue,
) => {
  if (!isObject(attributes)) throw new Error();
  if (literalValue && !isString(literalValue)) throw new Error();

  deepFreeze(attributes);

  return freeze({
    type: OpenNodeTag,
    value: freeze({
      flags: freeze(flags),
      name: isString(name) ? Symbol.for(name) : name,
      get type() {
        throw new Error('deprecated');
      },
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

export const coverFlags = freeze({
  token: false,
  hasGap: false,
  fragment: true,
  cover: true,
});

export const fragmentFlags = freeze({
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

export const tokenFragmentFlags = freeze({
  token: true,
  hasGap: false,
  fragment: true,
  cover: true,
});

export const referenceFlags = freeze({
  expression: false,
  intrinsic: false,
  hasGap: false,
});

export const intrinsicReferenceFlags = freeze({
  expression: false,
  intrinsic: true,
  hasGap: false,
});

export const gapReferenceFlags = freeze({
  expression: false,
  intrinsic: false,
  hasGap: true,
});

export const expressionReferenceFlags = freeze({
  expression: true,
  intrinsic: false,
  hasGap: false,
});
