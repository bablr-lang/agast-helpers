import emptyStack from '@iter-tools/imm-stack';
import { isObject, isSymbol } from './object.js';
import * as BTree from './btree.js';
import * as Tags from './tags.js';
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
  PropertyWrapper,
  Node,
} from './symbols.js';

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

let buildGapProperty = () => buildProperty(buildReference(), [], buildStubNode(buildGapTag()));

export const buildBounds = (
  openBoundary = BTree.fromValues([buildGapProperty()]),
  closeBoundary = openBoundary,
) => {
  return freeze([openBoundary, closeBoundary]);
};

const isStubTag = (tag) => {
  return [GapTag, NullTag].includes(tag.type);
};

export const buildStubNode = (tag) => {
  if (!isStubTag(tag)) throw new Error();
  return freeze({
    flags: nodeFlags,
    type: null,
    bounds: buildBounds(null, null),
    tags: Tags.from(tag),
    children: Tags.from(),
    attributes: freeze({}),
  });
};

export const buildStubProperty = (tag) => {
  return buildProperty(buildReference(), [], buildStubNode(tag));
};

const { freeze, hasOwn } = Object;
const { isArray } = Array;

export const buildProperty = (reference, bindings = [], node = null, shift = null) => {
  if (node?.bindings) throw new Error();
  if (!isArray(bindings)) throw new Error();
  if (!reference.flags) throw new Error();
  if (!isArray(node) && isObject(node) && !hasOwn(node, 'tags')) throw new Error();

  if (reference.value) throw new Error();

  freeze(bindings);

  return freeze({ reference, bindings, node, shift });
};

export const buildFacadeProperty = (reference, bindings = [], node = null, shift = null) => {
  if (node?.bindings) throw new Error();
  if (!isArray(bindings)) throw new Error();
  if (!reference.flags) throw new Error();

  if (reference.value) throw new Error();

  freeze(bindings);

  return freeze({ reference, bindings, node, shift });
};

export const buildPropertyWrapper = (tags, property) => {
  freeze(tags);
  freeze(property);

  if (tags.length > 1 && !isArray(tags[1])) throw new Error();

  if (![ReferenceTag, ShiftTag].includes(tags[0].type)) throw new Error();
  if (property.node && !(tags.length === 3)) throw new Error();
  if (tags[0].type === ShiftTag && !property.shift) throw new Error();

  return freeze({ tags, property });
};

export const buildPropertyWrapperTagFrom = (reference, bindings, node, shiftTag = null) => {
  let property = buildProperty(reference, bindings, node);

  let tags = [
    shiftTag || buildChild(ReferenceTag, reference),
    bindings.map((binding) => buildChild(BindingTag, binding)),
    buildChild(Property, property),
  ];
  return buildChild(PropertyWrapper, buildPropertyWrapper(tags, property));
};

export const buildDocument = (doctypeTag, fragment) => {
  return freeze({ type: Document, value: freeze({ doctypeTag, fragment }) });
};

export const buildBeginningOfStreamToken = () => {
  return freeze({ type: Symbol.for('@bablr/beginning-of-stream'), value: undefined });
};

export const buildReferenceTag = (
  type = null,
  name = null,
  isArray = false,
  flags = gapReferenceFlags,
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
  flags = gapReferenceFlags,
) => {
  if (type != null && !['_', '.', '#', '@'].includes(type)) throw new Error();
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

export const buildNodeTag = (node) => {
  if (node == null) throw new Error();
  return freeze({ type: Node, value: node });
};

export const buildShift = (index, height) => {
  if (index == null || height == null) throw new Error();
  return freeze({ index, height });
};

export const buildNullTag = () => {
  return freeze({ type: NullTag, value: undefined });
};

export const buildBinding = (segments = []) => {
  if (!isArray(segments) || !segments.length) throw new Error();
  if (segments.includes(undefined)) throw new Error();
  return freeze({ segments });
};

export const buildBindingTag = (segments = []) => {
  // TODO relax this restriction
  if (!isArray(segments) || !segments.length) throw new Error();

  return freeze({
    type: BindingTag,
    value: freeze({
      segments: segments.map((segment) =>
        freeze(isString(segment) ? { type: null, name: segment } : segment),
      ),
    }),
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
  type = null,
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
