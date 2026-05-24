import {
  buildOpenNodeTag,
  buildCloseNodeTag,
  tokenFlags,
  buildChild,
  buildGapTag,
  buildOpenFragmentTag,
  buildReference,
  parseTagType,
  parseTag,
} from './builders.js';
import {
  printPrettyCSTML as printPrettyCSTMLFromStream,
  printCSTML as printCSTMLFromStream,
  printSource as printSourceFromStream,
  treeFromStream,
  evaluateReturn,
  printOpenNodeTag,
  streamFromString,
} from './stream.js';
import {
  OpenNodeTag,
  CloseNodeTag,
  ReferenceTag,
  GapTag,
  LiteralTag,
  AttributeDefinition,
  BindingTag,
  ShiftTag,
  Property,
  NullNode,
  TreeNode,
  GapNode,
} from './symbols.js';
import * as Tags from './tags.js';
export * from './builders.js';
export * from './print.js';
import {
  get,
  getOr,
  has,
  list,
  TagPath,
  isCover,
  isNullNode,
  isGapNode,
  getOpenTag,
  getCloseNodeTag,
  getRoot,
} from './path.js';
import { freeze, freezeRecord, isPlainObject } from './object.js';

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
    printOpenNodeTag(buildOpenNodeTag(tokenFlags, name, value, attributes, true)),
  ]);
};

let isString = (str) => typeof str === 'string';

let { isArray } = Array;
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
        if (tag.value.reference.type === '@') {
          return false;
        } else {
          const property = tag.value;

          if (!isNullNode(property.node)) {
            return false;
          }
        }
        break;
      }

      case LiteralTag:
      case GapTag:
        return false;
    }
  }
  return true;
};

export const streamFromTree = (tree, options = freeze({})) => {
  if (tree && !isPlainObject(tree)) throw new Error();

  return __streamFromTree(null, tree, options);
};

function* __streamFromTree(doctypeTag, rootNode, options) {
  const { unshift = false, getGapNode, checkBalance = true } = options;
  if (!rootNode || !Tags.getSize(getTags(rootNode))) return;

  let tagPath = TagPath.fromNode(rootNode, 0);
  let count = 0;
  let stack = [{ tagPath, count }];

  if (doctypeTag) {
    yield doctypeTag;
  }

  do {
    ({ tagPath, count } = stack.pop());
    do {
      if (tagPath.type === OpenNodeTag && !tagPath.value.selfClosing) count++;
      if (tagPath.type === CloseNodeTag) count--;

      let gapNode;
      if (
        getGapNode &&
        tagPath.type === GapTag &&
        (gapNode = getGapNode(tagPath.path.node)) &&
        gapNode !== tagPath.path.node
      ) {
        stack.push({ tagPath: unshift ? tagPath.nextUnshifted : tagPath.next, count });
        tagPath = TagPath.fromNode(gapNode, 0);
        count = 0;
      }

      if (!(tagPath.type === AttributeDefinition)) {
        yield tagPath.tag;
      }
    } while ((tagPath = unshift ? tagPath.nextUnshifted : tagPath.next));
  } while (stack.length);

  if (checkBalance && count !== 0) throw new Error();
}

export const getCooked = (cookable) => {
  if (!cookable || isGapNode(cookable)) {
    return '';
  }

  const tags = getTags(cookable) || cookable;

  let cooked = '';

  // const openTag = getOpenTag(cookable);
  // const closeTag = getCloseNodeTag(cookable);

  let referenceTag = null;

  for (let tag_ of Tags.traverse(tags)) {
    let tag = parseTag(tag_);
    switch (tag.type) {
      case ReferenceTag: {
        let { type } = tag.value;

        if (!(type === '#' || type === '@')) {
          throw new Error('cookable nodes must not contain other nodes');
        }

        referenceTag = tag;
        break;
      }

      case BindingTag:
        break;

      case Property: {
        let { node, reference } = tag.value;
        let { attributes } = node.value;

        if (reference.type === '@') {
          let { cooked: cookedValue } = attributes;

          if (!isString(cookedValue))
            throw new Error('cannot cook string: it contains uncooked escapes');

          cooked += cookedValue;
        }

        break;
      }

      case GapTag: {
        return null;
      }

      case LiteralTag: {
        cooked += tag.value;
        break;
      }

      case OpenNodeTag: {
        if (tag.value.literalValue) {
          cooked += tag.value.literalValue;
        }
        break;
      }

      case CloseNodeTag: {
        break;
      }

      default: {
        throw new Error();
      }
    }
  }

  return cooked;
};

export const treeFromString = (input) => {
  return treeFromStream(streamFromString(input));
};

export const printCSTML = (tree) => {
  return printCSTMLFromStream(streamFromTree(tree));
};

export const printPrettyCSTML = (tree, options = freeze({})) => {
  return printPrettyCSTMLFromStream(streamFromTree(tree), options);
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
