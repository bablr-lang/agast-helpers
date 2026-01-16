import {
  buildReferenceTag,
  buildOpenNodeTag,
  buildLiteralTag,
  buildCloseNodeTag,
  tokenFlags,
  buildChild,
  buildGapTag,
  buildOpenFragmentTag,
} from './builders.js';
import {
  printPrettyCSTML as printPrettyCSTMLFromStream,
  printCSTML as printCSTMLFromStream,
  printSource as printSourceFromStream,
  treeFromStream,
  treeFromStreamSync,
  treeFromStreamAsync,
  evaluateReturnSync,
  evaluateReturnAsync,
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
  getCloseTag,
  getRoot,
  getTags,
} from './path.js';
import { freeze, isPlainObject } from './object.js';

export {
  get,
  getOr,
  has,
  list,
  isCover,
  isNullNode,
  isGapNode,
  getOpenTag,
  getCloseTag,
  getRoot,
  treeFromStream,
  treeFromStreamSync,
  treeFromStreamAsync,
  evaluateReturnSync,
  evaluateReturnAsync,
};

export const buildToken = (name, value, attributes = {}) => {
  return treeFromStreamSync([
    buildOpenNodeTag(tokenFlags, name, null, attributes),
    buildLiteralTag(value),
    buildCloseNodeTag(),
  ]);
};

const isString = (str) => typeof str === 'string';

const { isArray } = Array;

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

  return buildReferenceTag(type, name, freeze({ array, expression, intrinsic, hasGap }), index)
    .value;
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
    switch (tag.type) {
      case Property: {
        if (tag.value.property.reference.type === '@') {
          return false;
        } else {
          const { property } = tag.value;

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

export const streamFromTree = (tree, options = {}) => {
  if (tree && !isPlainObject(tree)) throw new Error();

  return __streamFromTree(null, tree, options);
};

function* __streamFromTree(doctypeTag, rootNode, options) {
  const { unshift = false } = options;
  if (!rootNode || !Tags.getSize(getTags(rootNode))) return;

  let tagPath = TagPath.fromNode(rootNode, 0);

  let count = 0;

  if (doctypeTag) {
    yield doctypeTag;
  }

  do {
    if (tagPath.tag.type === OpenNodeTag && !tagPath.tag.value.selfClosing) count++;
    if (tagPath.tag.type === CloseNodeTag) count--;

    if (
      !(
        tagPath.tag.type === AttributeDefinition ||
        (tagPath.tag.type === BindingTag && !tagPath.tag.value.segments?.length)
      )
    ) {
      yield tagPath.tag;
    }
  } while ((tagPath = unshift ? tagPath.nextUnshifted : tagPath.next));

  // if (count !== 0) throw new Error();
}

export const vcsStreamFromTree = (rootNode) => {
  return __vcsStreamFromTree(rootNode);
};

function* __vcsStreamFromTree(rootNode) {
  let stack = null;
  let agastNode = rootNode;
  let depth = 0;
  let nodeShifted = false;
  let i = 0;
  let seenFirstProperty = false;
  let node = Tags.getValues(rootNode.value.tags);

  outer: while (node) {
    while (i >= node.length) {
      if (stack) {
        let oldAgastNode = agastNode;
        let hadSeenFirst = seenFirstProperty;
        ({ stack, agastNode, node, depth, i, nodeShifted, seenFirstProperty } = stack);
        if (oldAgastNode === agastNode) {
          seenFirstProperty = hadSeenFirst;
          yield buildCloseNodeTag();
        }

        i++;
      } else {
        return;
      }
    }

    let child = node[i];

    if (isArray(child)) {
      stack = { stack, agastNode, node, depth, i, nodeShifted, seenFirstProperty };

      yield buildOpenFragmentTag();

      node = Tags.getValues(child);
      depth++;
      i = 0;
    } else {
      let wrappedTag = child;

      if (wrappedTag.type === Property) {
        for (let tag of wrappedTag.value.tags) {
          switch (tag.type) {
            case TreeNode:
            case NullNode:
            case GapNode: {
              let replaceWithGap = nodeShifted && !seenFirstProperty;

              if (replaceWithGap) {
                yield buildGapTag();

                seenFirstProperty = true;

                break;
              } else {
                stack = { stack, agastNode, node, depth, i, nodeShifted, seenFirstProperty: true };
                node = Tags.getValues(tag.value.tags);

                depth++;
                i = 0;
                agastNode = tag.value;
                nodeShifted = wrappedTag.value.tags[0].type === ShiftTag;
                seenFirstProperty = false;
                continue outer;
              }
            }

            default: {
              yield tag;

              if (tag.type === OpenNodeTag && tag.value.literalValue) {
                ({ stack, agastNode, node, depth, i, nodeShifted } = stack);
                seenFirstProperty = true;
              }

              break;
            }
          }
        }
      } else {
        yield wrappedTag;

        if (wrappedTag.type === OpenNodeTag && wrappedTag.value.literalValue) {
          ({ stack, agastNode, node, depth, i, nodeShifted } = stack);
          seenFirstProperty = true;
        }
      }
      i++;
    }
  }
}

export const getCooked = (cookable) => {
  if (!cookable || isGapNode(cookable)) {
    return '';
  }

  const tags = getTags(cookable) || cookable;

  let cooked = '';

  // const openTag = getOpenTag(cookable);
  // const closeTag = getCloseTag(cookable);

  let referenceTag = null;

  for (let tag of Tags.traverse(tags)) {
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

export const printCSTML = (tree) => {
  return printCSTMLFromStream(streamFromTree(tree));
};

export const printPrettyCSTML = (tree, options = {}) => {
  return printPrettyCSTMLFromStream(streamFromTree(tree), options);
};

export const printSource = (tree) => {
  return printSourceFromStream(streamFromTree(tree, { unshift: true }));
};

export const sourceTextFor = printSource;

export const notNull = (node) => {
  return node != null && !isNullNode(node);
};

export const isNull = (node) => {
  return node == null || isNullNode(node);
};
