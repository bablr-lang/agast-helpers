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
} from './symbols.js';
import {
  immSet,
  isPlainObject,
  isString,
  has as objHas,
  get as objGet,
  isObject,
  isSymbol,
} from './object.js';
import {
  buildReferenceTag,
  buildChild,
  buildProperty,
  buildGapTag,
  buildNullTag,
  buildOpenNodeTag,
  buildShift,
  buildPropertyTag,
  buildPathFrame,
  buildBounds,
} from './builders.js';

let { hasOwn, freeze } = Object;
let { isArray } = Array;
let { getTags } = Tags;

let arrayLast = (arr) => arr[arr.length - 1];

export const incrementShift = (shift) => {
  if (!shift) return buildShift(1, 3);

  return buildShift(shift.index + 1, shift.height + 1);
};

export const finalizeNode = (node) => {
  freeze(node);
  freeze(node.value);

  return node;
};

export const buildNode = (tags) => {
  if (isArray(tags) && !Number.isFinite(tags[0])) throw new Error();
  if (!isArray(tags) && !isSymbol(tags.type)) throw new Error();
  let tags_ = isArray(tags) ? tags : Tags.fromValues([tags]);

  if (!Number.isFinite(tags_[0])) throw new Error();
  if (!isArray(tags_[1]) || !tags_[1].length) throw new Error();

  let openTag = tags_[1][0];
  if (![GapTag, NullTag, OpenNodeTag].includes(openTag.type)) throw new Error();
  // let tags = openTag ? Tags.fromValues([openTag]) : Tags.fromValues([]);

  if (openTag.type === GapTag) {
    return finalizeNode({
      type: GapNode,
      value: {
        tags: Tags.fromValues([openTag]),
      },
    });
  } else if (openTag.type === NullTag) {
    return finalizeNode({
      type: NullNode,
      value: { tags: Tags.fromValues([openTag]) },
    });
  } else if (openTag.type === OpenNodeTag) {
    return finalizeNode({
      type: TreeNode,
      value: {
        flags: openTag.value.flags,
        type: openTag.value.type,
        name: openTag.value.name,
        attributes: openTag.value.attributes,
        tags: tags_,
        children: tags_[1][1] || Tags.fromValues([]),
        bounds: buildBoundsFromTags(tags_),
      },
    });
  } else {
    throw new Error();
  }
};

export const buildBoundsFromTags = (tags) => {
  let gapFrame = buildPathFrame(
    buildPropertyTag(
      Tags.fromValues([buildReferenceTag(), Tags.fromValues([]), buildNode(buildGapTag())]),
    ),
    null,
    true,
  );

  let leading = BList.fromValues([gapFrame]);
  let trailing = leading;
  let firstProperty, lastProperty;
  let firstPropertyIndex, lastPropertyIndex;

  if (Tags.getAt(-1, tags)?.type !== CloseNodeTag) {
    return buildBounds(leading, trailing);
  }

  for (let i = 1; i < Tags.getSize(tags); i++) {
    let tag = Tags.getAt(i, tags);

    if (tag.type === Property && !isNullNode(tag.value.node)) {
      firstProperty = tag;
      firstPropertyIndex = i;
      break;
    }
  }

  for (let i = Tags.getSize(tags) - 2; i >= 0; i--) {
    let tag = Tags.getAt(i, tags);

    if (tag.type === Property && !isNullNode(tag.value.node)) {
      lastProperty = tag;
      lastPropertyIndex = i;
      break;
    }
  }

  if (firstProperty && firstProperty.value.node.type === TreeNode) {
    leading = firstProperty.value.node.value.bounds.leading;

    let rootFrame = BList.getAt(1, leading);

    leading = BList.replaceAt(0, leading, buildPathFrame(firstProperty));
    if (rootFrame) {
      leading = BList.replaceAt(1, leading, buildPathFrame(rootFrame.property, firstPropertyIndex));
    }
    leading = BList.unshift(gapFrame, leading);
  }

  if (lastProperty && lastProperty.value.node.type === TreeNode) {
    if (!lastProperty.value.node) throw new Error();

    trailing = lastProperty.value.node.value.bounds.trailing;

    let rootFrame = BList.getAt(1, trailing);

    trailing = BList.replaceAt(0, trailing, buildPathFrame(lastProperty));
    if (rootFrame) {
      trailing = BList.replaceAt(
        1,
        trailing,
        buildPathFrame(rootFrame.property, lastPropertyIndex),
      );
    }
    trailing = BList.unshift(gapFrame, trailing);
  }

  return buildBounds(leading, trailing);
};

export const isNode = (value) => {
  return [TreeNode, NullNode, GapNode].includes(value?.type);
};

export const endsNode = (tag) => {
  return (
    [CloseNodeTag, NullTag, GapTag].includes(tag.type) ||
    (tag.type === OpenNodeTag && tag.value.selfClosing)
  );
};

export const propertyIsFull = (tag) => {
  if (tag.type !== Property) return true;

  let { tags } = tag.value;

  return tags[1].length === 3;
};

export const nodeIsComplete = (node) => {
  let sigilTag = getOpenTag(node);
  return sigilTag.type !== OpenNodeTag || sigilTag.value.selfClosing ? true : !!getCloseTag(node);
};

export const offsetForTag = (tag) => {
  switch (tag.type) {
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
  let idx = Tags.getPropertyTagsIndex(node, '_', null);

  if (idx == null) return null;

  let tag = Tags.getAt(idx, getTags(node));

  if (tag.type !== Property) throw new Error();
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
  return Tags.getValues(getTags(node))[0];
};

export const getOpenTag = (node) => {
  let tag = Tags.getValues(getTags(node))[0];
  return tag.type === OpenNodeTag ? tag : null;
};

export const getCloseTag = (node) => {
  return Tags.getValues(getTags(node))[2];
};

export const isNullNode = (node) => {
  return node && Tags.getAt(0, getTags(node)).type === NullTag;
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
  return node && Tags.getAt(0, getTags(node)).type === GapTag;
};

export const isStubNode = (node) => {
  return node && [GapTag, NullTag].includes(Tags.getAt(0, getTags(node)).type);
};

export const isStubTag = (tag) => {
  return [GapTag, NullTag].includes(tag.type);
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
        let tagsIndex = Tags.getPropertyTagsIndex(node, ref.type, ref.name, 0, -1);
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

  let { name, type, index, shiftIndex } =
    typeof pathSegment === 'string' ? buildPathSegment(pathSegment) : pathSegment;

  let propIndex = Tags.getPropertyTagsIndex(node, type, name, index, shiftIndex);

  if (propIndex == null) return null;

  return Tags.getAt(propIndex, getTags(node));
};

export const has = (path, node) => {
  if (!isArray(path)) {
    path = [path];
  }

  let pathArr = [...path];
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

export function* allTagPathsFor(range, options = {}) {
  if (range == null) return;

  if (range[0] && !(range[0] instanceof TagPath)) throw new Error();
  if (range[1] && !(range[1] instanceof TagPath)) throw new Error();

  const { unshift = false } = options;
  let startPath = range[0];
  let endPath = range[1];
  let path = startPath;

  while (path) {
    if (path.inner && path.previousSibling.tag.type === ReferenceTag) {
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
      path.tag.type === CloseNodeTag &&
      gapPath &&
      gapPath.tagsIndex === endPath.tagsIndex &&
      gapPath.path.node === endPath.path.node
    ) {
      return;
    }
    path = unshift ? path.nextUnshifted : path.next;
  }
}

export function* allTagsFor(range, options = {}) {
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
  return tag.type === OpenNodeTag
    ? tag.value.selfClosing
    : [NullTag, GapTag].includes(tag.type)
    ? true
    : false;
};

let getSigilTag_ = (tag) => {
  switch (tag.type) {
    case Property:
      return getTags(tag.value.property.node)[1][0];
    case TreeNode:
    case NullNode:
    case GapNode:
      return getTags(tag)[1][0];
    case OpenNodeTag:
    case GapTag:
    case NullTag:
      return tag;
  }
};

const parents = new WeakMap();

export const Path = class AgastPath {
  static from(node) {
    return (
      node &&
      new Path(
        null,
        buildPathFrame(buildPropertyTag(Tags.fromValues([null, Tags.fromValues([]), node]))),
      )
    );
  }

  static wrap(frames) {
    return new Path(null, frames);
  }

  static fromTag(openTag) {
    return Path.from(buildNode(openTag));
  }

  static set(node, path, value) {
    return Path.from(node).replaceAt(path, value).node;
  }

  static get(node, path) {
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
      : BList.push(parent.frames, frame);

    buildSkips(this);

    freeze(this);

    let parent_ = this.parent;

    let parentTag = parentIndex == null ? null : Tags.getAt(parentIndex, getTags(parent_.node));

    if (parentTag && parentTag.type !== Property) {
      throw new Error();
    }

    if (
      parentIndex != null &&
      !parent?.node.value.flags.token &&
      (!this.referenceTag || ![ReferenceTag, ShiftTag].includes(this.referenceTag.type))
    ) {
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

    if (!tag || tag.type !== Property) {
      return null;
    }

    return new Path(this, buildPathFrame(tag, tagsIndex, isGap));
  }

  pushFrame(frame) {
    return new Path(this, frame);
  }

  get parent() {
    let { parentIndex, frames } = this;

    if (!parentIndex) return null;

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

  getChild(childrenIndex) {
    let { node } = this;
    if (isStubNode(node)) return null;
    return Tags.getAt(childrenIndex, getChildren(node)) || null;
  }

  getSigilTagPath() {
    return TagPath.from(this, 0);
  }

  tagPathAt(tagsIndex, propertyIndex) {
    return TagPath.from(this, tagsIndex, propertyIndex);
  }

  getPropertyTagPath(childrenIndex) {
    let tagPath = this.tagPathAt(childrenIndex + 1);
    return tagPath && tagPath.tag.type === Property ? tagPath : null;
  }

  getReferenceTagPath(childrenIndex) {
    return this.tagPathAt(childrenIndex + 1, [0]);
  }

  // getBindings(childrenIndex) {
  //   let property = this.getPropertyTagPath(childrenIndex);
  //   return property && Tags.getAt([1], property.value.tags);
  // }

  getBindingTagPath(childrenIndex, bindingIndex) {
    return this.tagPathAt(childrenIndex + 1, [1, bindingIndex]);
  }

  getNodeTagPath(childrenIndex) {
    return this.tagPathAt(childrenIndex + 1, [2]);
  }

  getHashTagPath(childrenIndex) {
    return this.tagPathAt(childrenIndex + 1, [3]);
  }

  get openTagPath() {
    let tagPath = TagPath.from(this, 0);
    return tagPath.tag.type === OpenNodeTag ? tagPath : null;
  }

  get closeTagPath() {
    let tagPath = TagPath.from(this, -1);
    return tagPath.tag.type === CloseNodeTag ? tagPath : null;
  }

  get openTag() {
    return this.openTagPath.tag;
  }

  get open() {
    return this.openTag.value;
  }

  get closeTag() {
    return this.closeTagPath.tag;
  }

  get bindings() {
    return this.parentPropertyPath?.tag.value.bindings;
  }

  get bindingTags() {
    return this.parentPropertyPath?.tag.value.tags[1][1];
  }

  get reference() {
    return this.referenceTag?.value ?? null;
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
    if (path.tag.type === ShiftTag) {
      path = TagPath.from(this.parent, this.parentIndex - path.tag.value.index);
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
    let tagPath = this.tagPathAt(0);
    while (tagPath && (!tagPath.propertyPath || isNullNode(tagPath.propertyPath.tag.value.node))) {
      tagPath = tagPath.nextSibling;
      if (tagPath?.propertyPath) {
        tagPath = tagPath.propertyPath;
      }
    }
    return tagPath;
  }

  get lastPropertyTagPath() {
    let tagPath = this.tagPathAt(-1);
    while (tagPath && (!tagPath.propertyPath || isNullNode(tagPath.propertyPath.tag.value.node))) {
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
        pathInst = pathInst.push(Tags.getPropertyTagsIndex(pathInst.node, '_', null, 0));
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

      let tagsIndex = Tags.getPropertyTagsIndex(
        pathInst.node,
        seg.type,
        seg.name,
        seg.index,
        seg.shiftIndex,
      );

      if (tagsIndex == null) return null;

      pathInst = pathInst.push(tagsIndex);
    }

    return pathInst;
  }

  replaceWith(node, bindingTags) {
    let bindings = bindingTags?.map((tag) => tag.value); // TODO improve here
    if (bindings != null && !isArray(bindings)) throw new Error();
    if (!isPlainObject(node)) throw new Error();

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
        newFirstTag = buildChild(ReferenceTag, targetReference);
      }

      let tags_ = Tags.fromValues([
        firstTag,
        Tags.fromValues(targetBindings.map((binding) => buildChild(BindingTag, binding))),
        value,
      ]);

      if (!held && !shift) {
        built = buildNode(
          Tags.replaceAt(
            targetParentIndex,
            built.value.tags,
            buildChild(Property, buildProperty(tags_)),
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

          built = buildNode(
            Tags.replaceAt(
              targetParentIndex - shift.index,
              built.value.tags,
              buildChild(Property, buildProperty(tags_)),
            ),
          );

          targetParentIndex -= shift.index;
          for (let i = shift.index - 1; i >= 0; i--) {
            built = buildNode(Tags.removeAt(targetParentIndex + 1, built.value.tags));
          }

          tags_ = Tags.fromValues([newFirstTag, tags_[1][1], tags_[1][2]]);

          targetShift = null;
          targetReference = reference;
          targetBindings = bindings;
          targetParentIndex = Tags.getPropertyTagsIndex(
            nextProperty.value.node,
            reference.type,
            reference.name,
            0,
            0,
          );
          held = null;

          replacementPath.push(targetParentIndex);
          continue;
        } else {
          built = buildNode(
            Tags.replaceAt(
              targetParentIndex,
              getTags(built),
              buildChild(Property, buildProperty(tags_, shift)),
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
    return this.get(path).replaceWith(node, bindings).atDepth(0);
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

    return !parent && sigilTag && !!(isSelfClosingTag(sigilTag) || getCloseTag(node));
  }

  get held() {
    let tagPath = this.tagPathAt(-1);

    // TODO is this safe
    if (tagPath.tag.type !== Property) return null;

    let { tags } = tagPath.tag.value;

    if (tags[1][0]?.type === ShiftTag && !tags[1][2]) {
      return TagPath.from(tagPath.path, tagPath.tagsIndex - 1).tag.value;
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

      if (refPath?.tag.type === ShiftTag) {
        return TagPath.from(refPath.path, refPath.tagsIndex - 1).tag.value;
      }

      coverParent = coverParent.parent;
      if (coverParent?.node.type !== Symbol.for('_')) break;
    }

    return null;
  }

  advance(tag) {
    if (!tag) throw new Error();

    let tagPath = this.tagPathAt(-1, -1);

    if (tagPath?.tag.type === Property ? tagPath?.nextSibling : tagPath?.next) throw new Error();

    if (this.done) throw new Error();

    let resultPath = this;

    switch (tag.type) {
      case BindingTag: {
        if (!this.lastPropertyTagPath) {
          resultPath = this.advanceUnwrapped(buildReferenceTag()).path;
        }
        break;
      }

      case TreeNode:
      case NullNode:
      case GapNode:
      case NullTag:
      case GapTag:
      case OpenNodeTag: {
        let sigilTag = getSigilTag_(tag);

        if (sigilTag.type === OpenNodeTag && sigilTag.value.type === Symbol.for('__')) {
          break;
        }

        let lastTagPath = this.lastPropertyTagPath;
        let newProperty = !lastTagPath || propertyIsFull(lastTagPath.tag);
        let reference = lastTagPath?.referenceTagPath.tag.value;

        // TODO revisit this condition
        if (!getFlags(this.node)?.token || reference?.type === '@' || tag.type === GapTag) {
          if (newProperty || !lastTagPath.tag.value.tags.length) {
            resultPath = this.advanceUnwrapped(buildReferenceTag()).path;
          }
        }

        break;
      }
    }

    if (tag.type === Property) {
      resultPath = Path.from(buildNode(Tags.push(getTags(resultPath.node), tag)));
    } else {
      resultPath = resultPath.advanceUnwrapped(tag).path;
    }

    if (
      (tag.type === CloseNodeTag || (tag.type === OpenNodeTag && tag.value.selfClosing)) &&
      resultPath.depth
    ) {
      return resultPath.parent;
    }

    return resultPath;
  }

  advanceUnwrapped(tag) {
    if (!tag) throw new Error();

    let tagPath = this.tagPathAt(-1, [-1, -1]);

    if (
      [TreeNode, NullNode, GapNode].includes(tagPath?.tag.type)
        ? tagPath?.nextSibling
        : tagPath?.next
    )
      throw new Error();

    if (this.done) throw new Error();

    let targetPath = tagPath && endsNode(tagPath.tag) ? this.parent : this;

    switch (tag.type) {
      case ReferenceTag: {
        let { type, name, flags } = tag.value;

        if ([ReferenceTag, ShiftTag, BindingTag].includes(targetPath.tagPathAt(-1, -1)?.tag.type))
          throw new Error('invalid location for reference');
        if (!name && !type) throw new Error();

        if (flags.hasGap && flags.intrinsic) throw new Error();
        if (type && !['_', '.', '#', '@'].includes(type)) throw new Error();
        if (flags.array && ['_', '#', '@'].includes(type)) throw new Error();
        if (getFlags(targetPath.node).token && !['@', '.'].includes(type)) throw new Error();
        if (targetPath.open.type === Symbol.for('_') && name != null) throw new Error();
        if (targetPath.open.type === Symbol.for('_') && flags.hasGap) throw new Error();
        if (targetPath.open.type === Symbol.for('_') && !['_', '#'].includes(type))
          throw new Error();

        if (tag.value.name) {
          let property = getProperty(tag.value.name, targetPath.node);
          if (
            getOr(null, tag.value.name, targetPath.node) &&
            !property.value.shift &&
            !Tags.referencesAreEqual(tag.value, property.value.reference)
          ) {
            throw new Error('mismatched references');
          }
        } else if (tag.value.type === '_') {
          let rootIdx = Tags.getPropertyTagsIndex(targetPath.node, '_', null, 0);

          if (
            rootIdx != null &&
            !Tags.referencesAreEqual(
              tag.value,
              Tags.getAt(rootIdx, getTags(targetPath.node)).value.reference,
            )
          ) {
            throw new Error('mismatched references');
          }
        }

        let property = buildChild(Property, buildProperty(Tags.fromValues([tag])));

        targetPath = targetPath.replaceWith(
          buildNode(Tags.push(getTags(targetPath.node), property)),
        );
        break;
      }

      case BindingTag: {
        if (![ReferenceTag, ShiftTag].includes(this.tagPathAt(-1, -1).tag.type)) {
          throw new Error('Invalid location for BindingTag');
        }
        if (!tag.value.segments) throw new Error();

        let refPath = this.tagPathAt(-1, 0);
        let propPath = TagPath.from(refPath.path, refPath.tagsIndex);

        let { shift } = propPath.tag.value;

        if (![ReferenceTag, ShiftTag].includes(refPath.tag.type)) throw new Error();

        if (refPath.tag.type === ShiftTag) {
          refPath = TagPath.from(refPath.path, refPath.tagsIndex - shift.index, 0);
        }

        let { 0: firstTag, 1: bindingTags = [] } = propPath.tag.value.tags[1];
        let tags = Tags.fromValues([firstTag, Tags.from(...bindingTags, tag)]);
        let property = buildChild(Property, buildProperty(tags, shift));

        targetPath = this.replaceWith(
          buildNode(Tags.replaceAt(propPath.tagsIndex, getTags(this.node), property)),
        );
        break;
      }

      case OpenNodeTag: {
        let { literalValue, flags, type } = tag.value;

        if (this.held && flags.token) throw new Error();

        if (type === Symbol.for('__')) {
          throw new Error('not implemented');
        }

        let parentProp = this.node && Tags.getAt(-1, getChildren(this.node));
        let ref = parentProp.value.shift
          ? this.node &&
            Tags.getAt(-1 - parentProp.value.shift.index, getChildren(this.node)).value.tags[1][0]
              .value
          : parentProp.value.reference;

        if (this.node.value.flags.token && ref.type !== '@') throw new Error();

        let node = buildNode(tag);

        if (literalValue && !flags.token) {
          throw new Error();
        }

        targetPath = this.advanceUnwrapped(node).path;

        targetPath = targetPath.tagPathAt(-1).inner;

        break;
      }

      case GapTag:
      case NullTag: {
        // if (getSigilTag(this.node)) throw new Error();
        if (this.tagPathAt(-1, 0).tag.type !== ReferenceTag) {
          throw new Error('Invalid location for NullTag');
        }

        let node = buildNode(tag);

        targetPath = this.advanceUnwrapped(node).path;
        // targetPath = targetPath.tagPathAt(-1).inner; // ?

        break;
      }

      case CloseNodeTag: {
        let { node } = targetPath;

        let lastChild = targetPath.getChild(-1);

        if (lastChild?.type === Property && !propertyIsFull(lastChild)) throw new Error();

        let openTag = getOpenTag(node);

        if (!openTag) throw new Error();
        if (openTag.value.selfClosing) throw new Error();

        targetPath = targetPath.replaceWith(buildNode(Tags.push(getTags(node), tag)));
        break;
      }

      case NullNode:
      case GapNode:
      case TreeNode: {
        let node = tag;
        let parentPath = targetPath;
        let { node: parentNode } = parentPath;

        let tagPath = TagPath.from(parentPath, -1);

        if (isMultiFragment(node)) {
          let existingProperty = tagPath;

          while (existingProperty?.tag.type === AttributeDefinition) {
            existingProperty = tagPath.siblingAt(existingProperty.tagsIndex - 1);
          }

          if (
            existingProperty.tag.type !== OpenNodeTag &&
            existingProperty.tag &&
            !propertyIsFull(existingProperty.tag)
          ) {
            throw new Error();
          }

          let newPath = Path.from(buildNode(this.node.value.tags));

          for (let tag of Tags.traverse(node.value.children)) {
            if (tag.type === Property) {
              newPath = newPath.advance(tag);
            } else {
              newPath = newPath.advanceUnwrapped(tag).path.atDepth(0);
            }
          }

          targetPath = this.replaceWith(newPath.node);
          break;
        }

        let shift = tagPath.tag.type === Property ? tagPath.tag.value.shift : undefined;
        let { held } = this;

        if (held) {
          // let heldProperty = this.tagPathAt(-2, 2).tag.value;
          let matchesHeld = isGapNode(node);
          if (getRoot(node) && nodeIsComplete(node)) {
            matchesHeld =
              matchesHeld ||
              isGapNode(node) ||
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
          let tags = Tags.fromValues([null, Tags.fromValues([]), node]);
          let property = buildChild(Property, buildProperty(tags, shift));

          targetPath = this.replaceWith(buildNode(Tags.push(parentNode.value.tags, property)));
        } else {
          let { 0: firstTag, 1: bindingTags = Tags.fromValues([]) } = tagPath.tag.value.tags[1];
          let tags = Tags.fromValues([firstTag, bindingTags, node]);
          let property = buildChild(Property, buildProperty(tags, shift));

          targetPath = this.replaceWith(
            buildNode(Tags.replaceAt(tagPath.tagsIndex, parentNode.value.tags, property)),
          );
        }

        break;
      }

      case AttributeDefinition: {
        if (this.held) throw new Error('invalid place for an attribute binding');

        let lastChild = this.getChild(-1);

        if (lastChild?.type === Property && !propertyIsFull(lastChild)) throw new Error();

        // add undefined attributes from value
        let { node } = this;
        if (tag.type !== AttributeDefinition) throw new Error();

        let { path, value } = tag.value;
        let openTag = getOpenTag(node);
        let { attributes } = node.value;

        if (!objHas(attributes, path) && objGet(attributes, path) !== undefined)
          throw new Error('Can only define undefined attributes');

        if (value === undefined) throw new Error('cannot define attribute to undefined');

        let { flags, name } = openTag.value;
        attributes = immSet(attributes, path, value);
        let newOpenTag = buildOpenNodeTag(flags, name, null, attributes);

        targetPath = this.replaceWith(
          buildNode(Tags.push(Tags.replaceAt(0, getTags(node), newOpenTag), tag)),
        );
        break;
      }

      case ShiftTag: {
        let lastPropertyTag = this.tagPathAt(-1).tag;

        if (lastPropertyTag.type !== Property) throw new Error();

        let { reference, shift: heldShift } = lastPropertyTag.value;

        if (!reference) {
          ({ reference } = this.tagPathAt(-1 - (heldShift?.index ?? 0)).tag.value);
        }

        if (!reference.flags.expression && reference.type !== '_') throw new Error();

        let shift = heldShift
          ? buildShift(heldShift.index + 1, heldShift.height + 1)
          : buildShift(1, 3);

        let property = buildChild(Property, buildProperty(Tags.fromValues([tag]), shift));

        targetPath = this.replaceWith(buildNode(Tags.push(this.node.value.tags, property)));
        break;
      }

      case LiteralTag:
        if (typeof tag.value !== 'string') throw new Error();

        targetPath = this.replaceWith(buildNode(Tags.push(this.node.value.tags, tag)));
        break;

      default:
        throw new Error();
    }

    return targetPath && TagPath.from(targetPath, -1, offsetForTag(tag));
  }
};

freeze(Path.prototype);

export const tagPathsAreEqual = (a, b) => {
  if (a == null || b == null) return b == a;
  return a.path.node === b.path.node && a.tagsIndex === b.tagsIndex;
};

export class TagPath {
  static from(path, tagsIndex, propertyIndex) {
    let tags = getTags(path.node);
    let size = Tags.getSize(tags);
    let index = Number.isFinite(tagsIndex) && tagsIndex < 0 ? size + tagsIndex : tagsIndex;
    let propertyIndex_ = propertyIndex;
    let propTag = Tags.getAt(index, tags);
    let pathExists = false;

    if (
      [OpenNodeTag, CloseNodeTag, LiteralTag, AttributeDefinition, GapTag, NullTag].includes(
        propTag?.type,
      )
    ) {
      propertyIndex_ = null;
      pathExists = true;
    } else if (isArray(propertyIndex) ? !propertyIndex.length : propertyIndex == null) {
      pathExists = !!propTag;
    }

    let resolvedPropertyIndex =
      propTag && propertyIndex_ != null ? Tags.findPath(propertyIndex_, propTag.value.tags) : [];

    if (resolvedPropertyIndex?.length && Number.isFinite(arrayLast(resolvedPropertyIndex).index)) {
      pathExists = true;
    }

    return pathExists ? new TagPath(path, index, resolvedPropertyIndex) : null;
  }

  static fromNode(node, tagsIndex, propertyIndex) {
    return TagPath.from(Path.from(node), tagsIndex, propertyIndex);
  }

  static fromTag(openTag) {
    return TagPath.fromNode(buildNode(openTag), 0);
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

    let propertyIndex_ = freeze([...propertyIndex]);

    for (let segment of propertyIndex_) {
      freeze(segment);
    }

    let tag = Tags.getAt(tagsIndex, getTags(path.node));

    if (propertyIndex_.length) {
      tag = Tags.getAt(propertyIndex_, tag.value.tags);
    }

    if (tag == null || isArray(tag)) throw new Error();

    for (let segment of propertyIndex_) {
      if (!isPlainObject(segment) || !(segment.index === 0 || segment.index > 0)) throw new Error();
    }

    this.path = path;
    this.tagsIndex = tagsIndex;
    this.propertyIndex = propertyIndex_;

    this.node = path.node;
    this.tag = tag;

    if (tag.type === Property && propertyIndex_.length) throw new Error();

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
    return this.tag.type;
  }

  get value() {
    return this.tag.value;
  }

  get parentNode() {
    return this.path.parentNode;
  }

  get depth() {
    return this.path.depth;
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
      let { shift } = path.propertyPath.tag.value;
      if (shift) {
        path = TagPath.from(this.path, this.tagsIndex - shift.index, 0);
      }
    }
    return path?.tag.type === ReferenceTag ? path : null;
  }

  get nextProperty() {
    let { path, tagsIndex } = this;

    let nextChild = TagPath.from(path, tagsIndex + 1);

    return nextChild?.tag.type === Property ? nextChild : null;
  }

  get nextSibling() {
    let { path, tagsIndex, propertyIndex } = this;

    let propertyIndex0 = propertyIndex[0]?.index;

    let nextChildIndex = tagsIndex === 0 ? 0 : tagsIndex - 1 + 1;
    let nextChild = path.getChild(nextChildIndex);

    if (propertyIndex0 == null && !nextChild) {
      return this.tag.type === CloseNodeTag ? null : path.closeTagPath;
    }

    switch (propertyIndex0) {
      case 0:
      case 1: {
        let childIndex = tagsIndex - 1;
        let bindingIndex = propertyIndex[1]?.index ?? -1;
        let binding = path.getBindingTagPath(childIndex, bindingIndex + 1);
        if (binding) return binding;
        return path.getNodeTagPath(childIndex);
      }
      case 2:
      default: {
        if (!nextChild || nextChild.type !== Property) {
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
    let prevChild = path.getChild(prevChildIndex);

    if (!prevChild) {
      return path.getOpenTagPath();
    }

    if (propertyIndex0) {
      if (propertyIndex0 > 0) {
        let property = path.getChild(tagsIndex - 1);
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

    propertyIndex = [...propertyIndex];

    let leaving = false;

    for (;;) {
      let tag = Tags.getAt(tagsIndex, getTags(path.node));
      let propTag = tag;
      let lastRef = null;
      leaving = false;

      if (!tag) return null;

      if (tag.type === Property) {
        if (propertyIndex.length === 0 && !leaving) {
          propertyIndex.push({ index: 0, node: tag.value.tags });
        }

        if (propertyIndex != null) {
          propTag = Tags.getAt(propertyIndex, tag.value.tags);
          lastRef = Tags.getAt(0, tag.value.tags);
        }
      }

      if (isArray(propTag)) {
        if (propTag.length) {
          // enter bindings array
          propertyIndex.push({ index: 0, node: propTag });
          propTag = propTag[propertyIndex[1].index];
        } else {
          propertyIndex = [{ index: propertyIndex[0].index + 1, node: tag }];
        }
        continue;
      }

      let isInitialTag =
        path.node === this.path.node &&
        tagsIndex === this.tagsIndex &&
        arraysEqual(propertyIndex, this.propertyIndex);

      // done
      if (!isInitialTag && !isNodeTag(propTag)) {
        return TagPath.from(path, tagsIndex, propertyIndex);
      }

      // shift
      if (propTag.type === BindingTag && lastRef.type === ShiftTag) {
        let lastProp = Tags.getAt(tagsIndex, path.tags);
        let { shift } = lastProp.value;
        let refIndex = tagsIndex - shift.index;
        if (refIndex < 0) throw new Error();
        let refTag = Tags.getAt(refIndex, path.tags, 0);

        if (refTag.type !== ReferenceTag) throw new Error();

        let { node } = tag.value;
        if (!node) return null;

        path = new Path(path, tagsIndex);

        if (!path) return null;

        tagsIndex = 0;
        propertyIndex = [];
        continue;
      }

      let { nextSibling } = this;

      // over
      if (nextSibling) {
        ({ tagsIndex, propertyIndex } = nextSibling);
        // in
        if (isNodeTag(nextSibling.tag)) {
          let shiftPath = path;

          while (
            shiftPath.parent &&
            !Tags.getAt(shiftPath.parentIndex - 1, shiftPath.parent.node.value.children).value.shift
          ) {
            shiftPath = shiftPath.parent;
          }

          let isGap =
            path.parent &&
            tagsIndex === 1 &&
            shiftPath.parent &&
            Tags.getAt(shiftPath.parentIndex - 1, shiftPath.parent.node.value.children).value
              .shift &&
            tag.value.node ===
              Tags.getAt(shiftPath.parentIndex - 2, shiftPath.parent.node.value.children).value
                .node;

          path = path.push(tagsIndex, isGap);
          tagsIndex = 0;
          propertyIndex = [];
          continue;
        } else {
          return nextSibling;
        }
      }

      // out
      if (path.parentIndex != null && path.parent) {
        do {
          if (
            path.coverBoundary.parent &&
            Tags.getAt(
              [path.coverBoundary.parentIndex, 0],
              path.coverBoundary.parent.node.value.tags,
            )?.type === ShiftTag
          ) {
            // while
            tagsIndex =
              Tags.getSize(path.parent.node.value.tags) > path.parentIndex + 1
                ? path.parentIndex + 1
                : null;
          } else {
            tagsIndex = path.parentIndex + 1;
          }

          propertyIndex = [];
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

  get nextUnshifted() {
    let { path, tagsIndex, propertyIndex } = this;

    propertyIndex = [...propertyIndex];

    let leaving = false;

    for (;;) {
      let tag = Tags.getAt(tagsIndex, getTags(path.node));
      let propTag = tag;
      let wasLeaving = leaving;
      leaving = false;

      if (!tag) return null;

      if (tag.type === Property) {
        if (propertyIndex.length === 0 && !leaving) {
          propertyIndex.push({ index: 0, node: tag.value.tags });
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
        tagsIndex = 0;
        propertyIndex = [];
        continue;
      }

      let isInitialTag =
        path.node === this.path.node &&
        tagsIndex === this.tagsIndex &&
        arraysEqual(propertyIndex, this.propertyIndex);

      if (!wasLeaving && propTag.type === ReferenceTag) {
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

    return tag.type === Property ? path.tagPathAt(tagsIndex) : null;
  }

  get innerNode() {
    return this.inner?.node;
  }

  get inner() {
    let { tagsIndex, tag } = this;

    let node;
    switch (tag.type) {
      case Property: {
        ({ node } = tag.value);
        break;
      }
      case GapNode:
      case NullNode:
      case TreeNode: {
        node = tag;
        break;
      }
      default:
        node = null;
    }
    return node && this.path.push(tagsIndex);
  }

  equalTo(tagPath) {
    return (
      this.node === tagPath.node &&
      this.tagsIndex === tagPath.tagsIndex &&
      arraysEqual(this.propertyIndex, tagPath.propertyIndex)
    );
  }
}

freeze(TagPath.prototype);
