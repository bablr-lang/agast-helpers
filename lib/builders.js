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
  let { type, name, flags } = matcher;
  return buildReference(type, name, flags);
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
  if (!type && !name && !flags.token && !literalValue) throw new Error();

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
      get cover() {
        throw new Error('deprecated');
      },
      get fragment() {
        throw new Error('deprecated');
      },
    });
    flagsWithGap.set(flags, gapFlags);
  }
  return gapFlags;
};

export const nodeFlags = freeze({
  token: false,
  hasGap: false,
  get fragment() {
    throw new Error('deprecated');
  },
  get cover() {
    throw new Error('deprecated');
  },
});

export const tokenFlags = freeze({
  token: true,
  hasGap: false,
  get fragment() {
    throw new Error('deprecated');
  },
  get cover() {
    throw new Error('deprecated');
  },
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
