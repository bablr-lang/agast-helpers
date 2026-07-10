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
  AttributeDefinition,
  LiteralTag,
  TreeNode,
  NullNode,
  GapNode,
  HashTag,
  EscapeTag,
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
} from './object.js';
import {
  buildChild,
  buildProperty,
  buildNullTag,
  buildOpenNodeTag,
  buildShift,
  buildPropertyTag,
  buildPathFrame,
  buildBounds,
  parseOpenNodeTag,
  parseTag,
  parseTagType,
  buildTag,
  buildFullOpenNodeTag,
  parseObject,
  parseNodeFlags,
  buildLiteralTag,
} from './builders.js';
import { printObject, printTag } from './print.js';
import { arrayValues, map } from './iterable.js';
import { freezeRecord } from '@bablr/record';

let { hasOwn, freeze } = Object;
let { getTags } = Tags;

let arrayLast = (arr) => arr[arr.length - 1];

export const incrementShift = (shift) => {
  if (!shift) return buildShift(1, 3);

  return buildShift(shift.index + 1, shift.height + 1);
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

export const buildNode = (tags) => {
  let tags_ = tags;
  let sigilTag;
  if (isArray(tags_)) {
    if (!Number.isFinite(tags[0])) throw new Error();
    if (isArray(tags_[1][0]) && tags_[1][0][0] === 0) throw new Error();
    sigilTag = Tags.startsNode(tags_[1][1]) ? tags_[1][1] : '<__>';
  } else {
    if (!isString(tags) && !isSymbol(tags.type)) throw new Error();
    let tag = printTag(tags);

    tags_ = Tags.fromValues([null, tag === '<__>' ? null : tag], 1);
    sigilTag = tag;
  }

  if (tags_[1].length) {
    if (tags_[1] === '<__>') throw new Error();
    if (!Number.isFinite(tags_[0])) throw new Error();
    if (!isArray(tags_[1]) || !tags_[1].length) throw new Error();
  }

  let hashTag = tags_[1][0] || null;

  switch (parseTagType(sigilTag)) {
    case GapTag:
      return buildTag(GapNode, { tags: Tags.fromValues([hashTag, sigilTag], 1) });
    case NullTag:
      return buildTag(NullNode, { tags: Tags.fromValues([hashTag, sigilTag], 1) });
    case OpenNodeTag: {
      let { flags, type, name, attributes } = parseOpenNodeTag(sigilTag).value;

      let children = tags_[1][2] || Tags.empty();

      if (!Tags.isNode(children)) throw new Error();

      return freezeRecord({
        type: TreeNode,
        value: freezeRecord({
          flags,
          type,
          name,
          attributes: parseObject(attributes),
          tags: tags_,
          children,
          bounds: buildBoundsFromTags(tags_),
        }),
      });
    }
    default:
      throw new Error();
  }
};

let gapFrame = buildPathFrame(
  buildPropertyTag(BList.fromValues([null, null, buildNode('<//>')], 1)),
  null,
  true,
);

export const buildBoundsFromTags = (tags) => {
  let leading = BList.fromValues([gapFrame]);
  let trailing = leading;
  let firstProperty, lastProperty;
  let firstPropertyIndex, lastPropertyIndex;
  let children = tags[1][2];
  let lastTag = Tags.getAt(-1, tags);

  if (!lastTag || parseTagType(lastTag) !== CloseNodeTag || !children) {
    return buildBounds(leading, trailing);
  }

  for (let i = 0; i < Tags.getSize(children); i++) {
    let tag = Tags.getAt(i, children);

    if (parseTagType(tag) === Property && !isNullNode(tag.value.node)) {
      firstProperty = tag;
      firstPropertyIndex = i;
      break;
    }
  }

  for (let i = Tags.getSize(children) - 1; i >= 0; i--) {
    let tag = Tags.getAt(i, children);

    if (parseTagType(tag) === Property && !isNullNode(tag.value.node)) {
      lastProperty = tag;
      lastPropertyIndex = i;
      break;
    }
  }

  if (firstProperty && firstProperty.value.node.type === TreeNode) {
    leading = firstProperty.value.node.value.bounds.leading;

    let rootFrame = BList.getAt(1, leading);

    leading = BList.replaceAt(0, buildPathFrame(firstProperty), leading);
    if (rootFrame) {
      leading = BList.replaceAt(1, buildPathFrame(rootFrame.property, firstPropertyIndex), leading);
    }
    leading = BList.unshift(gapFrame, leading);
  }

  if (lastProperty && lastProperty.value.node.type === TreeNode) {
    if (!lastProperty.value.node) throw new Error();

    trailing = lastProperty.value.node.value.bounds.trailing;

    let rootFrame = BList.getAt(1, trailing);

    trailing = BList.replaceAt(0, buildPathFrame(lastProperty), trailing);
    if (rootFrame) {
      trailing = BList.replaceAt(
        1,
        buildPathFrame(rootFrame.property, lastPropertyIndex),
        trailing,
      );
    }
    trailing = BList.unshift(gapFrame, trailing);
  }

  return buildBounds(leading, trailing);
};

export const isNode = (value) => {
  return isObject(value) && [TreeNode, NullNode, GapNode].includes(value?.type);
};

export const propertyIsFull = (tag) => {
  if (isString(tag) || tag.type !== Property) return true;

  let { tags } = tag.value;

  return tags[1].length >= 3;
};

export const nodeIsComplete = (node) => {
  let openTag = getOpenTag(node);
  if (!openTag) return false;
  let sigilTag = parseTag(openTag);
  return sigilTag.type !== OpenNodeTag || sigilTag.value.selfClosing
    ? true
    : !!getCloseNodeTag(node);
};

export const offsetForTag = (tag) => {
  switch (isString(tag) ? parseTagType(tag) : tag) {
    case ReferenceTag:
    case ShiftTag:
      return [0];
    case BindingTag:
      return [1, -1];
    case TreeNode:
    case NullNode:
    case GapNode:
      return [2];
    default:
      return [];
  }
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
  let idx = Tags.getIndex(buildFullPathSegment('_', null), node.value.children);

  if (idx == null) return null;

  let tag = Tags.getAt(idx, getTags(node));

  if (isString(tag) || tag.type !== Property) throw new Error();
  return tag;
};

// TODO prevent infinite recursion
export const getRoot = (node, depth = Infinity) => {
  let node_ = node;
  let i = 0;

  while (isCover(node_) && i < depth) {
    node_ = getRootProperty(node_)?.value.node;
    i++;
  }

  return node_;
};

export const getSigilTag = (node) => {
  return node.value.type === Symbol.for('__') ? '<__>' : Tags.getValues(getTags(node))[1];
};

export const getOpenTag = (node) => {
  let tag = node.value.type === Symbol.for('__') ? '<__>' : Tags.getValues(getTags(node))[1];
  return parseTagType(tag) === OpenNodeTag ? tag : null;
};

export const getCloseNodeTag = (node) => {
  return Tags.getValues(getTags(node))[3];
};

export const isNullNode = (node) => {
  return node && getSigilTag(node) === NullTag;
};

export const isCover = (node) => {
  return node?.type === TreeNode && node.value.type === Symbol.for('_');
};

export const getChildren = (node) => {
  return node?.type === TreeNode ? node.value.children : [];
};

export const isFragment = (node) => {
  return node?.type === TreeNode && [Symbol.for('__'), Symbol.for('_')].includes(node.value.type);
};

export const isMultiFragment = (node) => {
  return node?.type === TreeNode && node.value.type === Symbol.for('__');
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
  for (let child of Tags.traverse(getTags(node))) {
    if (child.type === Property) {
      let ref = child.value.reference;
      if (!ref.flags.expression) {
        return child;
      } else {
        let tagsIndex = Tags.getIndex(
          buildFullPathSegment(ref.type, ref.name, 0, -1),
          node.value.tags,
        );
        return Tags.getAt(tagsIndex, getTags(node), 2)?.value;
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

  return Tags.findStats(name, Tags.getSums(getTags(node)).names);
};

export function* allTagPathsFor(range, options = freeze({})) {
  if (range == null) return;

  if (range[0] && !(range[0] instanceof TagPath)) throw new Error();
  if (range[1] && !(range[1] instanceof TagPath)) throw new Error();

  const { unshift = false } = options;
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
    path = unshift ? path.nextUnshifted : path.next;
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

export const buildNullNode = () => {
  return buildNode(buildNullTag());
};

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
  return node.type === TreeNode ? node.value.flags : null;
};

export const getAttributes = (node) => {
  return node.type === TreeNode ? node.value.attributes : freeze({});
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

export const Path = class AgastPath {
  static from(node) {
    return (
      node &&
      new Path(null, buildPathFrame(buildPropertyTag(BList.fromValues([null, null, node], 1))))
    );
  }

  static wrap(frames) {
    return new Path(null, frames);
  }

  static fromTag(openTag, hashTag) {
    return Path.from(buildNode(hashTag ? Tags.fromValues([hashTag, openTag]) : openTag));
  }

  static set(path, value, node) {
    return Path.from(node).replaceAt(path, value).node;
  }

  static get(path, node) {
    return Path.from(node).get(path).node;
  }

  constructor(parent, frame) {
    if (!frame) throw new Error();
    let frame_ = isArray(frame) ? BList.getAt(-1, frame) : frame;
    let { property, parentIndex, isGap } = frame_;
    let { node } = property.value;

    if (parent && parentIndex == null) throw new Error();
    if (!node || ![TreeNode, NullNode, GapNode].includes(node.type)) throw new Error();

    if (!node) throw new Error();
    if (!Object.isFrozen(frame_)) throw new Error();
    if (!Object.isFrozen(node)) throw new Error();
    if (isArray(node)) throw new Error();
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

    let parentTag = parentIndex == null ? null : Tags.getAt(parentIndex, getTags(parent_.node));

    if (parentTag && parentTag.type !== Property) {
      throw new Error();
    }

    if (
      parent_ &&
      (isGap
        ? BList.getAt(0, parent_.node.value.bounds.leading).property
        : parent_.tagPathAt(parentIndex).tag) !== property
    ) {
      throw new Error('Path not reachable');
    }

    if (!Number.isFinite(this.depth)) throw new Error();
  }

  asPrimitive() {
    return this.frames;
  }

  push(tagsIndex, isGap) {
    let tag = isGap
      ? BList.getAt(0, this.node.value.bounds.leading).property
      : tagsIndex != null
      ? Tags.getAt(tagsIndex, this.tags)
      : null;

    if (!tag || parseTagType(tag) !== Property) {
      return null;
    }

    return new Path(this, buildPathFrame(tag, tagsIndex, isGap));
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
    return this.frame.isGap;
  }

  get node() {
    return this.frame.property.value.node;
  }

  get value() {
    return this.node.value;
  }

  get name() {
    let { node } = this;
    return node.type === TreeNode ? node.value.name : null;
  }

  get type() {
    let { node } = this;
    return node.type === TreeNode ? node.value.type : null;
  }

  get flags() {
    let { node } = this;
    return node.type === TreeNode ? node.value.flags : null;
  }

  get attributes() {
    let { node } = this;
    return node.type === TreeNode ? node.value.attributes : null;
  }

  get tags() {
    return getTags(this.node);
  }

  get children() {
    let { node } = this;
    return node.type === TreeNode ? node.value.children : null;
  }

  childAt(childrenIndex, propertyIndex) {
    let { children } = this;
    let absChildrenIdx = childrenIndex < 0 ? Tags.getSize(children) + childrenIndex : childrenIndex;
    return TagPath.from(this, absChildrenIdx + 2, propertyIndex)?.child;
  }

  getSigilTagPath() {
    return TagPath.from(this, 0);
  }

  tagPathAt(tagsIndex, propertyIndex) {
    return TagPath.from(this, tagsIndex, propertyIndex);
  }

  tagAt(tagsIndex, propertyIndex) {
    return TagPath.from(this, tagsIndex, propertyIndex)?.tag;
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

  getBindingTagPath(childrenIndex, bindingIndex) {
    let { children } = this.node.value;
    let absChildrenIndex =
      childrenIndex < 0 ? Tags.getSize(children) + childrenIndex : childrenIndex;
    return this.tagPathAt(absChildrenIndex + 1, [1, bindingIndex]);
  }

  getNodeTagPath(childrenIndex) {
    let { children } = this.node.value;
    let absChildrenIndex =
      childrenIndex < 0 ? Tags.getSize(children) + childrenIndex : childrenIndex;
    return this.tagPathAt(absChildrenIndex + 1, [2]);
  }

  get openTagPath() {
    let tagPath = TagPath.from(this, 1);
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
    return this.parentPropertyPath?.tag.value.bindings;
  }

  get bindingTags() {
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
      path = TagPath.from(this.parent, this.parentIndex - path.value.shift.index);
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
    let path_ = typeof path === 'string' ? [path] : [...path];
    let pathInst = this;

    let skippedRootFragment = false;

    if (!(path.length && isObject(path[1]) && path[0].type === '_')) {
      while (!pathInst.node.value.name && pathInst.node.value.type === Symbol.for('_')) {
        if (pathInst.depth) throw new Error();
        skippedRootFragment = true;
        pathInst = pathInst.push(
          Tags.getIndex(buildFullPathSegment('_', null, 0), pathInst.node.value.children),
        );
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
        pathInst.node.value.tags,
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

    let targetShift_ = this.parent?.parentProperty?.value.tags[1][0];
    let targetShift = targetShift_ && (targetShift_.type === ReferenceTag ? null : targetShift_);
    let targetReference = this.reference;
    let targetBindings = bindings == null ? this.bindings : bindings;
    let targetParentIndex = this.parentIndex;
    let held = null;
    let heldCount = 0;
    let value;

    while (path) {
      value = built;
      built = buildNode(getTags(path.node));

      let { tags, shift } = Tags.getAt(targetParentIndex, getTags(path.node)).value;

      let firstTag = tags[1][0];
      let newFirstTag = firstTag;
      if (shift) {
        newFirstTag = printTag(buildChild(ReferenceTag, targetReference));
      }

      let tags_ = BList.fromValues(
        [
          firstTag,
          BList.fromValues(
            map(
              (binding) => printTag(buildChild(BindingTag, binding)),
              arrayValues(targetBindings),
            ),
          ),
          value,
        ],
        1,
      );

      if (!held && !shift) {
        built = buildNode(
          Tags.replaceAt(
            targetParentIndex,
            buildChild(Property, buildProperty(tags_)),
            built.value.tags,
          ),
        );
        replacementPath.push(targetParentIndex);
      } else {
        let i = targetParentIndex + 1;
        let nextProperty = Tags.getAt(i, built.value.tags);

        let nextShift = nextProperty?.type === Property && nextProperty.value.shift;

        if (nextShift) {
          let { reference, bindings } = BList.getAt(
            -1,
            nextProperty.value.node.value.bounds.leading,
          ).property.value;

          path = path.push(i);

          tags_ = BList.fromValues([newFirstTag, tags_[1][1], tags_[1][2]], 1);

          built = buildNode(
            Tags.replaceAt(
              targetParentIndex - shift.index,
              buildChild(Property, buildProperty(tags_, shift)),
              built.value.tags,
            ),
          );

          targetParentIndex -= shift.index;
          for (let i = shift.index - 1; i >= 0; i--) {
            built = buildNode(Tags.removeAt(targetParentIndex + 1, built.value.tags));
          }

          targetShift = null;
          targetReference = reference;
          targetBindings = bindings;
          targetParentIndex = Tags.getIndex(
            buildFullPathSegment(reference.type, reference.name, 0, 0),
            nextProperty.value.node.value.tags,
          );
          held = null;

          replacementPath.push(targetParentIndex);
          continue;
        } else {
          built = buildNode(
            Tags.replaceAt(
              targetParentIndex,
              buildChild(Property, buildProperty(tags_, shift)),
              getTags(built),
            ),
          );
          replacementPath.push(targetParentIndex);
        }
      }

      held = targetShift ? value : null;
      heldCount = held ? heldCount + 1 : 0;

      targetShift_ = path?.parentProperty?.value.tags[1][0];
      targetShift = targetShift_ && (targetShift_.type === ReferenceTag ? null : targetShift_);
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

  removeAt(path) {
    if (!this.depth && !path.length) {
      return null;
    }

    let built = null;
    let lastPath = this.get(path);
    let path_ = lastPath.parent;
    let replacementPath = [];

    let targetShift_ = lastPath.parent?.parentProperty?.value.tags[1][0];
    let targetShift = targetShift_ && (targetShift_.type === ReferenceTag ? null : targetShift_);
    let targetReference = lastPath.reference;
    let targetBindings = lastPath.bindings;
    let targetParentIndex = lastPath.parentIndex;
    let held = null;
    let heldCount = 0;
    let value;

    while (path_) {
      value = built;
      built = buildNode(getTags(path_.node));

      let { tags, shift } = Tags.getAt(targetParentIndex, getTags(path_.node)).value;

      let firstTag = tags[1][0];
      let newFirstTag = firstTag;
      if (shift) {
        newFirstTag = buildChild(ReferenceTag, targetReference);
      }

      let tags_ =
        value &&
        BList.fromValues(
          [
            firstTag,
            BList.fromValues(
              map(
                (binding) => printTag(buildChild(BindingTag, binding)),
                arrayValues(targetBindings),
              ),
            ),
            value,
          ],
          1,
        );

      if (!held && !shift) {
        if (tags_) {
          built = buildNode(
            Tags.replaceAt(
              targetParentIndex,
              buildChild(Property, buildProperty(tags_)),
              built.value.tags,
            ),
          );
        } else {
          built = buildNode(Tags.removeAt(targetParentIndex, built.value.tags));
        }
        replacementPath.push(targetParentIndex);
      } else {
        let i = targetParentIndex + 1;
        let nextProperty = Tags.getAt(i, built.value.tags);

        let nextShift = nextProperty?.type === Property && nextProperty.value.shift;

        if (nextShift) {
          let { reference, bindings } = BList.getAt(
            -1,
            nextProperty.value.node.value.bounds.leading,
          ).property.value;

          path_ = path_.push(i);

          built = buildNode(
            Tags.replaceAt(
              targetParentIndex - shift.index,
              buildChild(Property, buildProperty(tags_)),
              built.value.tags,
            ),
          );

          targetParentIndex -= shift.index;
          for (let i = shift.index - 1; i >= 0; i--) {
            built = buildNode(Tags.removeAt(targetParentIndex + 1, built.value.tags));
          }

          tags_ = BList.fromValues([newFirstTag, tags_[1][1], tags_[1][2]], 1);

          targetShift = null;
          targetReference = reference;
          targetBindings = bindings;
          targetParentIndex = Tags.getIndex(
            buildFullPathSegment(reference.type, reference.name, 0, 0),
            nextProperty.value.node.value.tags,
          );
          held = null;

          replacementPath.push(targetParentIndex);
          continue;
        } else {
          built = buildNode(
            Tags.replaceAt(
              targetParentIndex,
              buildChild(Property, buildProperty(tags_, shift)),
              getTags(built),
            ),
          );
          replacementPath.push(targetParentIndex);
        }
      }

      held = targetShift ? value : null;
      heldCount = held ? heldCount + 1 : 0;

      targetShift_ = path_?.parentProperty?.value.tags[1][0];
      targetShift = targetShift_ && (targetShift_.type === ReferenceTag ? null : targetShift_);
      targetReference = path_.reference;
      targetBindings = path_.bindings;
      targetParentIndex = path_.parentIndex;
      lastPath = path_;
      path_ = path_.parent;
    }

    return Path.from(built);
  }

  mapOnto(rootNode) {
    let path = Path.from(rootNode);

    for (let i = 1; i <= this.depth; i++) {
      let { parentIndex, isGap } = this.atDepth(i);
      path = path.push(parentIndex, isGap);
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

    return !parent && sigilTag && !!(isSelfClosingTag(sigilTag) || getCloseNodeTag(node));
  }

  get held() {
    let tagPath = this.tagPathAt(-1);

    // TODO is this safe
    if (tagPath.type !== Property) return null;

    let { tags } = tagPath.value;

    if (parseTagType(tags[1][0]) === ShiftTag && !tags[1][2]) {
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
    if (!tag) throw new Error();

    let tagPath = this.tagPathAt(-1, -1);

    if (tagPath?.nextSibling) throw new Error();

    if (this.done) throw new Error();

    let resultPath = this;

    let tag_ = isNode(tag) ? tag : parseTag(tag);

    if (tag_.type === LiteralTag) {
      for (let part of Tags.literalParts(tag_.value)) {
        resultPath = resultPath.advanceSingle(printTag(buildLiteralTag(part))).path;
      }
    } else if (tag_.type === Property) {
      resultPath = Path.from(buildNode(Tags.push(tag, getTags(resultPath.node))));
    } else if (tag_.type === TreeNode && tag_.value.type === Symbol.for('__')) {
      let existingProperty = tagPath;

      while (existingProperty?.type === AttributeDefinition) {
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

      let newPath = Path.from(buildNode(resultPath.node.value.tags));

      for (let tag of Tags.traverse(tag_.value.children)) {
        if (parseTagType(tag) === Property) {
          newPath = newPath.advance(tag);
        } else {
          newPath = newPath.advanceSingle(tag).path.atDepth(0);
        }
      }

      resultPath = resultPath.replaceWith(newPath.node);
    } else if (tag_.type === CloseNodeTag && resultPath.type === Symbol.for('__')) {
    } else {
      resultPath = resultPath.advanceSingle(tag).path;
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
    let tag_ = isString(tag) ? parseTag(tag) : tag;

    let tagPath = this.tagPathAt(-1, [-1, -1]);

    if (
      [TreeNode, NullNode, GapNode].includes(tagPath?.type) ? tagPath?.nextSibling : tagPath?.next
    )
      throw new Error();

    if (this.done) throw new Error();

    let targetPath = tagPath && Tags.endsNode(tagPath.tag) ? this.parent : this;

    switch (tag_.type) {
      case ReferenceTag: {
        let { type, name, flags } = tag_.value;

        if ([ReferenceTag, ShiftTag, BindingTag].includes(targetPath.tagPathAt(-1, -1)?.type))
          throw new Error('invalid location for reference');
        if (!name && !type) throw new Error();

        if (flags.hasGap && flags.intrinsic) throw new Error();
        if (type && !['_', '.', '#'].includes(type)) throw new Error();
        if (flags.array && ['_', '#'].includes(type)) throw new Error();
        if (getFlags(targetPath.node).token && type !== '.') throw new Error();
        if (targetPath.type !== Symbol.for('__')) {
          if (targetPath.open.type === Symbol.for('_') && name != null) throw new Error();
          if (targetPath.open.type === Symbol.for('_') && flags.hasGap) throw new Error();
          if (targetPath.open.type === Symbol.for('_') && !['_', '#'].includes(type))
            throw new Error();
        }

        if (tag_.value.name) {
          let property = getProperty(tag_.value.name, targetPath.node);
          if (
            getOr(null, tag_.value.name, targetPath.node) &&
            !property.value.shift &&
            !Tags.referencesAreEqual(tag_.value, property.value.reference)
          ) {
            throw new Error('mismatched references');
          }
        } else if (tag_.value.type === '_') {
          let rootIdx = Tags.getIndex(
            buildFullPathSegment('_', null, 0),
            targetPath.node.value.children,
          );

          if (
            rootIdx != null &&
            !Tags.referencesAreEqual(
              tag_.value,
              Tags.getAt(rootIdx, getTags(targetPath.node)).value.reference,
            )
          ) {
            throw new Error('mismatched references');
          }
        }

        let property = buildChild(Property, buildProperty(BList.fromValues([printTag(tag)])));

        targetPath = targetPath.replaceWith(
          buildNode(Tags.push(property, getTags(targetPath.node))),
        );
        break;
      }

      case BindingTag: {
        if (![ReferenceTag, ShiftTag].includes(parseTagType(this.tagPathAt(-1, -1)))) {
          throw new Error('Invalid location for BindingTag');
        }

        let refPath = this.tagPathAt(-1, 0);
        let propPath = TagPath.from(refPath.path, refPath.tagsIndex);

        let { shift } = propPath.value;

        if (![ReferenceTag, ShiftTag].includes(refPath.type)) throw new Error();

        if (refPath.type === ShiftTag) {
          refPath = TagPath.from(refPath.path, refPath.tagsIndex - shift.index, 0);
        }

        let { 0: firstTag, 1: bindingTags = BList.fromValues([]) } = propPath.value.tags[1];
        let tags = BList.fromValues([firstTag, BList.push(tag, bindingTags)], 1);
        let property = buildChild(Property, buildProperty(tags, shift));

        targetPath = this.replaceWith(
          buildNode(Tags.replaceAt(propPath.tagsIndex, property, getTags(this.node))),
        );
        break;
      }

      case OpenNodeTag: {
        let { literalValue, flags, type, name, attributes } = tag_.value;

        if (this.held && flags.token) throw new Error();

        if (type === Symbol.for('__')) {
          throw new Error();
        }

        let parentProp = this.node && Tags.getAt(-1, getChildren(this.node));

        if (parentProp && propertyIsFull(parentProp)) {
          parentProp = null;
        }

        let ref = parentProp?.value.shift
          ? this.node &&
            parseTag(
              Tags.getAt(-1 - parentProp.value.shift.index, getChildren(this.node)).value
                .tags[1][0],
            ).value
          : parentProp?.value.reference;

        let parentFlags = parentProp?.value.shift ? flags : this.node.value.flags;

        if (parentFlags.token) throw new Error();

        let node;
        if (literalValue && !flags.token) {
          let newOpenTag = buildFullOpenNodeTag(flags, type, name, null, attributes);
          let literalNode = Path.fromTag(
            buildFullOpenNodeTag(parseNodeFlags('*'), null, null, literalValue),
          ).node;

          node = Path.fromTag(newOpenTag).advance(literalNode).advance('</>').node;
        } else {
          node = buildNode(tag_);
        }

        targetPath = this.advanceSingle(node).path;
        targetPath = targetPath.tagPathAt(-1).inner;

        break;
      }

      case GapTag:
      case NullTag: {
        // if (getSigilTag(this.node)) throw new Error();
        if (parseTagType(this.tagPathAt(-1, 0)) !== ReferenceTag) {
          throw new Error('Invalid location for NullTag');
        }

        let node = buildNode(tag_);

        targetPath = this.advanceSingle(node).path;
        // targetPath = targetPath.tagPathAt(-1).inner; // ?

        break;
      }

      case CloseNodeTag: {
        let { node } = targetPath;

        let lastChild = targetPath.childAt(-1);

        if (isObject(lastChild) && lastChild?.type === Property && !propertyIsFull(lastChild))
          throw new Error();

        let openTag = parseTag(getOpenTag(node));

        if (openTag.value.selfClosing) throw new Error();

        if (openTag.value.type !== Symbol.for('__')) {
          targetPath = targetPath.replaceWith(buildNode(Tags.push(tag, getTags(node))));
        } else {
          throw new Error();
        }

        break;
      }

      case NullNode:
      case GapNode:
      case TreeNode: {
        let node = tag_;
        let parentPath = targetPath;
        let { node: parentNode } = parentPath;

        let tagPath = TagPath.from(parentPath, -1);

        if (isMultiFragment(node)) {
          throw new Error();
        }

        let shift = tagPath.type === Property ? tagPath.value.shift : undefined;
        let { held } = this;

        if (held) {
          // let heldProperty = this.tagPathAt(-2, 2).value;
          let matchesHeld = isGapNode(node);
          if (getRoot(node) && nodeIsComplete(node)) {
            matchesHeld ||=
              held.node === node ||
              held.node ===
                BList.getAt(
                  -BList.getSize(held.node.value.bounds.leading),
                  node.value.bounds.leading,
                ).property.value.node;
            if (!matchesHeld) {
              // TODO We're passing by the node that shifted if it's a cover!
              throw new Error();
            }
          }
        }

        if (propertyIsFull(tagPath.tag)) {
          let tags = BList.fromValues([null, null, node], 1);
          let property = buildChild(Property, buildProperty(tags, shift));

          targetPath = this.replaceWith(buildNode(Tags.push(property, parentNode.value.tags)));
        } else {
          let { 0: firstTag, 1: bindingTags = null } = tagPath.value.tags[1];
          let tags = BList.fromValues([firstTag, bindingTags, node], 1);
          let property = buildChild(Property, buildProperty(tags, shift));

          targetPath = this.replaceWith(
            buildNode(Tags.replaceAt(tagPath.tagsIndex, property, parentNode.value.tags)),
          );
        }

        break;
      }

      case AttributeDefinition: {
        if (this.held) throw new Error('invalid place for an attribute binding');

        let lastChild = this.childAt(-1);

        if (lastChild?.type === Property && !propertyIsFull(lastChild)) throw new Error();

        // add undefined attributes from value
        let { node } = this;
        if (tag_.type !== AttributeDefinition) throw new Error();

        let { path, value } = tag_.value;
        let openTag = parseTag(getOpenTag(node));
        let { attributes } = node.value;

        if (!objHas(attributes, path) && objGet(attributes, path) !== undefined)
          throw new Error('Can only define undefined attributes');

        if (value === undefined) throw new Error('cannot define attribute to undefined');

        let { flags, name } = openTag.value;
        attributes = immSet(attributes, path, value);
        let newOpenTag = buildOpenNodeTag(flags, name, null, printObject(attributes));

        targetPath = this.replaceWith(
          buildNode(Tags.push(tag, Tags.replaceAt(1, printTag(newOpenTag), getTags(node)))),
        );
        break;
      }

      case ShiftTag: {
        let lastPropertyTag = this.tagPathAt(-1).tag;

        if (lastPropertyTag.type !== Property) throw new Error();

        let { reference, shift: heldShift } = lastPropertyTag.value;

        if (!reference) {
          ({ reference } = this.tagPathAt(-1 - (heldShift?.index ?? 0)).value);
        }

        if (!reference.flags.expression && reference.type !== '_') throw new Error();

        let shift = heldShift
          ? buildShift(heldShift.index + 1, heldShift.height + 1)
          : buildShift(1, 3);

        let property = buildChild(Property, buildProperty(BList.fromValues([tag]), shift));

        targetPath = this.replaceWith(buildNode(Tags.push(property, this.node.value.tags)));
        break;
      }

      case LiteralTag:
        if (typeof tag_.value !== 'string') throw new Error();

        targetPath = this.replaceWith(buildNode(Tags.push(tag, this.node.value.tags)));
        break;

      case EscapeTag:
        if (typeof tag_.value.value !== 'string') throw new Error();

        targetPath = this.replaceWith(buildNode(Tags.push(tag, this.node.value.tags)));
        break;

      default:
        throw new Error();
    }

    return targetPath && TagPath.from(targetPath, -1, offsetForTag(tag_));
  }
};

freezeClass(Path);

export const tagPathsAreEqual = (a, b) => {
  if (a == null || b == null) return b == a;
  return a.path.node === b.path.node && a.tagsIndex === b.tagsIndex;
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
  static from(path, tagsIndex, propertyIndex) {
    let { tags, children } = path;
    let size = Tags.getSize(tags);
    let index = Number.isFinite(tagsIndex) && tagsIndex < 0 ? size + tagsIndex : tagsIndex;
    let propertyIndex_ = propertyIndex;
    let childrenIndex =
      children && index >= 2 && index < 2 + Tags.getSize(children) ? index - 2 : null;
    let propTag_ =
      childrenIndex != null ? Tags.getAt(childrenIndex, children) : Tags.getAt(index, tags);
    let propTag = propTag_ && !isArray(propTag_) && parseTag(propTag_);

    if (
      [OpenNodeTag, CloseNodeTag, LiteralTag, AttributeDefinition, GapTag, NullTag].includes(
        propTag?.type,
      )
    ) {
      propertyIndex_ = null;
    }

    let idx = null;
    if (propTag?.type === Property) {
      if (isArray(propertyIndex_)) {
        if (propertyIndex_.length) {
          idx = resolveIdx(propertyIndex_, propTag.value.tags);
        }
      } else if (propertyIndex_ != null) {
        let { tags } = propTag.value;
        let bindingsSize = Tags.getSize(tags[1][1]);
        let valuesSize = Tags.getValues(tags).length;
        let tagsSize = Tags.getSize(tags);
        let absoluteIndex = propertyIndex_ < 0 ? propertyIndex_ + tagsSize : propertyIndex_;

        let bindingsStop = bindingsSize;

        if (absoluteIndex === 0) {
          idx = [0];
        } else if (absoluteIndex > bindingsStop) {
          idx = [2];
        } else if (tags[1][1]) {
          let result = BList.findPath(absoluteIndex - 1, tags[1][1]).map(({ index }) => index);
          if (Number.isFinite(arrayLast(result))) {
            idx = [1].concat(result);
          }
        }
      }
    }

    idx ||= [];

    if (idx?.length) {
      let tag = Tags.getAt(idx, propTag.value.tags);
      if (isArray(tag)) {
        idx = [];
      }
    }

    freezeRecord(idx);

    let pathExists = isArray(propertyIndex_) && propertyIndex_?.length ? !!idx.length : propTag;

    return pathExists ? new TagPath(path, index, idx) : null;
  }

  static fromNode(node, tagsIndex = null, propertyIndex = null) {
    let sigilTag = Tags.getValues(getTags(node))[1];
    let tagsIndex_ = tagsIndex === null ? 1 : tagsIndex;

    if (tagsIndex === null && sigilTag === null) throw new Error();

    return TagPath.from(Path.from(node), tagsIndex_, propertyIndex);
  }

  static fromTag(openTag) {
    return TagPath.fromNode(buildNode(openTag));
  }

  static wrap(primitive) {
    if (!primitive) return null;

    let { path, tagsIndex, propertyIndex } = primitive;

    return TagPath.from(Path.wrap(path), tagsIndex, propertyIndex);
  }

  constructor(path, tagsIndex, propertyIndex) {
    if (path == null) throw new Error();
    if (path.tag) throw new Error();
    if (!Number.isFinite(tagsIndex) || tagsIndex < 0) throw new Error();
    if (!isArray(propertyIndex)) throw new Error();

    for (let index of recordValues(propertyIndex)) {
      if (!(index >= 0) || !Number.isFinite(index)) throw new Error();
    }

    let tag = Tags.getAt(tagsIndex, getTags(path.node));

    if (propertyIndex.length) {
      tag = Tags.getAt(propertyIndex, tag.value.tags);
    }

    if (tag == null || isArray(tag)) throw new Error();

    this.path = path;
    this.tagsIndex = tagsIndex;
    this.propertyIndex = propertyIndex;

    this.node = path.node;
    this.tag = tag;

    if (isObject(tag) && tag.type === Property && propertyIndex.length) throw new Error();

    freeze(this);
  }

  asPrimitive() {
    let { path, tagsIndex, propertyIndex } = this;

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
    let { path, tagsIndex, propertyIndex } = this;

    if (tagsIndex === 0) return TagPath.from(path, 1);

    let propertyIndex0 = propertyIndex[0];

    let nextChildIndex = tagsIndex - 1;
    let nextChild = path.childAt(nextChildIndex);

    if (propertyIndex0 == null && !nextChild) {
      return this.type === CloseNodeTag ? null : path.closeTagPath;
    }

    switch (propertyIndex0) {
      case 0:
      case 1: {
        let childIndex = tagsIndex - 1;
        let bindingIndex = propertyIndex[1] ?? -1; // TODO FIXME needs to be .slice
        let binding = path.getBindingTagPath(childIndex, bindingIndex + 1);
        if (binding) return binding;
        return path.getNodeTagPath(childIndex);
      }
      case 2:
      default: {
        if (!nextChild || nextChild.type !== Property || !propertyIndex.length) {
          return path.tagPathAt(tagsIndex + 1);
        } else {
          let ref = path.getReferenceTagPath(nextChildIndex);
          if (ref) return ref;
          let binding = path.getBindingTagPath(nextChildIndex, 0);
          if (binding) return binding;
          return path.getNodeTagPath(nextChildIndex);
        }
      }
    }
  }

  get previousSibling() {
    let { path, tagsIndex, propertyIndex } = this;

    let propertyIndex0 = propertyIndex[0]?.index;

    if (!tagsIndex) return null;

    let prevChildIndex = tagsIndex === 0 ? 0 : tagsIndex - 1 - 1;
    let prevChild = path.childAt(prevChildIndex);

    if (!prevChild) {
      return path.getOpenTagPath();
    }

    if (propertyIndex0) {
      if (propertyIndex0 > 0) {
        let property = path.childAt(tagsIndex - 1);
        let bindingIndex = propertyIndex[1]?.index ?? property.value.bindings.length;
        let binding = path.getBindingTagPath(tagsIndex - 1, bindingIndex - 1);
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
    let { path, tagsIndex, propertyIndex } = this;

    propertyIndex = [...recordValues(propertyIndex)];

    let leaving = false;

    for (;;) {
      let tag = parseTag(Tags.getAt(tagsIndex, getTags(path.node)));
      let propTag = tag;
      let lastRef = null;
      let wasLeaving = leaving;
      leaving = false;

      if (!tag) return null;

      if (isObject(tag) && tag.type === Property && !wasLeaving) {
        if (propertyIndex.length === 0) {
          let { 0: ref, 1: bindings } = tag.value.tags[1];

          let index = ref ? 0 : bindings ? 1 : 2;

          propertyIndex.push({ index, node: tag.value.tags });
        }

        if (propertyIndex != null) {
          let tag_ = Tags.getAt(propertyIndex, tag.value.tags);
          propTag = isNode(tag_) ? tag_ : parseTag(tag_);
          let lastRef_ = Tags.getAt([0], tag.value.tags);
          lastRef = lastRef_ ? null : parseTag(lastRef_);
        }
      }

      let isInitialTag =
        path.node === this.path.node &&
        tagsIndex === this.tagsIndex &&
        arraysEqual(propertyIndex, this.propertyIndex);

      // done
      if (!isInitialTag && !isNodeTag(propTag) && propTag.type !== Property) {
        return TagPath.from(path, tagsIndex, propertyIndex);
      }

      // in
      if (isNodeTag(propTag)) {
        let shiftPath = path;

        while (
          shiftPath.parent &&
          !Tags.getAt(shiftPath.parentIndex - 2, shiftPath.parent.node.value.children).value.shift
        ) {
          shiftPath = shiftPath.parent;
        }

        let isGap =
          path.parent &&
          tagsIndex === 2 &&
          shiftPath.parent &&
          Tags.getAt(shiftPath.parentIndex - 2, shiftPath.parent.node.value.children).value.shift &&
          tag.value.node ===
            Tags.getAt(shiftPath.parentIndex - 3, shiftPath.parent.node.value.children).value.node;

        path = path.push(tagsIndex, isGap);
        tagsIndex = parseTagType(path.tagAt(0)) === HashTag ? 0 : 1;
        propertyIndex = [];
        continue;
      }

      // over
      let { nextSibling } = TagPath.from(path, tagsIndex, freeze([...arrayValues(propertyIndex)]));

      if (nextSibling) {
        ({ tagsIndex, propertyIndex } = nextSibling);
        propertyIndex = [...arrayValues(propertyIndex)];
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

  get nextUnshifted() {
    let { path, tagsIndex, propertyIndex } = this;

    propertyIndex = [...arrayValues(propertyIndex)];

    let leaving = false;

    for (;;) {
      let tag = parseTag(Tags.getAt(tagsIndex, getTags(path.node)));
      let propTag = tag;
      let wasLeaving = leaving;
      leaving = false;

      if (!tag) return null;

      if (isObject(tag) && tag.type === Property) {
        if (propertyIndex.length === 0 && !leaving) {
          let { 0: ref, 1: bindings } = tag.value.tags[1];
          let index = ref ? 0 : bindings ? 1 : 2;
          propertyIndex.push({ index, node: tag.value.tags });
        }

        if (propertyIndex != null) {
          propTag = Tags.getAt(propertyIndex, tag.value.tags);
        }
      }

      if (isArray(propTag)) {
        if (Tags.getSize(propTag)) {
          // enter bindings array
          propertyIndex.push({ index: 0, node: propTag });
          propTag = propTag[propertyIndex[1].index];
        } else {
          propertyIndex = [{ index: propertyIndex[0].index + 1, node: tag }];
        }
        continue;
      } else if (isNodeTag(propTag) && !leaving) {
        path = path.push(tagsIndex);
        tagsIndex = parseTagType(path.tagPathAt(0)) === HashTag ? 0 : 1;
        propertyIndex = [];
        continue;
      }

      let isInitialTag =
        path.node === this.path.node &&
        tagsIndex === this.tagsIndex &&
        arraysEqual(propertyIndex, this.propertyIndex);

      if (!wasLeaving && parseTagType(propTag) === ReferenceTag) {
        // move past shifts

        let shifts = 0;
        let shiftedTag = Tags.getAt(tagsIndex + 1, getTags(path.node));

        while (shiftedTag?.type === Property && shiftedTag.value.shift) {
          shifts++;
          propertyIndex = [{ index: 1, node: shiftedTag.value.tags }];
          shiftedTag = Tags.getAt(tagsIndex + 1 + shifts, path.tags);
        }

        if (shifts) {
          tagsIndex += shifts;
          continue;
        }
      }

      // done
      if (!isInitialTag && !isNodeTag(propTag) && !isArray(propTag)) {
        return TagPath.from(path, tagsIndex, propertyIndex);
      }

      let { nextSibling } = TagPath.from(path, tagsIndex, propertyIndex);

      // over
      if (nextSibling) {
        ({ tagsIndex, propertyIndex } = nextSibling);
        propertyIndex = [...arrayValues(propertyIndex)];
        continue;
      }

      // out
      if (path.parentIndex != null) {
        do {
          tagsIndex = path.parentIndex + 1;

          path = path.parent;
          leaving = true;
          if (!path) return null;
        } while (tagsIndex == null);

        leaving = true;
        continue;
      }

      return null;
    }
  }

  get previous() {
    throw new Error('not implemented');
  }

  get previousUnshifted() {
    throw new Error('not implemented');
  }

  get propertyPath() {
    let { path, tagsIndex } = this;

    let tag = Tags.getAt(tagsIndex, getTags(path.node));

    return isObject(tag) && tag.type === Property ? path.tagPathAt(tagsIndex) : null;
  }

  get innerNode() {
    return this.inner?.node;
  }

  get inner() {
    let { tagsIndex, type } = this;

    let node;
    switch (type) {
      case Property: {
        ({ node } = this.tag.value);
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
      arraysEqual(this.propertyIndex, tagPath.propertyIndex)
    );
  }
}

freezeClass(TagPath);
