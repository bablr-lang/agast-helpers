import {
  buildOpenNodeTag,
  buildChild,
  buildReference,
  parseTagType,
  parseNodeFlags,
} from './builders.js';
import {
  printCSTML as printCSTMLFromStream,
  printSource as printSourceFromStream,
  treeFromStream,
  evaluateReturn,
  printOpenNodeTag,
  streamFromString,
  streamFromTree,
} from './stream.js';
import { ReferenceTag, GapTag, LiteralTag, Property, EscapeTag, BinaryTag } from './symbols.js';
import * as Tags from './tags.js';
export * from './builders.js';
export * from './print.js';
import {
  get,
  getOr,
  has,
  list,
  isCover,
  isNullNode,
  isGapNode,
  getOpenTag,
  getCloseNodeTag,
  getRoot,
} from './path.js';
import { freeze, freezeRecord } from './object.js';

export {
  get,
  getOr,
  has,
  list,
  isCover,
  isNullNode,
  isGapNode,
  getOpenTag,
  getCloseNodeTag,
  getRoot,
  treeFromStream,
  evaluateReturn,
};

export const buildToken = (name, value, attributes = freezeRecord({})) => {
  return treeFromStream([
    printOpenNodeTag(buildOpenNodeTag(parseNodeFlags('*'), name, value, attributes, true)),
  ]);
};

let { getTags } = Tags;

export const mergeReferences = (outer, inner) => {
  let { type, name, index, flags: { array, expression, intrinsic, hasGap } = {} } = outer;

  if (
    (name != null && inner.name != null && name !== inner.name) ||
    (type != null && inner.type != null && type !== inner.type && inner.type !== '.')
  ) {
    return inner;
  }

  array = !!(array || inner.flags.array);
  expression = !!(expression || inner.flags.expression);
  intrinsic = !!(intrinsic || inner.flags.intrinsic);
  hasGap = !!(hasGap || inner.flags.hasGap);
  name = type === '.' ? inner.name : name;
  type = type === '.' ? inner.type : type;

  return buildReference(type, name, freeze({ array, expression, intrinsic, hasGap }), index);
};

export const mergeReferenceTags = (outer, inner) => {
  let value = mergeReferences(outer.value, inner.value);

  return buildChild(ReferenceTag, value);
};

export const documentFromStream = (tags, options) => {
  throw new Error('not implemented');

  // strip doctype tag off

  // return buildChild(Document, freeze({ doctype, tree }));
};

export const isEmpty = (node) => {
  if (node == null) return true;

  for (const tag of Tags.traverse(getTags(node))) {
    switch (parseTagType(tag)) {
      case Property: {
        const property = tag.value;

        if (!isNullNode(property.node)) {
          return false;
        }

        break;
      }

      case LiteralTag:
      case GapTag:
      case EscapeTag:
      case BinaryTag:
        return false;
    }
  }
  return true;
};

export const treeFromString = (input) => {
  return treeFromStream(streamFromString(input));
};

export const printCSTML = (tree) => {
  return printCSTMLFromStream(streamFromTree(tree));
};

export const printSource = (tree, options) => {
  return printSourceFromStream(streamFromTree(tree, options));
};

export const sourceTextFor = printSource;

export const notNull = (node) => {
  return node != null && !isNullNode(node);
};

export const isNull = (node) => {
  return node == null || isNullNode(node);
};
