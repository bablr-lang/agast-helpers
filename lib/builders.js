import {
  hasOwn,
  isArray,
  isSymbol,
  isString,
  freezeRecord,
  isObject,
  isDeepRecord,
  isRecord,
  arrayValues,
} from './object.js';

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
  MuxerTag,
  HashTag,
  BinaryTag,
  EscapeTag,
  SumsTag,
  EmptyTag,
} from './symbols.js';

export const symbolName = (name) => {
  return isString(name) ? Symbol.for(name) : name;
};

export const buildTag = (type, value = undefined) => {
  return freezeRecord({ type, value });
};

export const buildChild = (type, value) => {
  if (!isSymbol(type)) throw new Error();
  if (value && !isObject(value)) throw new Error();

  return buildTag(type, value);
};

export const emptyTag = buildTag(EmptyTag);

export const buildEmptyTag = () => {
  return emptyTag;
};

export const buildSpan = (name, guard = null, props = '{}') => {
  if (!name) throw new Error();
  if (!isString(props)) throw new Error();

  return freezeRecord({ name, guard, props });
};

export const buildSpanEntry = (name, guard = null, props = '{}') => {
  return freezeRecord([name, buildSpan(name, guard, props)]);
};

export const buildPathFrame = (property, parentIndex = null, isGap = false) => {
  return freezeRecord({ property, parentIndex, isGap });
};

export const buildDocument = (doctypeTag, tree) => {
  return buildTag(Document, freezeRecord({ doctypeTag, tree }));
};

export const buildBeginningOfStreamToken = () => {
  return buildTag(Symbol.for('@bablr/beginning-of-stream'));
};

export const defaultReferenceFlags = freezeRecord({
  array: false,
  expression: false,
  intrinsic: false,
  hasGap: false,
});

export const buildReferenceTag = (type = null, name = null, flags = defaultReferenceFlags) => {
  return buildTag(ReferenceTag, buildReference(type, name, flags));
};

export const buildReference = (type = null, name = null, flags = defaultReferenceFlags) => {
  if (!Object.isFrozen(flags)) throw new Error();
  let { array, expression, intrinsic, hasGap } = flags;

  if (type != null && !['_', '__', '.', '#'].includes(type)) throw new Error();
  if (type && ['_', '#'].includes(type) && (intrinsic || hasGap)) throw new Error();

  if (name != null && (!isString(name) || !name)) throw new Error();

  if (hasGap && intrinsic) throw new Error();
  if (array && ['_', '#'].includes(type)) throw new Error();

  array = !!array;
  expression = !!expression;
  intrinsic = !!intrinsic;
  hasGap = !!hasGap;

  let type_ = type == null && name == null ? '.' : type;

  return freezeRecord({
    type: type_,
    name,
    flags: freezeRecord({ array, expression, intrinsic, hasGap }),
  });
};

export const referenceFromMatcher = (matcher) => {
  if (!matcher) return buildReference();
  let { type, name, flags } = matcher;

  return buildReference(type, name, flags);
};

export const buildHashTag = (hash) => {
  if (!isString(hash)) throw new Error();

  return buildTag(HashTag, freezeRecord({ hash }));
};

export const buildSumsTag = (sums) => {
  if (!Number.isFinite(sums[0])) throw new Error();
  if (!(Number.isFinite(sums[1]) || (isArray(sums[1]) && isRecord(sums[1])))) throw new Error();
  if (!Number.isFinite(sums[2])) throw new Error();
  if (!Number.isFinite(sums[3])) throw new Error();
  if (!Number.isFinite(sums[4])) throw new Error();

  return buildTag(SumsTag, freezeRecord(sums));
};

export const buildBounds = (leading, trailing) => {
  return freezeRecord({ leading, trailing });
};

export const buildShift = (index, height) => {
  if (index == null || height == null) throw new Error();

  return freezeRecord({ index, height });
};

export const nullTag = buildTag(NullTag);

export const buildNullTag = () => {
  return nullTag;
};

export const buildBinding = (type, name) => {
  if (type && (!isSymbol(type) || !['..', '_'].includes(type.desription))) throw new Error();
  if (name && !isSymbol(name)) throw new Error();
  if (type && name) throw new Error();

  return freezeRecord({ type, name });
};

export const buildBindingTag = (type, name) => {
  return buildTag(BindingTag, buildBinding(type, name));
};

export const buildMuxerTag = (processPath, stream) => {
  if (stream && !(stream >= 1 && stream <= 4)) throw new Error();

  return buildTag(MuxerTag, freezeRecord({ processPath, stream }));
};

export const buildGapTag = (hash = null) => {
  return buildTag(GapTag, freezeRecord({ hash }));
};

export const buildShiftTag = () => {
  return buildTag(ShiftTag);
};

export const buildBinaryTag = (value) => {
  if (!isString(value) || !value) throw new Error();
  return buildTag(BinaryTag, value);
};

export const buildEscapeTag = (value, cookedValue) => {
  if (!isString(value) || !value) throw new Error();
  return buildTag(EscapeTag, freezeRecord({ value, cookedValue }));
};

export const buildDoctype = (version = 0, attributes = freezeRecord({})) => {
  if (!isDeepRecord(attributes)) throw new Error();

  return freezeRecord({ doctype: 'cstml', version, attributes });
};

export const buildDoctypeTag = (version = 0, attributes = freezeRecord({})) => {
  if (!isDeepRecord(attributes)) throw new Error();
  return buildTag(DoctypeTag, buildDoctype(version, attributes));
};

export const defaultNodeFlags = freezeRecord({ array: false, object: false, token: false });

export const buildOpenFragmentTag = (flags = defaultNodeFlags, selfClosing = false) => {
  return buildFullOpenNodeTag(flags, Symbol.for('__'), null, null, {}, selfClosing);
};

export const buildOpenCoverTag = (flags = defaultNodeFlags, name = null, selfClosing = false) => {
  return buildFullOpenNodeTag(flags, Symbol.for('_'), name, null, {}, selfClosing);
};

export const buildOpenNodeTag = (
  flags,
  name,
  literalValue = null,
  attributes = freezeRecord({}),
  selfClosing = !!literalValue,
) => {
  return buildFullOpenNodeTag(flags, null, name, literalValue, attributes, selfClosing);
};

export const buildOpenNode = (
  flags = defaultNodeFlags,
  type = Symbol.for('__'),
  name = null,
  literalValue = null,
  attributes = freezeRecord({}),
  selfClosing = !!literalValue,
) => {
  if (!isDeepRecord(attributes)) throw new Error();
  if (literalValue && ![LiteralTag, EscapeTag, BinaryTag].includes(literalValue.type)) {
    throw new Error();
  }
  if (!type && !name && !flags.token && literalValue != null) throw new Error();
  if (literalValue != null && !selfClosing) throw new Error();

  if (isString(literalValue)) throw new Error();

  return freezeRecord({
    flags,
    name: symbolName(name),
    type: symbolName(type),
    literalValue,
    attributes,
    selfClosing,
  });
};

export const buildFullOpenNodeTag = (
  flags = defaultNodeFlags,
  type = Symbol.for('__'),
  name = null,
  literalValue = null,
  attributes = freezeRecord({}),
  selfClosing = !!literalValue,
) => {
  if (flags.object && flags.array) throw new Error();
  if ((flags.token || type === Symbol.for('_')) && (flags.object || flags.array)) throw new Error();
  if (!hasOwn(flags, 'token')) throw new Error();
  return buildTag(
    OpenNodeTag,
    buildOpenNode(flags, type, name, literalValue, attributes, selfClosing),
  );
};

export const buildCloseNodeTag = () => {
  return buildTag(CloseNodeTag);
};

export const buildLiteralTag = (value) => {
  if (!isString(value) || !value) throw new Error('invalid literal');
  return buildTag(LiteralTag, value);
};

export const buildAttributeDefinition = (key, value) => {
  if (!key?.length) throw new Error();

  return freezeRecord({ path: key, value });
};

export const buildAttributeDefinitionTag = (key, value) => {
  return buildTag(AttributeDefinition, buildAttributeDefinition(key, value));
};
