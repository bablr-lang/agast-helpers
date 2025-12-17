import { WeakStackFrame } from '@bablr/weak-stack';
import * as BTree from '@bablr/agast-helpers/btree';
import * as Tags from './tags.js';
import {
  ReferenceTag,
  CloseNodeTag,
  GapTag,
  NullTag,
  ShiftTag,
  BindingTag,
  PropertyWrapper,
  Property,
  OpenNodeTag,
  Node,
  AttributeDefinition,
  LiteralTag,
} from './symbols.js';
import { immSet, isPlainObject, isString, has as objHas, get as objGet } from './object.js';
import {
  buildReferenceTag,
  buildChild,
  buildProperty,
  buildPropertyWrapper,
  deepFreeze,
  buildBounds,
  buildReference,
  buildStubNode,
  buildGapTag,
  buildNullTag,
  buildOpenNodeTag,
  buildShift,
  nodeFlags,
  buildNodeTag,
  buildStubProperty,
} from './builders.js';

export const incrementShift = (shift) => {
  if (!shift) return buildShift(1, 3);
  return buildShift(shift.index + 1, shift.height + 1);
};

export const createNode = (openTag) => {
  if (!openTag) throw new Error();
  if (![GapTag, NullTag, OpenNodeTag].includes(openTag.type)) throw new Error();
  let bounds = buildBounds();
  let tags = openTag ? Tags.fromValues([openTag]) : Tags.fromValues([]);
  let flags, type, attributes;

  if (openTag.type === GapTag || openTag.type === NullTag) {
    flags = nodeFlags;
    type = null;
    attributes = {};
  } else {
    ({ flags, type, attributes = {} } = openTag.value || {});
  }
  return { flags, type, bounds, tags, children: Tags.fromValues([]), attributes };
};

export const endsNode = (tag) => {
  return tag.type === CloseNodeTag || (tag.type === OpenNodeTag && tag.value.selfClosing);
};

export const wrapperIsFull = (wrapper) => {
  let { tags } = wrapper.value;

  return tags.length === 3;
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
    default:
      return [];
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

export const getRootProperty = (node, index = 0) => {
  if (node == null || !isCover(node)) {
    return null;
  }
  let idx = getPropertyTagsIndex(node, '_', null, index);

  if (idx == null) return null;

  let tag = Tags.getAt(idx, node.tags);

  if (tag.type !== PropertyWrapper) throw new Error();
  return tag.value.property;
};

// TODO prevent infinite recursion
export const getRoot = (node, index = 0) => {
  let node_ = node;

  while (isCover(node_)) {
    node_ = getRootProperty(node_, index)?.node;
  }

  return node_;
};

export const getRootArray = (node) => {
  let arr = [];
  for (let i = 0; ; i++) {
    let root = getRoot(node, i);
    if (root) {
      arr.push(root);
    } else {
      break;
    }
  }
  return arr;
};

export const getSigilTag = (node) => {
  return Tags.getValues(node.tags)[0];
};

export const getOpenTag = (node) => {
  return Tags.getValues(node.tags)[0];
};

export const getCloseTag = (node) => {
  return Tags.getValues(node.tags)[2];
};

export const isNullNode = (node) => {
  return node && Tags.getAt(0, node.tags).type === NullTag;
};

export const isCover = (node) => {
  return node && node.flags.cover;
};

export const isFragment = (node) => {
  return node && node.flags.fragment;
};

export const isMultiFragment = (node) => {
  return node && node.flags.fragment && !node.flags.cover;
};

export const isGapNode = (node) => {
  return node && Tags.getAt(0, node.tags).type === GapTag;
};

export const isStubNode = (node) => {
  return node && [GapTag, NullTag].includes(Tags.getAt(0, node.tags).type);
};

export const isStubTag = (tag) => {
  return [GapTag, NullTag].includes(tag.type);
};

export const getComputedFlags = (reference) => {
  let { type, flags } = reference;

  if (['#', '@'].includes(type) && !flags.intrinsic) {
    return { ...flags, intrinsic: true };
  } else {
    return reference.flags;
  }
};

export const getChildPropertyIndex = (agAstNode, tagsIndex) => {
  let child = Tags.getAt(tagsIndex, agAstNode.tags);

  if (child.type !== PropertyWrapper) return null;

  let tag = child.value.tags[0];

  let refIndex = tag.type === ShiftTag ? tagsIndex - tag.value.index : tagsIndex;

  let stack = Tags.findPath(refIndex, agAstNode.tags);
  let { node, index: leafIdx } = stack.value;
  let leaf = Tags.getAt(leafIdx, node);

  if (leaf.type !== PropertyWrapper) {
    return null;
  }

  let leafRefTag = leaf.value.tags[0];

  if (leafRefTag.type !== ReferenceTag) return null;

  let { name, isArray } = leafRefTag.value;
  let count = -1;

  if (!name) throw new Error();

  if (!isArray) return null;

  for (let i = leafIdx; i >= 0; i--) {
    let value = Tags.getAt(i, node);
    if (value.type === PropertyWrapper) {
      let firstTag = value.value.tags[0];

      if (firstTag.type === ReferenceTag && firstTag.value.name === name) {
        count++;
      }
    }
  }
  stack = stack.pop();

  if (!stack.size) return count - 1;

  ({ node, index: leafIdx } = stack.value);

  do {
    for (let i = leafIdx - 1; i >= 0; i--) {
      let value = Tags.getValues(node)[i];

      if (Array.isArray(value)) {
        let childNode = value;
        let { references } = Tags.getSums(childNode);

        let res;
        if ((res = Tags.getAtName(name, references))) {
          count += res;
        }
      }
    }
    stack = stack.pop();
    if (stack.size) {
      ({ node, index: leafIdx } = stack.value);
    }
  } while (stack.size);

  // the initializer doesn't matter to us
  // also we're going from fenceposts to gaps
  return count - 1;
};

export const getPropertyTagsIndex = (agAstNode, type, name, index, shiftIndex) => {
  let firstPropsIndex = __getPropertyTagsIndex(agAstNode, type, name, 0);
  let prop = firstPropsIndex == null ? null : Tags.getAt(firstPropsIndex, agAstNode.tags);
  let ref = prop?.value.property.reference;
  let sums = Tags.getSums(agAstNode.tags);
  let counts = name ? sums.references : sums.specialTypes;

  if (ref?.isArray) {
    if (index < 0) {
      index = Tags.getAtName(type, counts) + index;
    } else if (index == null) {
      index = Tags.getAtName(name, counts) - 1;

      if (index < 0) return null;
    }
  }

  let parentIndex = __getPropertyTagsIndex(agAstNode, type, name, index ?? 0);

  if (parentIndex != null && ref?.flags.expression) {
    let shiftIndex_ = shiftIndex == null ? -1 : shiftIndex;
    if (shiftIndex_ < 0) {
      let shifts = 0;
      // TODO speed this up for deeply nested shifts
      // algorithm: make big jump forward, then look at shift index to see if we overshot completely
      // works because we know the size of the thing and a bigger thing doesn't fit in a smaller one
      while (
        Tags.getAt(parentIndex + shifts, agAstNode.children)?.value.tags[0].type === ShiftTag
      ) {
        shifts++;
      }

      if (-shiftIndex_ > shifts + 1) return null;

      return parentIndex + shifts + shiftIndex_ + 1;
    } else {
      if (parentIndex + shiftIndex_ >= Tags.getSize(agAstNode.tags)) {
        return null;
      }

      return parentIndex + shiftIndex_;
    }
  }

  return parentIndex;
};

const __getPropertyTagsIndex = (agAstNode, type, name, index) => {
  let nameCount = 0;
  let node = Tags.getValues(agAstNode.tags)[1];
  let idx = -1;

  // drill into subtrees, passing over subtrees with too few references of the desired name
  outer: while (node) {
    let sums = Tags.getSums(node);

    if (!sums) return null;

    let valueNameCount =
      name != null
        ? Tags.getAtName(name, sums.references)
        : Tags.getAtName(type, sums.specialTypes);

    if (nameCount + valueNameCount < index) {
      return null;
    }

    for (const value of Tags.getValues(node)) {
      if (!isArray(value)) {
        idx++;
        let tag = value;
        if (tag.type === PropertyWrapper) {
          let { tags, property } = tag.value;
          let { reference } = property;
          if (tags[0].type === ReferenceTag) {
            if (
              (name != null && reference.name === name) ||
              (type != null && reference.type === type)
            ) {
              nameCount += 1;
              if (nameCount > index) {
                return idx + 1;
              }
            }
          }
        }
      } else {
        let valueSums = Tags.getSums(value);
        if (
          nameCount +
            (name != null
              ? Tags.getAtName(name, valueSums.references)
              : Tags.getAtName(type, valueSums.specialTypes)) >
          index
        ) {
          node = value;
          continue outer;
        } else {
          nameCount +=
            (name != null
              ? Tags.getAtName(name, valueSums.references)
              : Tags.getAtName(type, valueSums.specialTypes)) ?? 0;
          idx += Tags.getSize(value);
        }
      }
    }

    return null;
  }

  return null;
};

const { hasOwn, freeze } = Object;
const { isArray } = Array;

export const getOriginalFirstNode = (node) => {
  for (let child of Tags.traverse(node.tags)) {
    if (child.type === PropertyWrapper) {
      return child.value.property.node;
    }
  }
  return null;
};

export const getFirstNode = (node) => {
  return getFirstNodeProperty(node)?.node;
};

export const getFirstNodeProperty = (node) => {
  for (let child of Tags.traverse(node.tags)) {
    if (child.type === PropertyWrapper) {
      let ref = child.value.property.reference;
      if (!ref.flags.expression) {
        return child.value.property;
      } else {
        let tagsIndex = getPropertyTagsIndex(node, ref.type, ref.name, 0, -1);
        return Tags.getAt(tagsIndex, node.tags, 2)?.value;
      }
      // is it shifted?
    }
  }
  return null;
};

export const referenceIsSingular = (ref) => {
  return (ref.name && !['#', '@'].includes(ref.type)) || ref.type === '_';
};

export const referencesAreEqual = (a, b) => {
  return (
    a === b ||
    (a.type === b.type &&
      a.name === b.name &&
      a.isArray === b.isArray &&
      a.flags.intrinsic === b.flags.intrinsic &&
      a.flags.expression === b.flags.expression)
  );
};

export const isDefined = (obj, key) => hasOwn(obj, key) && obj[key] !== undefined;
export const isUndefined = (obj, key) => !hasOwn(obj, key) || obj[key] === undefined;

export function* relatedNodes(node) {
  for (const child of Tags.traverse(node.tags)) {
    if (child.type === PropertyWrapper) {
      yield child.node;
    }
  }
}

export const getProperty = (pathSegment, node) => {
  if (!node) throw new Error();

  if (pathSegment == null) throw new Error('Bad path segment');

  let { name, type, index, shiftIndex } =
    typeof pathSegment === 'string' ? buildPathSegment(pathSegment) : pathSegment;

  let propIndex = getPropertyTagsIndex(node, type, name, index, shiftIndex);

  if (propIndex == null) return null;

  return Tags.getAt(propIndex, node.tags)?.value.property;
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

    result = getRoot(property.node);
  }

  return isNullNode(result) ? null : result;
};

export function* list(name, node) {
  let count = countList(name, node);

  for (let i = 0; i < count; i++) {
    yield get(buildPathSegment(name, i, -1), node);
  }
}

export const countList = (name, node) => {
  if (!node) throw new Error();

  if (name == null) throw new Error('Bad path');

  return Tags.getAtName(name, Tags.getSums(node.tags).references);
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
  let sum = Tags.getSize(node.tags);
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

export const finalizeNode = (node) => {
  let path = Path.from(node);

  let { lastPropertyTagPath } = path;

  let closeStack = node.bounds[1];

  if (lastPropertyTagPath) {
    if (!lastPropertyTagPath.tag.value.property.node) throw new Error();

    closeStack = lastPropertyTagPath.tag.value.property.node.bounds[1];

    closeStack = closeStack
      ? BTree.replaceAt(-1, closeStack, lastPropertyTagPath.tag.value.property)
      : BTree.fromValues([lastPropertyTagPath.tag.value.property]);

    closeStack = BTree.push(
      closeStack,
      buildProperty(buildReference(), [], buildStubNode(buildGapTag())),
    );
    node.bounds = buildBounds(node.bounds[0], closeStack);
  }

  freeze(node);
  deepFreeze(node.attributes);

  return node;
};

export const defineAttribute = (node, tag) => {
  if (tag.type !== AttributeDefinition) throw new Error();

  let { path, value } = tag.value;
  let openTag = getOpenTag(node);
  let { attributes } = node;

  if (!objHas(attributes, path) && objGet(attributes, path) !== undefined)
    throw new Error('Can only define undefined attributes');

  if (value === undefined) throw new Error('cannot define attribute to undefined');

  let { flags, type } = openTag.value;
  attributes = immSet(attributes, path, value);
  let newOpenTag = buildOpenNodeTag(flags, type, null, attributes);

  node.attributes = attributes;

  node.tags = Tags.replaceAt(0, node.tags, newOpenTag);
  node.tags = Tags.push(node.tags, tag);
  node.children = node.tags[1][1];
};

export const buildNullNode = () => {
  return finalizeNode(createNode(buildNullTag()));
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

export const isSelfClosingTag = (tag) => {
  return tag.type === OpenNodeTag
    ? tag.value.selfClosing
    : [NullTag, GapTag].includes(tag.type)
    ? true
    : false;
};

export let pathForTagPath = (tagPath) => {
  let refTagPath = tagPath;
  let isShift = tagPath.tag.type === ShiftTag;

  if (isShift) {
    refTagPath = tagPath.siblingAt(tagPath.tagsIndex - tagPath.tag.value.index);
  }

  let { type, name } = refTagPath.tag.value;

  if (refTagPath.tag.type !== ReferenceTag) throw new Error();

  let index = getChildPropertyIndex(tagPath.node, refTagPath.tagsIndex);
  let shiftIndex = isShift ? (tagPath.tag.value.index ?? 0) + 1 : null;

  return [{ type, name, index, shiftIndex }];
};

let getSigilTag_ = (tag) => {
  switch (tag.type) {
    case Property:
      return tag.value.node.tags[1][0];
    case Node:
      return tag.value.tags[1][0];
    case OpenNodeTag:
    case GapTag:
    case NullTag:
      return tag;
  }
};

export const Path = class AgastPath extends WeakStackFrame {
  static from(node) {
    return node && this.create(node);
  }

  static fromTag(openTag) {
    return Path.from(createNode(openTag));
  }

  static set(node, path, value) {
    return Path.from(node).replaceAt(path, value).node;
  }

  static get(node, path) {
    return Path.from(node).get(path).node;
  }

  constructor(parent, node, parentIndex = null) {
    super(parent);

    if (!node || !(hasOwn(node, 'type') && hasOwn(node, 'tags'))) throw new Error();

    if (!node) throw new Error();
    if (isArray(node)) throw new Error();

    this.node = node;
    this.parentIndex = parentIndex;

    let parentTag = parentIndex == null ? null : Tags.getAt(parentIndex, parent.node.tags);

    if (parentTag && parentTag.type !== PropertyWrapper) {
      throw new Error();
    }

    if (
      parentIndex != null &&
      (!this.referenceTag || ![ReferenceTag, ShiftTag].includes(this.referenceTag.type))
    ) {
      throw new Error();
    }

    // if (
    //   parent &&
    //   (['#', '@'].includes(this.referenceTag.value.type)
    //     ? parent.tagPathAt(parentIndex, 1).tag.value
    //     : get(pathForTagPath(parent.tagPathAt(parentIndex)), parent.node)) !== node
    // ) {
    //   throw new Error('Path not reachable');
    // }

    if (!Number.isFinite(this.depth)) throw new Error();

    buildSkips(this);

    freeze(this);
  }

  get openTagPath() {
    throw new Error('deprecated');
  }

  get openTag() {
    return this.openTagPath.tag;
  }

  get closeTagPath() {
    throw new Error('deprecated');
  }

  get closeTag() {
    throw new Error('deprecated');
    return this.closeTagPath.tag;
  }

  getChild(childrenIndex) {
    let { node } = this;
    if (isStubNode(node)) return null;
    return Tags.getAt(childrenIndex, node.children) || null;
  }

  getSigilTagPath() {
    return TagPath.from(this, 0);
  }

  tagPathAt(tagsIndex, wrapperIndex) {
    return TagPath.from(this, tagsIndex, wrapperIndex);
  }

  getOpenTagPath() {
    let tagPath = TagPath.from(this, 0);
    return tagPath.tag.type === OpenNodeTag ? tagPath : null;
  }

  getPropertyWrapperTagPath(childrenIndex) {
    let tagPath = this.tagPathAt(childrenIndex + 1);
    return tagPath && tagPath.tag.type === PropertyWrapper ? tagPath : null;
  }

  getReferenceTagPath(childrenIndex) {
    return this.tagPathAt(childrenIndex + 1, [0]);
  }

  getBindings(childrenIndex) {
    throw new Error('not implemented');
    let wrapper = this.getPropertyWrapperTagPath(childrenIndex);
    return wrapper && Tags.getAt([1], wrapper.value.tags);
  }

  getBindingTagPath(childrenIndex, bindingIndex) {
    return this.tagPathAt(childrenIndex + 1, [1, bindingIndex]);
  }

  getPropertyTagPath(childrenIndex) {
    return this.tagPathAt(childrenIndex + 1, [2]);
  }

  getHashTagPath(childrenIndex) {
    return this.tagPathAt(childrenIndex + 1, [3]);
  }

  getCloseTagPath() {
    let tagPath = TagPath.from(this, -1);
    return tagPath.tag.type === CloseNodeTag ? tagPath : null;
  }

  get binding() {
    throw new Error('deprecated');
  }

  get bindings() {
    return this.parentPropertyPath?.tag.value.property.bindings;
  }

  get bindingTags() {
    return this.parentPropertyPath?.tag.value.tags[1];
  }

  get bindingTag() {
    throw new Error('deprecated');
    return this.bindingTagPath?.tag ?? null;
  }

  get bindingTagPath() {
    throw new Error('deprecated');
    return (this.parent?.node ?? null) && TagPath.from(this.parent, this.parentIndex, 1);
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
    return TagPath.from(this.parent, this.parentIndex, 0).referenceTagPath;
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

  get firstPropertyTagPath() {
    let tagPath = this.tagPathAt(0);
    while (
      tagPath &&
      (!tagPath.propertyWrapper || isNullNode(tagPath.propertyWrapper.tag.value.property.node))
    ) {
      tagPath = tagPath.nextSibling;
      if (tagPath?.propertyWrapper) {
        tagPath = tagPath.propertyWrapper;
      }
    }
    return tagPath;
  }

  get lastPropertyTagPath() {
    let tagPath = this.tagPathAt(-1);
    while (
      tagPath &&
      (!tagPath.propertyWrapper || isNullNode(tagPath.propertyWrapper.tag.value.property.node))
    ) {
      tagPath = tagPath.previousSibling;
      if (tagPath?.propertyWrapper) {
        tagPath = tagPath.propertyWrapper;
      }
    }
    return tagPath;
  }

  get coverBoundary() {
    let path = this;

    if (path.parent && !this.node.flags.fragment && path.parent.node.flags.cover) {
      path = path.parent;
    }

    while (path?.node.flags.cover && path.parent && path.parent.node.flags.cover) {
      path = path.parent;
    }

    return path;
  }

  get(path) {
    let innerPath = path;
    if (typeof innerPath === 'string') {
      innerPath = [innerPath];
    }
    if (!isArray(innerPath)) throw new Error();

    let pathInst = this;

    if (!pathInst.node.type && pathInst.node.flags.cover) {
      if (pathInst.depth) throw new Error();
      pathInst = pathInst.push(
        getRoot(pathInst.node),
        getPropertyTagsIndex(pathInst.node, '_', null, 0),
      );
    }

    for (let i = 0; i < innerPath.length; i++) {
      let nameOrSeg = innerPath[i];

      let seg = nameOrSeg;
      if (isString(nameOrSeg)) {
        let index = innerPath[i + 1];
        if (typeof index === 'number') {
          i++;
        } else {
          index = undefined;
        }
        seg = buildPathSegment(nameOrSeg, index);
      }

      if (i === 0 && seg.type === '_') continue;

      let tagsIndex = getPropertyTagsIndex(
        pathInst.node,
        seg.type,
        seg.name,
        seg.index,
        seg.shiftIndex,
      );

      if (tagsIndex == null) return null;

      let { property } = Tags.getAt(tagsIndex, pathInst.node.tags).value;

      let { node } = property;

      pathInst = pathInst.push(node, tagsIndex);
    }

    return pathInst;
  }

  replaceWith(node, bindings = []) {
    if (!isArray(bindings)) throw new Error();
    if (!isPlainObject(node)) throw new Error();

    let node_ = getRoot(node);

    if (!node_) throw new Error();

    let built = node_;
    let path = this.parent;
    let replacementPath = [];

    let targetShift_ = this.parent?.parentProperty?.value.tags[0];
    let targetShift = targetShift_ && (targetShift_.type === ReferenceTag ? null : targetShift_);
    let targetReference = this.reference;
    let targetBindings = bindings;
    let targetParentIndex = this.parentIndex;
    let held = null;
    let heldCount = 0;
    let value;
    let replacementDepth = path.depth;

    while (path) {
      value = built;
      built = { ...path.node };

      let { tags } = Tags.getAt(targetParentIndex, path.node.tags).value;
      let property = buildProperty(targetReference, targetBindings, value);

      let firstTag = tags[0];
      let newFirstTag = firstTag;
      if (newFirstTag.type === ShiftTag) {
        newFirstTag = buildChild(ReferenceTag, targetReference);
      }

      let tags_ = [
        newFirstTag,
        path.depth === replacementDepth ? bindings : tags[1],
        buildChild(Property, property),
      ];

      // update bounds

      if (!held && firstTag.type !== ShiftTag) {
        built.tags = Tags.replaceAt(
          targetParentIndex,
          built.tags,
          buildChild(PropertyWrapper, buildPropertyWrapper(tags_, property)),
        );
        built.children = built.tags[1][1];
      } else {
        let i = targetParentIndex + 1;
        let shiftWrapper = Tags.getAt(i, built.tags);

        if (shiftWrapper.type === PropertyWrapper && shiftWrapper.value.tags[0].type === ShiftTag) {
          let outerProperty = shiftWrapper.value.property;
          let { reference, bindings } = BTree.getAt(0, shiftWrapper.value.property.node.bounds[0]);

          path = path.push(outerProperty.node, i);

          built = value;

          targetShift = null;
          targetReference = reference;
          targetBindings = bindings;
          targetParentIndex = getPropertyTagsIndex(
            outerProperty.node,
            reference.type,
            reference.name,
            0,
            0,
          );
          held = null;
          continue;
        }

        built.tags = Tags.replaceAt(
          targetParentIndex - firstTag.value.index,
          built.tags,
          buildChild(PropertyWrapper, buildPropertyWrapper(tags_, property)),
        );
        built.children = built.tags[1][1];

        let shiftedTargetIndex = targetParentIndex - firstTag.value.index;
        for (let i = firstTag.value.index - 1; i >= 0; i--) {
          built.tags = Tags.removeAt(shiftedTargetIndex + 1, built.tags);
          built.children = built.tags[1][1];
        }
      }

      finalizeNode(built);

      if (targetReference.name) {
        if (targetReference.isArray) {
          replacementPath.push(getChildPropertyIndex(path.node, targetParentIndex));
        }
        replacementPath.push(targetReference.name);
      }

      held = targetShift ? value : null;
      heldCount = held ? heldCount + 1 : 0;

      targetShift_ = path.parent?.parentProperty?.value.tags[0];
      targetShift = targetShift_ && (targetShift_.type === ReferenceTag ? null : targetShift_);
      targetReference = path.reference;
      targetBindings = path.bindings;
      targetParentIndex = path.parentIndex;
      path = path.parent;
    }

    replacementPath.reverse();

    return Path.from(built).get(replacementPath);
  }

  replaceAt(path, node, bindings) {
    return this.get(path).replaceWith(node, bindings).atDepth(0);
  }

  atDepth(depth) {
    return skipToDepth(depth, this);
  }

  get isMutable() {
    return !Object.isFrozen(this.node);
  }

  get done() {
    let { parent, node } = this;
    let sigilTag = getSigilTag(node);

    return !parent && sigilTag && (isSelfClosingTag(sigilTag) || getCloseTag(node));
  }

  get isAtLeftSide() {
    let { firstPropertyTagPath, referenceTagPath } = this;
    return (
      !referenceTagPath ||
      (!!firstPropertyTagPath && referenceTagPath.propertyWrapper.equalTo(firstPropertyTagPath))
    );
  }

  get held() {
    let tagPath = this.tagPathAt(-1);

    if (tagPath.tag.type !== PropertyWrapper || !this.isAtLeftSide) return null;

    // if we're not at the left side, we aren't held

    if (wrapperIsFull(tagPath.tag) || (tagPath.inner && nodeIsComplete(tagPath.inner.node))) {
      return null;
    }

    let coverParent = this;

    for (;;) {
      let refPath = coverParent.propertyKeyTagPath;

      if (refPath?.tag.type === ShiftTag) {
        return TagPath.from(refPath.path, refPath.tagsIndex - 1, [2]).tag.value;
      }

      coverParent = coverParent.parent;
      if (!coverParent?.node.flags.cover) break;
    }

    return null;
  }

  advance(tag) {
    if (!tag) throw new Error();
    if (!this.isMutable) throw new Error();

    let tagPath = this.tagPathAt(-1, 2);

    if (tagPath?.tag.type === Property ? tagPath?.nextSibling : tagPath?.next) throw new Error();

    if (this.done) throw new Error();

    switch (tag.type) {
      case BindingTag: {
        if (!this.lastPropertyTagPath) {
          this.advanceUnwrapped(buildReferenceTag());
        }
        break;
      }

      case Property:
      case Node:
      case NullTag:
      case GapTag:
      case OpenNodeTag: {
        let sigilTag = getSigilTag_(tag);

        if (
          sigilTag.type === OpenNodeTag &&
          sigilTag.value.flags.fragment &&
          !sigilTag.value.flags.cover
        ) {
          break;
        }

        let lastTagPath = this.lastPropertyTagPath;
        let newProperty = !lastTagPath || wrapperIsFull(lastTagPath.tag);
        let reference =
          tag.type === Property ? tag.value.reference : lastTagPath?.referenceTagPath.tag.value;

        if (!this.node.flags.token || reference?.type === '@') {
          if (newProperty || !lastTagPath.tag.value.tags.length) {
            this.advanceUnwrapped(
              tag.type === Property
                ? buildChild(ReferenceTag, tag.value.reference)
                : buildReferenceTag(),
            );
          }

          if (newProperty || lastTagPath.tag.value.tags.length <= 1) {
            if (tag.type === Property) {
              for (let binding of tag.value.bindings) {
                this.advanceUnwrapped(buildChild(BindingTag, binding));
              }
            }
          }
        }

        break;
      }
    }

    let resultPath;
    if (tag.type === PropertyWrapper) {
      this.node.tags = Tags.push(this.node.tags, tag);
      this.node.children = this.node.tags[1][1];
      resultPath = Path.from(this.node).tagPathAt(-1);
    } else if (tag.type === Property) {
      resultPath = this.advanceUnwrapped(buildChild(Node, tag.value.node));
    } else {
      resultPath = this.advanceUnwrapped(tag);
    }

    if (tag.type === CloseNodeTag || (tag.type === OpenNodeTag && tag.value.selfClosing)) {
      return resultPath.path.parent;
    }

    return resultPath.path;
  }

  advanceUnwrapped(tag) {
    if (!tag) throw new Error();
    if (!this.isMutable) throw new Error();

    let tagPath = this.tagPathAt(-1, [-1, -1]);

    if (tagPath?.tag.type === Property ? tagPath?.nextSibling : tagPath?.next) throw new Error();

    if (this.done) throw new Error();

    let targetPath = this;

    switch (tag.type) {
      case ReferenceTag: {
        let { type, isArray, name, flags } = tag.value;

        if ([ReferenceTag, ShiftTag, BindingTag].includes(this.tagPathAt(-1, -1)?.tag.type))
          throw new Error('invalid location for reference');
        if (!name && !type) throw new Error();
        if (type && !['_', '.', '#', '@'].includes(type)) throw new Error();
        if (type === '@' && isArray) throw new Error();
        if (this.node.flags.token && type !== '@') throw new Error();
        if (this.node.flags.cover && name != null) throw new Error();

        if (tag.value.name) {
          if (
            getOr(null, tag.value.name, this.node) &&
            !referencesAreEqual(tag.value, getProperty(tag.value.name, this.node).reference)
          ) {
            throw new Error('mismatched references');
          }
        } else if (tag.value.type === '_') {
          let rootIdx = getPropertyTagsIndex(this.node, '_', null, 0);

          if (
            rootIdx != null &&
            !referencesAreEqual(
              tag.value,
              Tags.getAt(rootIdx, this.node.tags).value.property.reference,
            )
          ) {
            throw new Error('mismatched references');
          }
        }

        let tagProperty = buildProperty(tag.value);
        let propertyWrapper = buildChild(PropertyWrapper, buildPropertyWrapper([tag], tagProperty));

        this.node.tags = Tags.push(this.node.tags, propertyWrapper);
        this.node.children = this.node.tags[1][1];

        break;
      }

      case BindingTag: {
        if (![ReferenceTag, ShiftTag].includes(this.tagPathAt(-1, -1).tag.type)) {
          throw new Error('Invalid location for BindingTag');
        }
        if (!tag.value.segments) throw new Error();

        let refPath = this.tagPathAt(-1, 0);
        let propPath = TagPath.from(refPath.path, refPath.tagsIndex);

        let { shift } = propPath.tag.value.property;

        if (![ReferenceTag, ShiftTag].includes(refPath.tag.type)) throw new Error();

        if (refPath.tag.type === ShiftTag) {
          refPath = TagPath.from(refPath.path, refPath.tagsIndex - shift.index, 0);
        }

        let refTag = refPath.tag;

        let { 0: firstTag, 1: bindingTags = [] } = propPath.tag.value.tags;
        let tagProperty = buildProperty(
          refTag.value,
          [...propPath.tag.value.property.bindings, tag.value],
          undefined,
          propPath.tag.value.property.shift,
        );
        let tags = [firstTag, [...bindingTags, tag]];
        let tagPropertyWrapper = buildChild(
          PropertyWrapper,
          buildPropertyWrapper(tags, tagProperty),
        );

        this.node.tags = Tags.replaceAt(propPath.tagsIndex, this.node.tags, tagPropertyWrapper);
        this.node.children = this.node.tags[1][1];
        break;
      }

      case OpenNodeTag: {
        let { selfClosing, literalValue, flags } = tag.value;

        if (flags.fragment && !flags.cover) {
          throw new Error('not implemented');
        }

        let refTag = this.node && Tags.getAt(-1, this.node.children).value.tags[0];

        if (![ReferenceTag, ShiftTag].includes(refTag.type)) throw new Error();

        let node = createNode(tag);

        if (literalValue && !flags.token) {
          throw new Error();
        }

        this.advanceUnwrapped(buildNodeTag(node));

        targetPath = this.tagPathAt(-1).inner;

        if (selfClosing) {
          finalizeNode(node);
        }

        break;
      }

      case GapTag:
      case NullTag: {
        if (tag.type === GapTag && this.node.flags.token) {
          this.node.tags = Tags.push(this.node.tags, tag);
          this.node.children = this.node.tags[1][1];
        } else {
          if (this.tagPathAt(-1, 0).tag.type !== ReferenceTag) {
            throw new Error('Invalid location for NullTag');
          }

          let node = createNode(tag);

          this.advanceUnwrapped(buildNodeTag(node));

          finalizeNode(node);
        }

        break;
      }

      case CloseNodeTag: {
        let { node } = this;
        if (this.atReference) throw new Error('invalid location for close tag');

        let openTag = getOpenTag(node);

        if (!openTag) throw new Error();
        if (openTag.value.selfClosing) throw new Error();

        node.tags = Tags.push(node.tags, tag);
        node.children = node.tags[1][1];

        finalizeNode(node);

        if (this.parent) {
          let parentPath = this.parent;
          let { node: parentNode, firstPropertyTagPath } = parentPath;
          let openStack = parentNode.bounds[0];
          let lastRefPath = this.referenceTagPath;
          let parentAtLeftSide =
            !lastRefPath ||
            (!!firstPropertyTagPath && lastRefPath.propertyWrapper.equalTo(firstPropertyTagPath));

          if (parentAtLeftSide) {
            openStack = BTree.pop(openStack);
            openStack = BTree.push(openStack, this.parentProperty.value.property);
            openStack = BTree.concat(openStack, BTree.pop(node.bounds[0]));
            openStack = BTree.push(openStack, buildStubProperty(buildGapTag()));

            parentNode.bounds = buildBounds(openStack, parentNode.bounds[1]);
          }
        }

        break;
      }

      case Node: {
        let propertyNode = tag.value;
        let parentPath = this;
        let { node: parentNode, firstPropertyTagPath } = parentPath;
        let openStack = parentNode.bounds[0];

        let propPath = TagPath.from(parentPath, -1);
        let lastRefPath = propPath.referenceTagPath;
        let parentAtLeftSide =
          !lastRefPath ||
          (!!firstPropertyTagPath && lastRefPath.propertyWrapper.equalTo(firstPropertyTagPath));

        if (parentNode.flags.token) {
          if (isGapNode(propertyNode)) throw new Error('use gap tags in tokens');
        }

        if (propertyNode.flags.fragment && !propertyNode.flags.cover) {
          let existingProperty = propPath;

          while (existingProperty?.tag.type === AttributeDefinition) {
            existingProperty = existingProperty.previousSibling.propertyWrapper;
          }

          if (
            existingProperty.tag.type !== OpenNodeTag &&
            existingProperty.tag &&
            !wrapperIsFull(existingProperty.tag)
          ) {
            throw new Error();
          }

          if (parentAtLeftSide) {
            openStack = BTree.pop(openStack);
            openStack = BTree.concat(openStack, BTree.pop(propertyNode.bounds[0]));
            openStack = BTree.push(openStack, buildStubProperty(buildGapTag()));
            parentNode.bounds = buildBounds(openStack, parentNode.bounds[1]);
          }

          parentNode.tags = Tags.push(parentNode.tags, propertyNode.children);
          parentNode.children = parentNode.tags[1][1];

          break;
        }

        let { property } = propPath.tag.value;
        let { shift } = propPath.tag.value.property;
        let { held } = this;

        if (held) {
          // let heldProperty = this.tagPathAt(-2, 2).tag.value;
          let matchesHeld = isGapNode(propertyNode);
          if (getRoot(propertyNode)) {
            matchesHeld =
              matchesHeld ||
              isGapNode(propertyNode) ||
              held.node === propertyNode ||
              held.node === (getOriginalFirstNode(getRoot(propertyNode)) || held.node);
            if (!matchesHeld) {
              // TODO We're passing by the node that shifted if it's a cover!
              throw new Error();
            }
          }

          if (matchesHeld) {
            property = buildProperty(property.reference, held.bindings, held.node);
          }
        }

        let { 0: firstTag, 1: bindingTags = [] } = propPath.tag.value.tags;
        let property_ = buildProperty(
          property.reference,
          property.bindings,
          held ? held.node : propertyNode,
          shift,
        );
        let tags = [firstTag, bindingTags, buildChild(Property, property_)];
        let tagPropertyWrapper = buildChild(PropertyWrapper, buildPropertyWrapper(tags, property_));

        if (parentAtLeftSide && nodeIsComplete(propertyNode) && !isStubNode(propertyNode)) {
          openStack = BTree.pop(openStack);
          openStack = BTree.push(openStack, property_);
          openStack = BTree.concat(openStack, BTree.pop(propertyNode.bounds[0]));
          openStack = BTree.push(openStack, buildStubProperty(buildGapTag()));

          parentNode.bounds = buildBounds(openStack, parentNode.bounds[1]);
        }

        parentNode.tags = Tags.replaceAt(propPath.tagsIndex, parentNode.tags, tagPropertyWrapper);
        parentNode.children = parentNode.tags[1][1];

        break;
      }

      case AttributeDefinition: {
        if (this.held) throw new Error('invalid place for an attribute binding');

        // add undefined attributes from value

        defineAttribute(this.node, tag);

        break;
      }

      case ShiftTag: {
        let { property: heldProperty } = this.tagPathAt(-1).tag.value;

        let { reference, shift: heldShift } = heldProperty;

        if (!reference.flags.expression && reference.type !== '_') throw new Error();

        let shift = heldShift
          ? buildShift(heldShift.index + 1, heldShift.height + 1)
          : buildShift(1, 3);

        let tagProperty = buildProperty(heldProperty.reference, [], null, shift);
        let tagPropertyWrapper = buildChild(
          PropertyWrapper,
          buildPropertyWrapper([tag], tagProperty),
        );
        this.node.tags = Tags.push(this.node.tags, tagPropertyWrapper);
        this.node.children = this.node.tags[1][1];

        // this.path = finishedPath;
        targetPath = this;
        break;
      }

      case LiteralTag:
        if (typeof tag.value !== 'string') throw new Error();

        this.node.tags = Tags.push(this.node.tags, tag);
        this.node.children = this.node.tags[1][1];
        break;

      default:
        throw new Error();
    }

    return (
      targetPath && TagPath.from(targetPath, -1, tag.type === Property ? -1 : offsetForTag(tag))
    );
  }
};

export const tagPathsAreEqual = (a, b) => {
  if (a == null || b == null) return b == a;
  return a.path.node === b.path.node && a.tagsIndex === b.tagsIndex;
};

export class TagPath {
  static from(path, tagsIndex, wrapperIndex) {
    let size = Tags.getSize(path.node.tags);
    let index = Number.isFinite(tagsIndex) && tagsIndex < 0 ? size + tagsIndex : tagsIndex;

    let wrapperIndex_ = typeof wrapperIndex === 'number' ? [wrapperIndex] : wrapperIndex;

    let wrapperTag = Tags.getAt(index, path.node.tags);

    if ([OpenNodeTag, CloseNodeTag, LiteralTag].includes(wrapperTag?.type)) {
      wrapperIndex_ = [];
    }

    let resolvedWrapperIndex =
      wrapperTag &&
      (wrapperIndex_?.length ? Tags.findPath(wrapperIndex_, wrapperTag.value.tags) : []);

    return resolvedWrapperIndex && new TagPath(path, index, resolvedWrapperIndex);
  }

  static fromNode(node, tagsIndex, wrapperIndex) {
    return TagPath.from(Path.from(node), tagsIndex, wrapperIndex);
  }

  static fromTag(openTag) {
    return TagPath.fromNode(createNode(openTag), 0);
  }

  constructor(path, tagsIndex, wrapperIndex) {
    if (path == null) throw new Error();
    if (path.tag) throw new Error();
    if (!Number.isFinite(tagsIndex) || tagsIndex < 0) throw new Error();
    if (!isArray(wrapperIndex)) throw new Error();

    let tag = Tags.getAt(tagsIndex, path.node.tags);

    if (wrapperIndex.length) {
      tag = Tags.getAt(wrapperIndex, tag.value.tags);
    }

    if (tag == null || isArray(tag)) throw new Error();

    for (let segment of wrapperIndex) {
      if (!isPlainObject(segment) || !(segment.index === 0 || segment.index > 0)) throw new Error();
    }

    this.path = path;
    this.tagsIndex = tagsIndex;
    this.wrapperIndex = wrapperIndex;

    this.node = path.node;
    this.tag = tag;

    freeze(this);
  }

  get child() {
    return this.tag;
  }

  siblingAt(index) {
    return TagPath.from(this.path, index);
  }

  get referenceTagPath() {
    let path = TagPath.from(this.path, this.tagsIndex, 0);
    if (path && path.propertyWrapper) {
      let { property } = path.propertyWrapper.tag.value;
      if (property.shift) {
        path = TagPath.from(this.path, this.tagsIndex - property.shift.index, 0);
      }
    }
    return path?.tag.type === ReferenceTag ? path : null;
  }

  get nextSibling() {
    let { path, tagsIndex, wrapperIndex } = this;

    let propertyIndex = wrapperIndex[0]?.index;

    let nextChildIndex = tagsIndex === 0 ? 0 : tagsIndex - 1 + 1;
    let nextChild = path.getChild(nextChildIndex);

    if (propertyIndex == null && !nextChild) {
      return this.tag.type === CloseNodeTag ? null : path.getCloseTagPath();
    }

    switch (propertyIndex) {
      case 0:
      case 1: {
        let childIndex = tagsIndex - 1;
        let bindingIndex = wrapperIndex[1]?.index ?? -1;
        let binding = path.getBindingTagPath(childIndex, bindingIndex + 1);
        if (binding) return binding;
        return path.getPropertyTagPath(childIndex);
      }
      case 2:
      default: {
        if (!nextChild || nextChild.type !== PropertyWrapper) {
          return path.tagPathAt(tagsIndex + 1);
        } else {
          let ref = path.getReferenceTagPath(nextChildIndex);
          if (ref) return ref;
          let binding = path.getBindingTagPath(nextChildIndex, 0);
          if (binding) return binding;
          return path.getPropertyTagPath(nextChildIndex);
        }
      }
    }
  }

  get previousSibling() {
    let { path, tagsIndex, wrapperIndex } = this;

    let propertyIndex = wrapperIndex[0]?.index;

    if (!tagsIndex) return null;

    let prevChildIndex = tagsIndex === 0 ? 0 : tagsIndex - 1 - 1;
    let prevChild = path.getChild(prevChildIndex);

    if (!prevChild) {
      return path.getOpenTagPath();
    }

    if (propertyIndex) {
      if (propertyIndex > 0) {
        let bindings = path.getBindings(tagsIndex - 1);
        let bindingIndex = wrapperIndex[1].index ?? bindings.length;
        let binding = path.getBindingTagPath(tagsIndex - 1, bindingIndex - 1);
        if (binding) return binding;
      }

      let ref = path.getReferenceTagPath(tagsIndex - 1);
      if (ref) return ref;
    }

    return prevChild && prevChild.type === PropertyWrapper
      ? path.getPropertyTagPath(tagsIndex - 1 - 1)
      : prevChild;
  }

  get next() {
    let { path, tagsIndex, wrapperIndex } = this;

    wrapperIndex = [...wrapperIndex];

    let leaving = false;

    for (;;) {
      let tag = Tags.getAt(tagsIndex, path.node.tags);
      let wrapperTag = tag;
      let lastRef = null;
      leaving = false;

      if (!tag) return null;

      if (tag.type === PropertyWrapper) {
        if (wrapperIndex.length === 0) {
          wrapperIndex.push({ index: 0, node: tag.value.tags });
        }

        if (wrapperIndex != null) {
          wrapperTag = Tags.getAt(wrapperIndex, tag.value.tags);
          lastRef = Tags.getAt(0, tag.value.tags);
        }
      }

      if (isArray(wrapperTag)) {
        // enter bindings array
        wrapperIndex.push({ index: 0, node: wrapperTag });
        wrapperTag = wrapperTag[wrapperIndex[1].index];
        continue;
      }

      let isInitialTag =
        path.node === this.path.node &&
        tagsIndex === this.tagsIndex &&
        arraysEqual(wrapperIndex, this.wrapperIndex);

      // done
      if (!isInitialTag && wrapperTag.type !== Property) {
        return TagPath.from(path, tagsIndex, wrapperIndex);
      }

      // shift
      if (wrapperTag.type === BindingTag && lastRef.type === ShiftTag) {
        let lastProp = Tags.getAt(tagsIndex, path.node.tags);
        let { shift } = lastProp.value.property;
        let refIndex = tagsIndex - shift.index;
        if (refIndex < 0) throw new Error();
        let refTag = Tags.getAt(refIndex, path.node.tags, 0);

        if (refTag.type !== ReferenceTag) throw new Error();

        let { node } = tag.value.property;
        if (!node) return null;

        path = new Path(path, node, tagsIndex);

        if (!path) return null;

        tagsIndex = 0;
        wrapperIndex = [];
        continue;
      }

      let { nextSibling } = this;

      // over
      if (nextSibling) {
        ({ tagsIndex, wrapperIndex } = nextSibling);
        // in
        if (nextSibling.tag.type === Property) {
          // TODO this is wrong
          // it only checks one location for the shift
          //   the shift could be at one of several locations!

          // let shiftPath = path.coverBoundary;

          let shiftPath = path;

          while (
            shiftPath.parent &&
            !Tags.getAt(shiftPath.parentIndex - 1, shiftPath.parent.node.children).value.property
              .shift
          ) {
            shiftPath = shiftPath.parent;
          }

          if (
            path.parent &&
            tagsIndex === 1 &&
            shiftPath.parent &&
            Tags.getAt(shiftPath.parentIndex - 1, shiftPath.parent.node.children).value.property
              .shift &&
            tag.value.property.node ===
              Tags.getAt(shiftPath.parentIndex - 2, shiftPath.parent.node.children).value.property
                .node
          ) {
            let shiftStack = tag.value.property.node.bounds[0];

            let gapNode = BTree.getAt(-1, shiftStack).node;

            path = new Path(path, gapNode, tagsIndex);
            tagsIndex = 0;
            wrapperIndex = [];
            continue;
          }

          path = new Path(path, tag.value.property.node, tagsIndex);
          tagsIndex = 0;
          wrapperIndex = [];
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
            Tags.getAt([path.coverBoundary.parentIndex, 0], path.coverBoundary.parent.node.tags)
              ?.type === ShiftTag
          ) {
            // while
            tagsIndex =
              Tags.getSize(path.parent.node.tags) > path.parentIndex + 1
                ? path.parentIndex + 1
                : null;
          } else {
            tagsIndex = path.parentIndex + 1;
          }

          wrapperIndex = [];
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
    let { path, tagsIndex, wrapperIndex } = this;

    let leaving = false;

    for (;;) {
      let tag = Tags.getAt(tagsIndex, path.node.tags);
      let wrapperTag = tag;
      let wrapperValue = wrapperTag;
      let wasLeaving = leaving;
      leaving = false;

      if (!tag) return null;

      if (tag.type === PropertyWrapper) {
        if (wrapperIndex.length === 0) {
          wrapperIndex.push({ index: 0, node: tag.value.tags });
        } else if (wrapperIndex.length === 1) {
          wrapperValue = wrapperTag[wrapperIndex[0].index];

          if (isArray(wrapperValue) && wrapperValue.length) {
            // enter bindings array
            wrapperIndex.push({ index: 0, node: wrapperValue });
            wrapperTag = wrapperValue[wrapperIndex[1].index];
          }
        }

        if (wrapperIndex[0] != null) {
          wrapperTag = Tags.getAt([wrapperIndex[0].index], tag.value.tags);
          wrapperValue = wrapperTag;
        }
      }

      wrapperValue = wrapperTag;

      let isInitialTag =
        path.node === this.path.node &&
        tagsIndex === this.tagsIndex &&
        arraysEqual(wrapperIndex, this.wrapperIndex);

      if (!wasLeaving && wrapperTag.type === ReferenceTag && wrapperTag.value.flags.expression) {
        // move past shifts

        let shifts = 0;
        let shiftedTag = Tags.getAt(tagsIndex + 1, path.node.tags);

        while (shiftedTag?.type === PropertyWrapper && shiftedTag.value.tags[0].type === ShiftTag) {
          shifts++;
          wrapperIndex = [{ index: 1, node: shiftedTag.value.tags }];
          shiftedTag = Tags.getAt(tagsIndex + 1 + shifts, path.node.tags);
        }

        if (shifts) {
          tagsIndex += shifts;
          continue;
        }
      }

      // done
      if (!isInitialTag && wrapperTag.type !== Property && !isArray(wrapperTag)) {
        return TagPath.from(path, tagsIndex, wrapperIndex);
      }

      let { nextSibling } = this;

      // over
      if (nextSibling) {
        if (nextSibling.tag.type === Property) {
          // in
          if (!wasLeaving && tag.value.tags[2]) {
            path = path.push(tag.value.tags[2].value.node, tagsIndex);

            tagsIndex = 0;
            wrapperIndex = [];
            continue;
          }
        } else {
          return nextSibling;
        }
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

  get propertyWrapper() {
    let { path, tagsIndex } = this;

    let tag = Tags.getAt(tagsIndex, path.node.tags);

    return tag.type === PropertyWrapper ? path.tagPathAt(tagsIndex) : null;
  }

  get innerNode() {
    return this.inner?.node;
  }

  get inner() {
    let { tagsIndex, tag } = this;

    if (tag.type !== PropertyWrapper || !tag.value.property.node) {
      return null;
    }

    return this.path.push(tag.value.property.node, tagsIndex);
  }

  equalTo(tagPath) {
    return (
      this.node === tagPath.node &&
      this.tagsIndex === tagPath.tagsIndex &&
      arraysEqual(this.wrapperIndex, tagPath.wrapperIndex)
    );
  }
}
