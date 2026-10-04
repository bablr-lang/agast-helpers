import * as BList from './b-list.js';
import * as Tags from './tags.js';
import {
  ReferenceTag,
  CloseNodeTag,
  GapTag,
  NullTag,
  ShiftTag,
  BindingTag,
  Property,
  OpenNodeTag,
  AttributeDefinitionTag,
  LiteralTag,
  TreeNode,
  NullNode,
  GapNode,
  EscapeTag,
  HashTag,
  EmptyTag,
  SumsTag,
} from './symbols.js';
import {
  immSet,
  isString,
  has as objHas,
  get as objGet,
  isObject,
  isArray,
  isSymbol,
  recordValues,
  freezeClass,
  arrayMap,
} from './object.js';
import { buildPathFrame, buildBounds } from './builders.js';
import {
  buildNullTag,
  buildOpenNodeTag,
  buildShift,
  buildLiteralTag,
  buildReferenceTag,
  buildReference,
  printNodeFlags,
  printQuotedIdentifier,
  printReference,
  printSums,
  printTag,
  parseOpenNodeTag,
  parseTag,
  parseTagType,
  parseNodeFlags,
  startsNode,
  assertValidNode,
  isValidNode,
  endsNode,
  printBinding,
} from 'agast';

import { arrayValues, map } from './iterable.js';
import { freezeRecord, isRecord } from '@bablr/record';
import { inRange } from './parse.js';
import { isValidProperty } from '../../agast/lib/_valid.js';

let { hasOwn, freeze } = Object;

let arrayLast = (arr) => arr[arr.length - 1];

let porcelain = { porcelain: true };

export const incrementShift = (shift) => {
  if (!shift) return buildShift(1);

  return buildShift(shift.index + 1);
};

export const stringName = (name) => {
  switch (typeof name) {
    case 'symbol':
      return name.description;
    case 'string':
      return name;
    case 'null':
    case 'undefined':
      return null;
    default:
      throw new Error();
  }
};

export const flagsForSigilTag = (tag) => {
  let tag_ = isString(tag) ? parseTag(tag) : tag;
  return tag_.type === OpenNodeTag
    ? (tag_.value.flags.object ? '{' : '') + (tag_.value.flags.array ? '[' : '')
    : '';
};

export const getTreeNodeType = (node) => {
  let sigilTag = node[0];
  if (!sigilTag) return null;
  let parsed = parseTag(sigilTag);

  return parsed.type === OpenNodeTag ? parsed.value.type : null;
};

export const getTreeNodeName = (node) => {
  let sigilTag = node[0];
  if (!sigilTag) return null;
  let parsed = parseTag(sigilTag);

  return parsed.type === OpenNodeTag ? parsed.value.name : null;
};

let gapFrame = buildPathFrame(
  Tags.fromValues(['', '', '', '', Tags.fromValues(['<//>'])]),
  null,
  true,
);

// export const buildBoundsFromTags = (tags) => {
//   let leading = BList.fromValues([gapFrame]);
//   let trailing = leading;
//   let firstProperty, lastProperty;
//   let firstPropertyIndex, lastPropertyIndex;
//   let children = tags[1][1];
//   let lastTag = Tags.getAt(-1, tags);

//   if (!lastTag || parseTagType(lastTag) !== CloseNodeTag || !children) {
//     return buildBounds(leading, trailing);
//   }

//   for (let i = 0; i < Tags.getSize(children); i++) {
//     let tag = Tags.getAt(i, children);

//     if (parseTagType(tag) === Property && !isNullNode(tag.value.node)) {
//       firstProperty = tag;
//       firstPropertyIndex = i;
//       break;
//     }
//   }

//   for (let i = Tags.getSize(children) - 1; i >= 0; i--) {
//     let tag = Tags.getAt(i, children);

//     if (parseTagType(tag) === Property && !isNullNode(tag.value.node)) {
//       lastProperty = tag;
//       lastPropertyIndex = i;
//       break;
//     }
//   }

//   if (firstProperty && firstProperty.value.node.type === TreeNode) {
//     leading = firstProperty.value.node.value.bounds.leading;

//     let rootFrame = BList.getAt(1, leading);

//     leading = BList.replaceAt(0, buildPathFrame(firstProperty), leading);
//     if (rootFrame) {
//       leading = BList.replaceAt(1, buildPathFrame(rootFrame.property, firstPropertyIndex), leading);
//     }
//     leading = BList.unshift(gapFrame, leading);
//   }

//   if (lastProperty && lastProperty.value.node.type === TreeNode) {
//     if (!lastProperty.value.node) throw new Error();

//     trailing = lastProperty.value.node.value.bounds.trailing;

//     let rootFrame = BList.getAt(1, trailing);

//     trailing = BList.replaceAt(0, buildPathFrame(lastProperty), trailing);
//     if (rootFrame) {
//       trailing = BList.replaceAt(
//         1,
//         buildPathFrame(rootFrame.property, lastPropertyIndex),
//         trailing,
//       );
//     }
//     trailing = BList.unshift(gapFrame, trailing);
//   }

//   return buildBounds(leading, trailing);
// };

export const isNode = (value) => {
  return Tags.isNode(value);
};

export const propertyIsFull = (property) => {
  if (isString(property)) return true;
  if (!isValidProperty(property)) throw new Error();

  return property.length >= 5;
};

export const nodeIsComplete = (node) => {
  let openTag = getOpenTag(node);
  if (!openTag) return false;
  let sigilTag = parseTag(openTag);
  return sigilTag.type !== OpenNodeTag || sigilTag.value.selfClosing ? true : !!getCloseTag(node);
};

export const isNodeTag = (tag) => {
  if (isString(tag)) return false;
  switch (tag.type) {
    case TreeNode:
    case NullNode:
    case GapNode:
      return true;
    default:
      return false;
  }
};

export const arraysEqual = (a, b) => {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }

  return true;
};

export const buildPathSegment = (name, index = null, shiftIndex = null) => {
  if (!name) throw new Error();
  return { type: null, name, index, shiftIndex };
};

export const buildTypePathSegment = (type, index = null, shiftIndex = null) => {
  if (!type) throw new Error();
  return { type, name: null, index, shiftIndex };
};

export const buildFullPathSegment = (type, name, index = null, shiftIndex = null) => {
  return { type, name, index, shiftIndex };
};

export const getRootProperty = (node) => {
  if (node == null || !isCover(node)) {
    return null;
  }
  let idx = Tags.getIndex(buildFullPathSegment('_', null), node);

  if (idx == null) return null;

  let tag = Tags.getAt(idx, node);

  if (isString(tag) || parseTagType(tag) !== Property) throw new Error();
  return tag;
};

// TODO prevent infinite recursion
export const getRoot = (node, depth = Infinity) => {
  let node_ = node;
  let i = 0;

  while (isCover(node_) && i < depth) {
    node_ = getRootProperty(node_)?.[4];
    i++;
  }

  return node_;
};

export const getSigilTag = (node) => {
  return node[0];
};

export const getOpenTag = (node) => {
  let tag = node[0];
  return parseTagType(tag) === OpenNodeTag ? tag : null;
};

export const getCloseTag = (node) => {
  let tag = node[node.length - 1];
  return parseTagType(tag) === CloseNodeTag ? tag : null;
};

export const isNullNode = (node) => {
  return node && getSigilTag(node).type === NullTag;
};

export const isCover = (node) => {
  return parseTagType(node) === TreeNode && parseTag(node[0]).value.type === Symbol.for('_');
};

export const isFragment = (node) => {
  return (
    parseTagType(node) === TreeNode &&
    [Symbol.for('__'), Symbol.for('_')].includes(parseTag(node[0]).value.type)
  );
};

export const isMultiFragment = (node) => {
  return parseTagType(node) === TreeNode && parseTag(node[0]).value.type === Symbol.for('__');
};

export const isGapNode = (node) => {
  return node && parseTagType(getSigilTag(node)) === GapTag;
};

export const isStubNode = (node) => {
  return node && [GapTag, NullTag].includes(parseTagType(getSigilTag(node)));
};

export const isStubTag = (tag) => {
  return [GapTag, NullTag].includes(parseTagType(tag));
};

export const isAnonymousToken = (node) => {
  return node.type == TreeNode && node.value.flags.token && !node.value.name;
};

export const getOriginalFirstNode = (node) => {
  if (node.type !== TreeNode) return;

  for (let child of Tags.traverse(getTags(node))) {
    if (child.type === Property) {
      return child.value.node;
    }
  }
  return null;
};

export const getFirstNode = (node) => {
  return getFirstNodeProperty(node)?.node;
};

export const getFirstNodeProperty = (node) => {
  for (let child of Tags.traverse(node)) {
    if (child.type === Property) {
      let ref = child.value.reference;
      if (!ref.flags.expression) {
        return child;
      } else {
        let tagsIndex = Tags.getIndex(buildFullPathSegment(ref.type, ref.name, 0, -1), node);
        return Tags.getAt(tagsIndex, node, 2)?.value;
      }
      // is it shifted?
    }
  }
  return null;
};

export const isDefined = (obj, key) => hasOwn(obj, key) && obj[key] !== undefined;
export const isUndefined = (obj, key) => !hasOwn(obj, key) || obj[key] === undefined;

export function* relatedNodes(node) {
  for (const child of Tags.traverse(getTags(node))) {
    if (child.type === Property) {
      yield child.node;
    }
  }
}

export const getProperty = (pathSegment, node) => {
  if (!node || node.type !== TreeNode) return null;

  if (pathSegment == null) throw new Error('Bad path segment');

  let segment = typeof pathSegment === 'string' ? buildPathSegment(pathSegment) : pathSegment;
  let propIndex = Tags.getIndex(segment, node.value.tags);

  if (propIndex == null) return null;

  return Tags.getAt(propIndex, getTags(node));
};

export const has = (path, node) => {
  if (!isArray(path)) {
    path = [path];
  }

  let pathArr = [...arrayValues(path)];
  let node_ = get(pathArr.slice(0, -1), node);
  let seg = pathArr[pathArr.length - 1];

  return !!getProperty(seg, node_);
};

export const get = (path, node) => getOr(null, path, node);

export const getOr = (defaultValue, path, node) => {
  if (path == null) throw new Error('Bad path');
  if (!node) return null;

  if (!isArray(path)) {
    path = [path];
  }

  let root = getRoot(node);
  let result = root || node;

  let start = 0;
  // TODO allow dot dot at all levels
  if (path[0]?.type === '_') {
    if (!root) return null;
    start = 1;
  }

  for (let i = start; i < path.length; i++) {
    let nameOrSeg = path[i];
    let isName = typeof nameOrSeg === 'string';
    let property;
    let index = path[i + 1];

    if (typeof index === 'number') {
      i++;
    } else {
      index = undefined;
    }

    if (!isName && (!nameOrSeg || !hasOwn(nameOrSeg, 'shiftIndex'))) throw new Error('Bad path');

    let seg = isName ? buildPathSegment(nameOrSeg, index) : nameOrSeg;

    property = getProperty(seg, result);

    if (!property) return defaultValue;

    result = getRoot(property.value.node);
  }

  return isNullNode(result) ? null : result;
};

export const set = (path, value, node) => {
  return Path.from(node).replaceAt(path, value).node;
};

export function* list(name, node) {
  if (isArray(name)) throw new Error('not supported');
  let count = countList(name, node);

  for (let i = 0; i < count; i++) {
    yield get(buildPathSegment(name, i, -1), node);
  }
}

export const countList = (name, node) => {
  if (!node) throw new Error();

  if (name == null) throw new Error('Bad path');

  return Tags.findCount(printQuotedIdentifier(name), Tags.buildRefCounts(getTags(node)));
};

export function* allTagPathsFor(range) {
  if (range == null) return;

  if (range[0] && !(range[0] instanceof TagPath)) throw new Error();
  if (range[1] && !(range[1] instanceof TagPath)) throw new Error();

  let startPath = range[0];
  let endPath = range[1];
  let path = startPath;

  while (path) {
    if (path.inner && path.previousSibling.type === ReferenceTag) {
      path = TagPath.from(path.inner, 0);
    }

    if (path.path.depth < startPath.path.depth) {
      return;
    }

    yield path;

    if (endPath && path.tagsIndex === endPath.tagsIndex && path.path.node === endPath.path.node) {
      return;
    }

    let gapPath = path.path.parent && TagPath.from(path.path.parent, path.path.parentIndex, 1);

    if (
      endPath &&
      path.type === CloseNodeTag &&
      gapPath &&
      gapPath.tagsIndex === endPath.tagsIndex &&
      gapPath.path.node === endPath.path.node
    ) {
      return;
    }
    path = path.next;
  }
}

export function* allTagsFor(range, options = freeze({})) {
  for (let path of allTagPathsFor(range, options)) {
    yield path.tag;
  }
}

export const buildFullRange = (node) => {
  let sum = Tags.getSize(getTags(node));
  return sum ? [0, sum - 1] : null;
};

export function* ownTagPathsFor(range) {
  if (!isArray(range)) throw new Error();

  let startPath = range[0];
  let endPath = range[1];

  if (startPath.parent.node !== endPath.parent.node) throw new Error();

  let { tags } = startPath.parent.node;

  for (let i = startPath.tagsIndex; i < endPath.tagsIndex; i++) {
    yield tags[i];
  }
}

const findRight = (arr, predicate) => {
  for (let i = arr.length - 1; i >= 0; i--) {
    let value = arr[i];
    if (predicate(value)) return value;
  }
  return null;
};

const skipLevels = 3;
const skipShiftExponentGrowth = 4;
const skipAmounts = new Array(skipLevels)
  .fill(null)
  .map((_, i) => 2 >> (i * skipShiftExponentGrowth));
const skipsByFrame = new WeakMap();

const buildSkips = (frame) => {
  let skipIdx = 0;
  let skipAmount = skipAmounts[skipIdx];
  let skips;
  while ((frame.depth & skipAmount) === skipAmount) {
    if (!skips) {
      skips = [];
      skipsByFrame.set(frame, skips);
    }

    skips[skipIdx] = frame.atDepth(frame.depth - skipAmount);

    skipIdx++;
    skipAmount = skipAmounts[skipIdx];
  }
};

const skipToDepth = (depth, frame) => {
  let parent = frame;

  if (depth > frame.depth) throw new Error();

  let d = frame.depth;
  for (; d > depth; ) {
    const skips = skipsByFrame.get(frame);
    parent = (skips && findRight(skips, (skip) => d - skip > depth)) || parent.parent;
    d = parent.depth;
  }
  return parent;
};

export const getRange = (node) => {
  const { tags } = node;
  let path = Path.from(node);
  return Tags.getSize(tags) ? [TagPath.from(path, 0), TagPath.from(path, -1)] : null;
};

export const getFlags = (node) => {
  let sigilTag = node[0] && parseTag(node[0]);
  if (!sigilTag) return null;

  return sigilTag.value.flags;
};

export const getAttributes = (node) => {
  let sigilTag = node[0] && parseTag(node[0]);
  if (!sigilTag) return freeze({});

  return sigilTag.value.attributes;
};

export const isSelfClosingTag = (tag) => {
  if (!tag) return false;
  let tagType = parseTagType(tag);
  if ([NullTag, GapTag].includes(tagType)) return true;
  if (tagType !== OpenNodeTag) return false;
  let tag_ = isString(tag) ? parseOpenNodeTag(tag) : tag;
  return tag_.value.selfClosing;
};

const parents = new WeakMap();

export const buildSumsForNode = (node) => {
  assertValidNode(node);

  return node.type === TreeNode ? printSums(Tags.sumNode(node.value.tags)) : '';
};

export const Path = class AgastPath {
  static from(node) {
    return (
      node &&
      new Path(null, buildPathFrame(Tags.fromValues(['', '', '', buildSumsForNode(node), node], 1)))
    );
  }

  static wrap(frames) {
    return new Path(null, frames);
  }

  static fromTag(openTag) {
    return Path.from(Tags.fromValues([printTag(parseTag(openTag), porcelain)]));
  }

  static set(path, value, node) {
    return Path.from(node).replaceAt(path, value).node;
  }

  static get(path, node) {
    return Path.from(node).get(path).node;
  }

  constructor(parent, frame) {
    let frame_ = isArray(frame) ? BList.getAt(-1, frame) : frame;
    let { property, parentIndex } = frame_;
    let node = property[4];

    if (parent && parentIndex == null) throw new Error();
    if (!isValidNode(node)) throw new Error();

    if (!node) throw new Error();
    if (!isRecord(frame_)) throw new Error();

    if (parent && isArray(frame_)) throw new Error();

    if (parent) {
      parents.set(this, parent);
    }

    this.depth = parent ? parent.depth + 1 : isArray(frame) ? BList.getSize(frame) - 1 : 0;
    this.frame = frame_;
    this.frames = !parent
      ? isArray(frame)
        ? frame
        : BList.fromValues([frame])
      : BList.push(frame, parent.frames);

    buildSkips(this);

    freeze(this);

    let parent_ = this.parent;

    let parentTag = parentIndex == null ? null : Tags.getAt(parentIndex, parent_.node);

    if (parentTag && parseTagType(parentTag) !== Property) {
      throw new Error();
    }

    if (parent_ && parent_.tagPathAt(parentIndex).tag !== property) {
      throw new Error('Path not reachable');
    }

    if (!Number.isFinite(this.depth)) throw new Error();
  }

  asPrimitive() {
    return this.frames;
  }

  push(tagsIndex) {
    let tag = tagsIndex != null ? Tags.getAt(tagsIndex, this.tags) : null;

    if (!tag || parseTagType(tag) !== Property) {
      return null;
    }

    return new Path(this, buildPathFrame(tag, tagsIndex));
  }

  pushFrame(frame) {
    return new Path(this, frame);
  }

  get parent() {
    let { parentIndex, frames } = this;

    if (parentIndex == null) return null;

    let parent;
    if ((parent = parents.get(this))) {
      return parent;
    }

    parent = new Path(null, BList.pop(frames));

    parents.set(this, parent);

    return parent;
  }

  get parentIndex() {
    return this.frame.parentIndex;
  }

  get isGap() {
    throw new Error('deprecated');
  }

  get node() {
    return this.frame.property[4];
  }

  get sigilTag() {
    return parseTag(this.node[0]);
  }

  get value() {
    return this.node.value;
  }

  get name() {
    let { sigilTag } = this;
    return sigilTag.type === TreeNode ? sigilTag.value.name : null;
  }

  get type() {
    let { sigilTag } = this;
    return sigilTag.type === TreeNode ? sigilTag.value.type : null;
  }

  get flags() {
    let { sigilTag } = this;
    return sigilTag.type === OpenNodeTag ? sigilTag.value.flags : null;
  }

  get attributes() {
    let { node } = this;
    return node.type === TreeNode ? node.value.attributes : null;
  }

  get tags() {
    return this.node;
  }

  get children() {
    throw new Error('not implemented');
    let { node } = this;
    return node.type === TreeNode ? node.value.children : null;
  }

  childPathAt(childrenIndex, propertyIndex, bindingsIndex) {
    let { node } = this;
    let absChildrenIdx =
      childrenIndex < 0 ? Tags.getChildrenSize(node) + childrenIndex : childrenIndex;
    let tagsIndex = absChildrenIdx + 1;
    return TagPath.from(this, tagsIndex, propertyIndex, bindingsIndex);
  }

  childAt(childrenIndex, propertyIndex, bindingsIndex) {
    return this.childPathAt(childrenIndex, propertyIndex, bindingsIndex)?.tag;
  }

  getSigilTagPath() {
    return TagPath.from(this, 0);
  }

  tagPathAt(tagsIndex, propertyIndex, bindingsIndex) {
    return TagPath.from(this, tagsIndex, propertyIndex, bindingsIndex);
  }

  tagAt(tagsIndex, propertyIndex, bindingsIndex) {
    return TagPath.from(this, tagsIndex, propertyIndex, bindingsIndex)?.tag;
  }

  getPropertyTagPath(childrenIndex) {
    let { children } = this.node.value;
    let absChildrenIndex =
      childrenIndex < 0 ? Tags.getSize(children) + childrenIndex : childrenIndex;
    let tagPath = this.tagPathAt(absChildrenIndex + 1);
    return tagPath && tagPath.type === Property ? tagPath : null;
  }

  getReferenceTagPath(childrenIndex) {
    let { children } = this.node.value;
    let absChildrenIndex =
      childrenIndex < 0 ? Tags.getSize(children) + childrenIndex : childrenIndex;
    return this.tagPathAt(absChildrenIndex + 1, [0]);
  }

  // getBindings(childrenIndex) {
  //   let property = this.getPropertyTagPath(childrenIndex);
  //   return property && Tags.getAt([1], property.value.tags);
  // }

  getBindingTagPath(childrenIndex, bindingsIndex) {
    let { children } = this.node.value;
    let absChildrenIndex =
      childrenIndex < 0 ? Tags.getSize(children) + childrenIndex : childrenIndex;
    return this.tagPathAt(absChildrenIndex + 1, [1, bindingsIndex]);
  }

  getNodeTagPath(childrenIndex) {
    let { children } = this.node.value;
    let absChildrenIndex =
      childrenIndex < 0 ? Tags.getSize(children) + childrenIndex : childrenIndex;
    return this.tagPathAt(absChildrenIndex + 1, [4]);
  }

  get openTagPath() {
    let tagPath = TagPath.from(this, 0);
    return tagPath?.type === OpenNodeTag ? tagPath : null;
  }

  get closeTagPath() {
    let tagPath = TagPath.from(this, -1);
    return tagPath.type === CloseNodeTag ? tagPath : null;
  }

  get openTag() {
    return this.openTagPath?.tag;
  }

  get open() {
    let { openTag } = this;
    return openTag && parseOpenNodeTag(openTag).value;
  }

  get closeTag() {
    return this.closeTagPath?.tag;
  }

  get bindings() {
    return this.parentPropertyPath?.tag[2];
  }

  get bindingTags() {
    throw new Error('not implemented');
    return this.parentPropertyPath?.tag.value.tags[1][1];
  }

  get reference() {
    let { referenceTag } = this;
    return referenceTag && parseTag(referenceTag)?.value;
  }

  get referenceTag() {
    return this.referenceTagPath?.tag ?? null;
  }

  get referenceTagPath() {
    if (!this.parent?.node) {
      return null;
    }
    return TagPath.from(this.parent, this.parentIndex, 0)?.referenceTagPath;
  }

  get propertyKeyTagPath() {
    if (!this.parent?.node) {
      return null;
    }
    return TagPath.from(this.parent, this.parentIndex, 0);
  }

  get parentPropertyPath() {
    if (!this.parent?.node || this.parentIndex == null) {
      return null;
    }
    let path = TagPath.from(this.parent, this.parentIndex);
    if (path.next?.type === ShiftTag) {
      path = TagPath.from(this.parent, this.parentIndex - path.next.value.index);
    }
    return path;
  }

  get parentProperty() {
    return this.parentPropertyPath?.tag ?? null;
  }

  get parentNode() {
    return this.parent.node;
  }

  get firstPropertyTagPath() {
    let tagPath = this.tagPathAt(1);
    while (tagPath && (!tagPath.propertyPath || isNullNode(tagPath.propertyPath.value.node))) {
      tagPath = tagPath.nextSibling;
      if (tagPath?.propertyPath) {
        tagPath = tagPath.propertyPath;
      }
    }
    return tagPath;
  }

  get lastPropertyTagPath() {
    let tagPath = this.tagPathAt(-1);
    while (tagPath && (!tagPath.propertyPath || isNullNode(tagPath.propertyPath.value.node))) {
      tagPath = tagPath.previousSibling;
      if (tagPath?.propertyPath) {
        tagPath = tagPath.propertyPath;
      }
    }
    return tagPath;
  }

  get coverBoundary() {
    let path = this;

    if (path.parent && !isFragment(this.node) && isCover(path.parent.node)) {
      path = path.parent;
    }

    while (path && isCover(path.node) && path.parent && isCover(path.parent.node)) {
      path = path.parent;
    }

    return path;
  }

  get(path) {
    let path_ = typeof path === 'string' ? [path] : [...arrayValues(path)];
    let pathInst = this;

    let skippedRootFragment = false;

    if (!(path.length && isObject(path[1]) && path[0].type === '_')) {
      let sigilTag = parseTag(pathInst.node[0]);
      while (!sigilTag.value.name && sigilTag.value.type === Symbol.for('_')) {
        if (pathInst.depth) throw new Error();
        skippedRootFragment = true;
        pathInst = pathInst.push(
          Tags.getIndex(buildFullPathSegment('_', null, 0), pathInst.node.value.children),
        );
        sigilTag = parseTag(pathInst.node[0]);
      }
    }

    for (let i = 0; i < path_.length; i++) {
      let nameOrSeg = path_[i];

      let seg = nameOrSeg;
      if (isString(nameOrSeg)) {
        let index = path_[i + 1];
        if (typeof index === 'number') {
          i++;
        } else {
          index = undefined;
        }
        seg = buildPathSegment(nameOrSeg, index);
      }

      if (i === 0 && seg.type === '_' && skippedRootFragment) continue;

      let tagsIndex = Tags.getIndex(
        buildFullPathSegment(seg.type, seg.name, seg.index, seg.shiftIndex),
        pathInst.node,
      );

      if (tagsIndex == null) return null;

      pathInst = pathInst.push(tagsIndex);
    }

    return pathInst;
  }

  replaceWith(node, bindingTags) {
    let bindings = bindingTags?.map((tag) => parseTag(tag).value); // TODO improve here
    if (bindings != null && !isArray(bindings)) throw new Error();
    if (!isNode(node)) throw new Error();

    if (!node) throw new Error();

    if (!this.parent) {
      return Path.from(node);
    }

    let built = node;
    let path = this.parent;
    let replacementPath = [];

    let targetReference = this.reference;
    let targetBindings = bindings == null ? this.bindings : bindings;
    let targetParentIndex = this.parentIndex;
    let value;

    while (path) {
      value = built;
      built = path.node;

      let tags = Tags.getAt(targetParentIndex, path.node);

      let firstTag = tags[0];

      let tags_ = Tags.fromValues(
        [
          firstTag,
          targetBindings?.length
            ? Tags.fromValues(
                map((binding) => printBinding(binding, porcelain), arrayValues(targetBindings)),
              )
            : tags[1] || '',
          '',
          buildSumsForNode(value),
          value,
        ],
        1,
      );

      built = Tags.replaceAt(targetParentIndex, tags_, built);
      replacementPath.push(targetParentIndex);

      targetReference = path.reference;
      targetBindings = path.bindings;
      targetParentIndex = path.parentIndex;
      path = path.parent;
    }

    return this.mapOnto(built);
  }

  replaceAt(path, node, bindings) {
    return this.get(path).replaceWith(node, bindings).atDepth(this.depth);
  }

  remove() {
    if (!this.parent) {
      return null;
    }

    let { parentNode, parentIndex } = this;

    return this.parent.replaceWith(Tags.removeAt(parentIndex, parentNode));
  }

  removeAt(idx) {
    return this.replaceWith(Tags.removeAt(idx, this.node));
  }

  mapOnto(rootNode) {
    let path = Path.from(rootNode);

    for (let i = 1; i <= this.depth; i++) {
      let { parentIndex } = this.atDepth(i);
      path = path.push(parentIndex);
    }

    return path;
  }

  atDepth(depth) {
    return skipToDepth(depth, this);
  }

  get rootNode() {
    return this.atDepth(0).node;
  }

  get done() {
    let { parent, node } = this;
    let sigilTag = getSigilTag(node);

    return !parent && sigilTag && !!(isSelfClosingTag(sigilTag) || getCloseTag(node) != null);
  }

  get held() {
    let tagPath = this.tagPathAt(-1);

    // TODO is this safe
    if (tagPath.type !== Property) return null;

    let tags = tagPath.value;

    if (parseTagType(tags[0]) === ShiftTag && !tags[4]) {
      return TagPath.from(tagPath.path, tagPath.tagsIndex - 1).value;
    }

    // if we're not at the left side, we aren't held
    if (
      !tagPath.equalTo(this.firstPropertyTagPath) ||
      propertyIsFull(tagPath.tag) ||
      (tagPath.inner && nodeIsComplete(tagPath.inner.node))
    ) {
      return null;
    }

    let coverParent = this;

    for (;;) {
      let refPath = coverParent.propertyKeyTagPath;

      if (refPath?.type === ShiftTag) {
        return TagPath.from(refPath.path, refPath.tagsIndex - 1).value;
      }

      coverParent = coverParent.parent;
      if (coverParent?.node.type !== Symbol.for('_')) break;
    }

    return null;
  }

  advance(tag) {
    if (tag == null) throw new Error();

    let tagPath = this.tagPathAt(-1, -1);
    let lastPropPath = tagPath.propertyPath;

    if (lastPropPath?.value.length === 5) {
      lastPropPath = null;
    }

    if (tagPath?.nextSibling) throw new Error();

    if (this.done) throw new Error();

    let resultPath = this;

    let tag_ = parseTag(tag);

    if (tag_.type === LiteralTag) {
      for (let part of Tags.literalParts(tag_.value.value)) {
        resultPath = resultPath.advanceSingle(printTag(buildLiteralTag(part), porcelain)).path;
      }
    } else if (tag_.type === Property) {
      resultPath = this.replaceWith(Tags.push(tag, resultPath.node));
    } else if (tag_.type === TreeNode && getTreeNodeType(tag_.value) === Symbol.for('__')) {
      let existingProperty = lastPropPath;

      while (existingProperty?.type === AttributeDefinitionTag) {
        existingProperty = tagPath.siblingAt(existingProperty.tagsIndex - 1);
      }

      if (
        existingProperty &&
        existingProperty.type !== OpenNodeTag &&
        existingProperty.tag &&
        !propertyIsFull(existingProperty.tag)
      ) {
        throw new Error();
      }

      let newPath = Path.from(resultPath.node);

      for (let tag of Tags.traverseChildren(tag_.value)) {
        if (parseTagType(tag) === Property) {
          newPath = newPath.advance(tag);
        } else {
          newPath = newPath.advanceSingle(tag).path.atDepth(0);
        }
      }

      resultPath = resultPath.replaceWith(newPath.node);
    } else if (tag_.type === EmptyTag) {
    } else {
      if (
        lastPropPath?.type !== Property ||
        propertyIsFull(lastPropPath.tag) ||
        lastPropPath.tag.length < 4
      ) {
        if (
          (!lastPropPath || lastPropPath.tag.length < 1) &&
          [
            BindingTag,
            HashTag,
            SumsTag,
            OpenNodeTag,
            NullTag,
            GapTag,
            TreeNode,
            NullNode,
            GapNode,
          ].includes(tag_.type)
        ) {
          resultPath = resultPath.advanceSingle('.:').path;
        }

        if (
          (!lastPropPath || lastPropPath.tag.length < 2) &&
          [HashTag, SumsTag, OpenNodeTag, NullTag, GapTag, TreeNode, NullNode, GapNode].includes(
            tag_.type,
          )
        ) {
          resultPath = resultPath.advanceSingle('').path;
        }

        if (
          (!lastPropPath || lastPropPath.tag.length < 3) &&
          [SumsTag, OpenNodeTag, NullTag, GapTag, TreeNode, NullNode, GapNode].includes(tag_.type)
        ) {
          resultPath = resultPath.advanceSingle('').path;
        }

        if ([OpenNodeTag, GapTag, NullTag, TreeNode, NullNode, GapNode].includes(tag_.type)) {
          resultPath = resultPath.advanceSingle(
            tag_.type === TreeNode
              ? buildSumsForNode(tag_.value)
              : printSums(freezeRecord([0, 0, 0, 0, 0, 0])),
          ).path;
        }
      }

      if ([TreeNode, NullNode, GapNode].includes(tag_.type)) {
        resultPath = resultPath.advanceSingle(tag_.value).path;
      } else {
        resultPath = resultPath.advanceSingle(printTag(tag_, porcelain)).path;
      }
    }

    if (
      (tag_.type === CloseNodeTag || (tag_.type === OpenNodeTag && tag_.value.selfClosing)) &&
      resultPath.depth
    ) {
      return resultPath.parent;
    }

    return resultPath;
  }

  advanceSingle(tag) {
    if (!isString(tag) && !isNode(tag)) throw new Error();
    let tag_ = parseTag(tag);
    let porcelainTag = isArray(tag) ? tag : printTag(tag_, porcelain);

    let tagPath = this.tagPathAt(-1, -1);
    let lastPropPath = tagPath.propertyPath;

    // if (
    //   lastPropPath?.type === Property &&
    //   !propertyIsFull(lastPropPath.tag) &&
    //   !(isNodeTag(tag_) || Tags.startsNode(tag_) || [BindingTag, HashTag].includes(tag_.type))
    // )
    //   throw new Error();

    if (
      [TreeNode, NullNode, GapNode].includes(tagPath?.type) ? tagPath?.nextSibling : tagPath?.next
    )
      throw new Error();

    if (this.done) throw new Error();

    let targetPath = tagPath && endsNode(tagPath.tag) ? this.parent : this;

    switch (tag_.type) {
      case ReferenceTag: {
        let { type, name, flags } = tag_.value;

        if ([ReferenceTag, ShiftTag, BindingTag].includes(targetPath.tagPathAt(-1, -1)?.type))
          throw new Error('invalid location for reference');

        if (getFlags(targetPath.node).token && type !== '.') throw new Error();
        if (targetPath.type !== Symbol.for('__')) {
          if (targetPath.open.type === Symbol.for('_') && name != null) throw new Error();
          if (targetPath.open.type === Symbol.for('_') && flags.hasGap) throw new Error();
          if (targetPath.open.type === Symbol.for('_') && !['_', '#'].includes(type))
            throw new Error();
        }

        if (targetPath.flags.object) {
          if (type === Symbol.for('_')) throw new Error();
          if (printNodeFlags(flags)) throw new Error();
          let propertyPath = this.tagPathAt(-1);

          while (propertyPath && propertyPath.type !== Property) {
            propertyPath = propertyPath.previousSibling;
          }

          if (
            type === Symbol.for('__') &&
            propertyPath &&
            printReference(propertyPath.tag.value.reference) >= printTag(tag_)
          ) {
            throw new Error();
          }
        } else if (targetPath.flags.array) {
          if (printTag(tag_) !== '.:') throw new Error();
        }

        if (tag_.value.name) {
          let property = getProperty(tag_.value.name, targetPath.node);
          if (
            getOr(null, tag_.value.name, targetPath.node) &&
            !property.value.shift &&
            tag_.value.flags.array !== property.value.reference.flags.array
          ) {
            throw new Error('mismatched references');
          }
        }

        let property = Tags.fromValues([porcelainTag]);

        targetPath = targetPath.replaceWith(Tags.push(property, targetPath.node));
        break;
      }

      case BindingTag: {
        if (![ReferenceTag, ShiftTag, BindingTag].includes(parseTagType(this.tagPathAt(-1, -1)))) {
          throw new Error('Invalid location for BindingTag');
        }

        let refPath = this.tagPathAt(-1, 0);
        let propPath = TagPath.from(refPath.path, refPath.tagsIndex);

        if (![ReferenceTag, ShiftTag].includes(refPath.type)) throw new Error();

        let { 0: firstTag, 1: bindingTags } = propPath.value;
        let tags = Tags.fromValues(
          [firstTag, bindingTags ? Tags.push(porcelainTag, bindingTags) : Tags.from(porcelainTag)],
          1,
        );

        targetPath = this.replaceWith(Tags.replaceAt(propPath.tagsIndex, tags, this.node));
        break;
      }

      case OpenNodeTag: {
        let { literalValue, flags, type, name, attributes } = tag_.value;

        if (this.held && flags.token) throw new Error();

        if (!(this.flags.array || this.flags.object) && (flags.array || flags.object)) {
          throw new Error();
        }

        let parentProp = this.node && Tags.getChildrenAt(-1, this.node);

        if (parentProp && propertyIsFull(parentProp)) {
          parentProp = null;
        }

        let ref =
          parseTagType(parentProp[0]) === ShiftTag
            ? this.node &&
              parseTag(Tags.getChildrenAt(-1 - parseTag(parentProp[0]).value.index, this.node)[0])
                .value
            : parseTag(parentProp[0]).value;

        let parentFlags =
          parseTagType(parentProp[0]) === ShiftTag ? flags : parseTag(this.node[0]).value.flags;

        if (parentFlags.token) throw new Error();

        let node;
        if (literalValue && !flags.token) {
          let newOpenTag = buildOpenNodeTag(flags, type, name, null, attributes);
          let literalNode = Path.fromTag(
            buildOpenNodeTag(parseNodeFlags('*'), null, null, literalValue),
          ).node;

          node = Path.fromTag(newOpenTag).advance(literalNode).advance('</>').node;
        } else {
          node = Tags.fromValues([printTag(tag_, porcelain)]);
        }

        targetPath = this.advanceSingle(node).path;
        targetPath = targetPath.tagPathAt(-1).inner;

        break;
      }

      case GapTag: {
        if (![ReferenceTag, EmptyTag].includes(this.tagPathAt(-1, 0)?.type)) {
          throw new Error('Invalid location for ' + tag_.type.description);
        }

        let node = Tags.fromValues([printTag(tag_)]);

        targetPath = this.advanceSingle(node).path;
        break;
      }

      case NullTag: {
        if (parseTagType(this.tagPathAt(-1, 0)) !== ReferenceTag) {
          throw new Error('Invalid location for ' + tag_.type.description);
        }

        let node = Tags.fromValues([printTag(tag_)]);

        targetPath = this.advanceSingle(node).path;
        break;
      }

      case CloseNodeTag: {
        let { node } = targetPath;

        let lastChild = targetPath.childAt(-1);

        if (isObject(lastChild) && lastChild?.type === Property && !propertyIsFull(lastChild))
          throw new Error();

        let openTag = parseTag(getOpenTag(node));

        let closeTag = getCloseTag(node);

        if (openTag.value.selfClosing) throw new Error();
        if (closeTag != null) throw new Error();

        targetPath = targetPath.replaceWith(Tags.push(tag, node));

        break;
      }

      case NullNode:
      case GapNode:
      case TreeNode: {
        let node = tag_;
        let parentPath = targetPath;
        let { node: parentNode } = parentPath;

        let tagPath = TagPath.from(parentPath, -1);
        let propTagPath = TagPath.from(parentPath, -1, -1);

        if (tagPath.type !== Property || tagPath.value.length < 4) throw new Error();

        if (node.type === TreeNode) {
          propTagPath.type === SumsTag && propTagPath.tag !== Tags.sumNode(node.value);
          let { flags } = parseTag(node.value[0]).value;
          if ((flags.array || flags.object) && !(this.flags.array || this.flags.object)) {
            throw new Error();
          }
        }

        let shift = tagPath.type === Property ? tagPath.value.shift : undefined;
        let { held } = this;

        if (held) {
          // let heldProperty = this.tagPathAt(-2, 2).value;
          let matchesHeld = isGapNode(node);
          if (getRoot(node.value) && nodeIsComplete(node.value)) {
            debugger;
            matchesHeld ||=
              held.node === node ||
              held.node ===
                BList.getAt(
                  -BList.getSize(held.node.value.bounds.leading),
                  node.value.bounds.leading,
                ).property[4];
            if (!matchesHeld) {
              // TODO We're passing by the node that shifted if it's a cover!
              throw new Error();
            }
          }
        }

        let {
          0: firstTag,
          1: bindingTags = '',
          2: hashTag = '',
          3: sumsTag = buildSumsForNode(node),
        } = tagPath.value;
        let tags = Tags.fromValues([firstTag, bindingTags, hashTag, sumsTag, node.value], 1);

        targetPath = this.replaceWith(Tags.replaceAt(tagPath.tagsIndex, tags, parentNode));

        break;
      }

      case AttributeDefinitionTag: {
        if (this.held) throw new Error('invalid place for an attribute binding');

        let lastChild = this.childAt(-1);

        if (lastChild?.type === Property && !propertyIsFull(lastChild)) throw new Error();

        // add undefined attributes from value
        let { node } = this;
        if (tag_.type !== AttributeDefinitionTag) throw new Error();

        let { path, value } = tag_.value;
        let openTag = parseTag(getOpenTag(node));
        let { attributes } = parseTag(node[0]).value;

        if (!objHas(attributes, path) && objGet(attributes, path) !== undefined)
          throw new Error('Can only define undefined attributes');

        if (value === undefined) throw new Error('cannot define attribute to undefined');

        let { flags, name } = openTag.value;
        attributes = immSet(attributes, path, value);
        let newOpenTag = buildOpenNodeTag(flags, null, name, null, attributes);

        targetPath = this.replaceWith(
          Tags.push(porcelainTag, Tags.replaceAt(0, printTag(newOpenTag, porcelain), node)),
        );
        break;
      }

      case ShiftTag: {
        let lastPropertyTag = parseTag(this.tagPathAt(-1).tag);

        if (lastPropertyTag.type !== Property) throw new Error();

        let sigilTag = parseTag(lastPropertyTag.value[0]);

        // if (!reference) {
        //   ({ reference } = this.tagPathAt(-1 - (heldShift?.index ?? 0)).value);
        // }

        // TODO move this check to agast
        // if (!reference.flags.expression && reference.type !== '_') throw new Error();

        let shift =
          sigilTag.type === ShiftTag ? buildShift(sigilTag.value.index + 1) : buildShift(1);

        // TODO move this check to agast
        if (tag_.value.index !== shift.index) throw new Error();

        let property = Tags.fromValues([porcelainTag]);

        targetPath = this.replaceWith(Tags.push(property, this.node));
        break;
      }

      case LiteralTag:
        if (typeof tag_.value.value !== 'string') throw new Error();

        targetPath = this.replaceWith(Tags.push(porcelainTag, this.node));
        break;

      case EscapeTag:
        if (typeof tag_.value.value !== 'string') throw new Error();

        targetPath = this.replaceWith(Tags.push(porcelainTag, this.node));
        break;

      case HashTag: {
        let lastPropertyTag = this.tagPathAt(-1).tag;

        if (lastPropertyTag.length < 2) throw new Error();

        let refPath = this.tagPathAt(-1, 0);
        let propPath = this.tagPathAt(-1);

        if (refPath && ![ReferenceTag, ShiftTag].includes(refPath.type)) throw new Error();

        let { 0: refTag = '', 1: bindingTags = '' } = propPath ? propPath.value : [];
        let property = Tags.fromValues([refTag, bindingTags, porcelainTag], 1);

        targetPath = this.replaceWith(Tags.replaceAt(propPath.tagsIndex, property, this.node));

        break;
      }

      case SumsTag: {
        let propPath = this.tagPathAt(-1);

        if (propPath.type !== Property || propPath.value.length < 3) throw new Error();

        let {
          0: firstTag = '',
          1: bindingTags = '',
          2: hashTag = '',
        } = propPath ? propPath.value : [];

        let tags = Tags.fromValues([firstTag, bindingTags, hashTag, porcelainTag], 1);

        targetPath = this.replaceWith(Tags.replaceAt(propPath.tagsIndex, tags, this.node));
        break;
      }

      case EmptyTag: {
        let lastTag = this.tagPathAt(-1).tag;

        if (lastTag.type === Property && lastTag.value.tags[1].length === 4) {
          throw new Error('invalid location for EmptyTag');
        }

        let lastPropertyTag = this.tagPathAt(-1).tag;

        let newProp = ![ReferenceTag, ShiftTag, BindingTag, EmptyTag, HashTag].includes(
          parseTagType(this.tagPathAt(-1, -1, -1)),
        );
        let propPath = newProp ? null : this.tagPathAt(-1);

        let shift = propPath?.value.shift;

        let propTags = propPath ? propPath.tag : [];
        let tags = Tags.fromValues([...arrayValues(propTags), ''], 1);

        if (newProp) {
          targetPath = this.replaceWith(Tags.push(tags, this.node));
        } else {
          targetPath = this.replaceWith(Tags.replaceAt(propPath.tagsIndex, tags, this.node));
        }

        break;
      }

      default:
        throw new Error();
    }

    return targetPath && TagPath.from(targetPath, -1, -1, -1);
  }
};

freezeClass(Path);

export const tagPathsAreEqual = (a, b) => {
  if (a == null || b == null) return b == a;
  return a.path.node === b.path.node && a.tagsIndex === b.tagsIndex;
};

let getPropertyShiftIndex = (property) => {
  let sigilTag = parseTag(property[0]);

  return sigilTag.type === ShiftTag ? sigilTag.value.shift : 0;
};

let resolveIdx = (idx, tree) => {
  let path = [];
  let node = tree;

  if (isArray(idx)) {
    for (let seg of arrayValues(idx)) {
      let index = typeof seg !== 'object' ? seg : seg.index;
      if (typeof index === 'string') throw new Error();
      if (!Tags.isNode(node)) return null;
      let index_ = index < 0 ? Tags.getSize(node) + index : index;
      path.push(index_);
      node = Tags.getValues(node)[index_];
      if (node && !Tags.isNode(node)) {
        return path;
      }
      if (!node) return null;
    }

    return path;
  }
};

export class TagPath {
  static fromNode(node, tagsIndex = null, propertyIndex = null) {
    let sigilTag = node[0];
    let tagsIndex_ = tagsIndex === null ? 0 : tagsIndex;

    if (tagsIndex === null && sigilTag === null) throw new Error();

    return TagPath.from(Path.from(node), tagsIndex_, propertyIndex);
  }

  static fromTag(openTag) {
    return TagPath.fromNode(Tags.fromValues([openTag]));
  }

  static wrap(primitive) {
    if (!primitive) return null;

    let { path, tagsIndex, propertyIndex } = primitive;

    return TagPath.from(Path.wrap(path), tagsIndex, propertyIndex);
  }

  static from(path, tagsIndex, propertyIndex = null, bindingsIndex = null) {
    if (!Number.isFinite(tagsIndex)) throw new Error();
    if (!path) throw new Error();
    let existing = freezeRecord({ existing: true });
    let tagsPath = Tags.findPath(tagsIndex, path.node, existing);

    if (!tagsPath) return null;

    let topPathFrame = tagsPath[tagsPath.length - 1];
    let tag = Tags.getAt(topPathFrame.index, topPathFrame.node);

    if (propertyIndex != null) {
      // we expect overspecifying the index to result in access, I think
      if (parseTagType(tag) !== Property) {
        return new TagPath(path, tagsPath);
      }

      let propPath = Tags.findPath(propertyIndex, tag, existing);

      if (!propPath) return null;

      let bindingsPath =
        bindingsIndex == null || propPath == null || propPath[0].index !== 1
          ? null
          : Tags.findPath(bindingsIndex, propPath[0].node[1], existing);

      return new TagPath(path, tagsPath, propPath, bindingsPath);
    }

    return new TagPath(path, tagsPath);
  }

  constructor(path, tagsPath, propertyTagsPath = null, bindingTagsPath = null) {
    if (path == null) throw new Error();
    if (path.tag) throw new Error();
    if (!Tags.isValidPath(tagsPath)) throw new Error();
    // TODO make sure prop path attaches to tag node
    if (propertyTagsPath && !Tags.isValidPath(propertyTagsPath)) throw new Error();
    // TODO make sure binding path attaches to property node
    if (bindingTagsPath && !Tags.isValidPath(bindingTagsPath)) throw new Error();

    let propTag = Tags.getAt(tagsPath, path.node);

    if (propertyTagsPath && parseTagType(propTag) !== Property) throw new Error();

    let rawTag = propTag;

    if (propertyTagsPath) {
      rawTag = Tags.getAt(propertyTagsPath, rawTag);
    }

    if (bindingTagsPath) {
      rawTag = Tags.getAt(bindingTagsPath, rawTag);
    }

    let tag = parseTag(rawTag);

    if (tag == null) throw new Error();

    let tagsIndex = Tags.indexForPath(tagsPath, path.node);

    if (tagsIndex == null) throw new Error();

    let propertyIndex = propertyTagsPath && Tags.indexForPath(propertyTagsPath, propTag);

    if (propertyTagsPath && propertyIndex == null) throw new Error();

    this.path = path;
    this.tagsIndex = tagsIndex;
    this.tagsPath = tagsPath;
    this.propertyIndex = propertyIndex;
    this.propertyTagsPath = propertyTagsPath;
    this.bindingTagsPath = bindingTagsPath;

    this.node = path.node;
    this.tag = rawTag;

    freeze(this);
  }

  asPrimitive() {
    let { path, tagsIndex, propertyIndex } = this;

    // TODO perf hole!
    // we must incrementally cache the primitive path
    return freeze({ path: path.asPrimitive(), tagsIndex, propertyIndex });
  }

  get child() {
    return this.tag;
  }

  get type() {
    return parseTagType(this.tag);
  }

  get value() {
    return parseTag(this.tag).value;
  }

  get parentNode() {
    return this.path.parentNode;
  }

  get depth() {
    return this.path.depth;
  }

  get done() {
    return this.path.done;
  }

  atDepth(depth) {
    return this.path.atDepth(depth);
  }

  siblingAt(index) {
    return TagPath.from(this.path, index);
  }

  mapOnto(rootNode) {
    let path = this.path.mapOnto(rootNode);

    return TagPath.from(path, this.tagsIndex, this.propertyIndex);
  }

  get referenceTagPath() {
    let path = TagPath.from(this.path, this.tagsIndex, 0);
    if (path && path.propertyPath) {
      let { shift } = path.propertyPath.value;
      if (shift) {
        path = TagPath.from(this.path, this.tagsIndex - shift.index, 0);
      }
    }
    return path?.type === ReferenceTag ? path : null;
  }

  get nextProperty() {
    let { path, tagsIndex } = this;

    let nextChild = TagPath.from(path, tagsIndex + 1);

    return nextChild?.type === Property ? nextChild : null;
  }

  get nextSibling() {
    let { path, tagsIndex, propertyTagsPath, propertyIndex, bindingsIndex } = this;

    let propertyPath = TagPath.from(path, tagsIndex);

    let tagPath = null;
    do {
      if (tagsIndex === 0 || propertyIndex === 4) {
        tagsIndex++;
        propertyPath = TagPath.from(path, tagsIndex);
        propertyIndex = 0;

        if (!propertyPath) {
          return null;
        }

        if (propertyPath.type === CloseNodeTag) {
          return propertyPath;
        }
      } else if (propertyIndex == null) {
        propertyIndex = 0;
        tagsIndex++;
      } else if (propertyIndex === 0) {
        bindingsIndex = 0;
        ++propertyIndex;
      } else if (propertyIndex === 1) {
        if (bindingsIndex < Tags.getSize(propertyPath.value[1])) {
          ++bindingsIndex;
        } else {
          ++propertyIndex;
          bindingsIndex = 0;
        }
      } else {
        ++propertyIndex;
      }
      tagPath = TagPath.from(path, tagsIndex, propertyIndex, bindingsIndex);
    } while (tagPath && tagPath.tag === '');

    if (tagPath?.type === Property) throw new Error();

    return tagPath;
  }

  get previousSibling() {
    let { path, tagsIndex, propertyTagsPath } = this;

    if (!tagsIndex) return null;

    let propertyIndex0 = propertyTagsPath[0]?.index;

    let prevChildIndex = tagsIndex === 0 ? 0 : tagsIndex - 1 - 1;
    let prevChild = path.childAt(prevChildIndex);

    if (!prevChild) {
      return path.getOpenTagPath();
    }

    if (propertyIndex0) {
      if (propertyIndex0 > 0) {
        let property = path.childAt(tagsIndex - 1);
        let bindingsIndex = propertyTagsPath[1]?.index ?? property.value.bindings.length;
        let binding = path.getBindingTagPath(tagsIndex - 1, bindingsIndex - 1);
        if (binding) return binding;
      }

      let ref = path.getReferenceTagPath(tagsIndex - 1);
      if (ref) return ref;
    }

    return prevChild && prevChild.type === Property
      ? path.getNodeTagPath(tagsIndex - 1 - 1)
      : prevChild;
  }

  get next() {
    let { path, tagsIndex, propertyTagsPath, bindingTagsPath } = this;

    let propertyIndex = [...recordValues(propertyTagsPath)];
    let bindingsIndex = [...recordValues(bindingTagsPath)];

    let leaving = false;

    for (;;) {
      let rawTag = Tags.getAt(tagsIndex, path.node);
      let tag = parseTag(rawTag);
      let propTag = tag;
      let lastRef = null;
      let wasLeaving = leaving;
      leaving = false;

      if (!tag) return null;

      if (isObject(tag) && tag.type === Property && !wasLeaving) {
        if (propertyIndex.length === 0) {
          let { 0: ref, 1: bindings, 2: hash, 3: sums } = tag.value;

          let index = ref ? 0 : bindings ? 1 : hash ? 2 : sums ? 3 : 4;

          propertyIndex.push({ index, node: tag.value });
        }

        let tag_ = Tags.getAt(propertyIndex, tag.value);
        propTag = parseTag(tag_);

        if (propertyIndex.length === 1) {
          let { index, node } = propertyIndex[0];
          while ((!propTag || propTag.type === EmptyTag) && node[index + 1]) {
            propertyIndex[0] = { index: index + 1, node };
            propTag = node[index + 1];
            if (index === tag.length - 1) break;
            ({ index, node } = propertyIndex[0]);
          }
        }

        let lastRef_ = Tags.getAt([0], tag.value);
        lastRef = lastRef_ ? null : parseTag(lastRef_);
      }

      let isInitialTag =
        path.node === this.path.node &&
        tagsIndex === this.tagsIndex &&
        Tags.pathsEqual(propertyIndex, this.propertyTagsPath || freezeRecord([]));

      // done
      if (!isInitialTag && !isNodeTag(propTag) && propTag.type !== Property) {
        return TagPath.from(
          path,
          tagsIndex,
          propertyIndex.length ? propertyIndex : null,
          bindingsIndex,
        );
      }

      // in
      if (isNodeTag(propTag)) {
        path = path.push(tagsIndex);
        tagsIndex = 0;
        propertyIndex = [];
        continue;
      }

      // over
      let { nextSibling } = TagPath.from(
        path,
        tagsIndex,
        propertyIndex.length ? freeze([...arrayValues(propertyIndex)]) : null,
      );

      if (nextSibling) {
        ({ tagsIndex, propertyTagsPath, bindingTagsPath } = nextSibling);
        propertyIndex = [...recordValues(propertyTagsPath)];
        bindingsIndex = [...recordValues(bindingTagsPath)];
        continue;
      }

      // out
      if (path.parentIndex != null && path.parent) {
        tagsIndex = path.parentIndex;
        propertyIndex = [];
        path = path.parent;

        if (!path) return null;

        leaving = true;
        continue;
      }

      return null;
    }
  }

  get previous() {
    throw new Error('not implemented');
  }

  get propertyPath() {
    let { path, tagsIndex } = this;

    let tag = Tags.getAt(tagsIndex, path.node);

    return isString(tag) ? null : path.tagPathAt(tagsIndex);
  }

  get innerNode() {
    return this.inner?.node;
  }

  get inner() {
    let { tagsIndex, type } = this;

    let node;
    switch (type) {
      case Property: {
        node = this.tag[4] ?? null;
        break;
      }
      case GapNode:
      case NullNode:
      case TreeNode: {
        node = this.tag;
        break;
      }
      default:
        node = null;
    }
    return node && this.path.push(tagsIndex);
  }

  equalTo(tagPath) {
    return (
      this.node === tagPath?.node &&
      this.tagsIndex === tagPath.tagsIndex &&
      this.propertyIndex === tagPath.propertyIndex
    );
  }
}

freezeClass(TagPath);
