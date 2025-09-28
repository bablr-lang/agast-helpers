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

let buildGapProperty = () =>
  buildProperty(buildReference('.'), buildBinding(), buildStubNode(buildGapTag()));

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
    children: Tags.from([]),
    attributes: freeze({}),
  });
};

export const buildStubProperty = (tag) => {
  return buildProperty(buildReference('.'), buildBinding(), buildStubNode(tag));
};

const { freeze, hasOwn } = Object;
const { isArray } = Array;

export const buildProperty = (reference, binding = null, node = null, shift = null) => {
  if (node?.binding) throw new Error();
  if (!reference.flags) throw new Error();
  if (!isArray(node) && isObject(node) && !hasOwn(node, 'tags')) throw new Error();

  if (reference.value) throw new Error();

  return freeze({ reference, binding, node, shift });
};

export const buildPropertyWrapper = (tags, property) => {
  freeze(tags);
  freeze(property);

  if (![ReferenceTag, ShiftTag].includes(tags[0].type)) throw new Error();
  if (property.node && !(tags.length === 3)) throw new Error();
  if (tags[0].type === ShiftTag && !property.shift) throw new Error();

  return freeze({ tags, property });
};

export const buildPropertyWrapperTagFrom = (reference, binding, node, shiftTag = null) => {
  let property = buildProperty(reference, binding, node);

  let tags = [
    shiftTag || buildChild(ReferenceTag, reference),
    buildChild(BindingTag, binding),
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
  flags = referenceFlags,
  index,
) => {
  if (type != null && !['.', '#', '@'].includes(type)) throw new Error();
  if (name != null && (!isString(name) || !name)) throw new Error();
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

export const buildNodeTag = (node) => {
  if (node == null) throw new Error();
  return freeze({ type: Node, value: node });
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

export const buildShift = (index, height) => {
  if (index == null || height == null) throw new Error();
  return freeze({ index, height });
};

export const buildNullTag = () => {
  return freeze({ type: NullTag, value: undefined });
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
  if (index != null) throw new Error();
  if (height != null) throw new Error();
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
  attributes = {},
  literalValue = null,
  selfClosing = !!literalValue,
) => {
  if (!isObject(attributes)) throw new Error();
  if (literalValue && !isString(literalValue)) throw new Error();

  return freeze({
    type: OpenNodeTag,
    value: freeze({
      flags: freeze(flags),
      type: isString(type) ? Symbol.for(type) : type,
      literalValue,
      attributes: deepFreeze(attributes),
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
