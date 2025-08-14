import { WeakStackFrame } from '@bablr/weak-stack';
import * as BTree from '@bablr/agast-helpers/btree';
import * as Tags from './tags.js';
import {
  ReferenceTag,
  InitializerTag,
  DoctypeTag,
  CloseNodeTag,
  GapTag,
  NullTag,
  ShiftTag,
  BindingTag,
  PropertyWrapper,
  Property,
} from './symbols.js';
import { isPlainObject, isString } from './object.js';
import { buildBinding, buildChild, buildProperty, buildPropertyWrapper } from './builders.js';
import { buildReferenceTag, buildShiftTag, finalizeNode, shift } from './tree.js';

export const wrapperIsFull = (wrapper) => {
  let { tags } = wrapper.value;

  if (tags[1]?.type === InitializerTag) {
    return true;
  } else {
    return tags.length === 3;
  }
};

export const offsetForTag = (tag) => {
  switch (tag.type) {
    case ReferenceTag:
    case ShiftTag:
      return 0;
    case BindingTag:
    case InitializerTag:
      return 1;
  }
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
  if (node == null || !isFragmentNode(node)) {
    return null;
  }
  let idx = getPropertyTagsIndex(node, '.', null, index);

  if (idx == null) return null;

  let tag = Tags.getAt(idx, node.tags);

  if (tag.type !== PropertyWrapper) throw new Error();
  return tag.value.property;
};

export const getRoot = (node, index = 0) => {
  if (!isFragmentNode(node)) {
    return node;
  }

  return getRootProperty(node, index)?.node;
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

export const getOpenTag = (node) => {
  return Tags.getValues(node.tags)[0];
};

export const getCloseTag = (node) => {
  return Tags.getValues(node.tags)[2];
};

export const isNullNode = (node) => {
  return node && node.type === null && Tags.getAt(0, node.tags).type === NullTag;
};

export const isFragmentNode = (node) => {
  return node && node.type === null && getOpenTag(node)?.value?.type === null;
};

export const isGapNode = (node) => {
  return node && node.type === null && Tags.getAt(0, node.tags).type === GapTag;
};

export const isStubNode = (node) => {
  return node && node.type === null && [GapTag, NullTag].includes(Tags.getAt(0, node.tags).type);
};

export const isStubTag = (tag) => {
  return [GapTag, NullTag].includes(tag.type);
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
  let initializerOffset = prop?.value.tags[1]?.type === InitializerTag ? 1 : 0;
  let ref = prop?.value.property.reference;
  let sums = Tags.getSums(agAstNode.tags);

  if (ref?.isArray) {
    if (index < 0) {
      if (name) {
        index = Tags.getAtName(name, sums.references) - initializerOffset + index;
      } else {
        index = Tags.getAtName(type, sums.specialTypes) - initializerOffset + index;
      }
    } else if (index == null) {
      if (name) {
        index = Tags.getAtName(name, sums.references) - 1 - initializerOffset;
      } else {
        index = Tags.getAtName(type, sums.specialTypes) - 1 - initializerOffset;
      }

      if (index < 0) return null;
    }
  }

  let parentIndex = __getPropertyTagsIndex(agAstNode, type, name, (index ?? 0) + initializerOffset);

  if (ref?.flags.expression) {
    let shiftIndex_ = shiftIndex == null ? -1 : shiftIndex;
    if (shiftIndex_ < 0) {
      let shifts = 0;
      // TODO speed this up for deeply nested shifts
      // algorithm: make big jump forward, then look at shift index to see if we overshot completely
      // works because we know the size of the thing and a bigger thing doesn't fit in a smaller one
      while (Tags.getAt(parentIndex + shifts + 1, agAstNode.tags, 0)?.type === ShiftTag) {
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

export const getInitializerTagsIndex = (agAstNode, referenceTag) => {
  let { type, name } = referenceTag.value;

  if (type === '#') return null;

  let index = __getPropertyTagsIndex(agAstNode, type, name, 0);

  if (index == null) return null;

  let nextTag = Tags.getAt(index, agAstNode.tags, 1);

  return nextTag?.type === InitializerTag ? index : null;
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

export const getOriginalFirstNode = (node, height = 1) => {
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
      let ref = child.value.reference;
      if (!ref.flags.expression) {
        return child.value;
      } else {
        let tagsIndex = getPropertyTagsIndex(node, ref.type, ref.name, 0, -1);
        return Tags.getAt(tagsIndex, node.tags + 2)?.value.node;
      }
      // is it shifted?
    }
  }
  return null;
};

export const referencesAreEqual = (a, b) => {
  return (
    a === b ||
    (a.type === b.type &&
      a.name === b.name &&
      a.isArray === b.isArray &&
      a.flags.hasGap === b.flags.hasGap &&
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
  let name = typeof seg === 'string' ? seg : seg.name;

  return (
    !!getProperty(seg, node_) ||
    getInitializerTagsIndex(node_, buildReferenceTag(null, name)) != null
  );
};

export const get = (path, node) => getOr(null, path, node);

export const getOr = (defaultValue, path, node) => {
  if (!node) throw new Error();

  if (path == null) throw new Error('Bad path');

  if (!isArray(path)) {
    path = [path];
  }

  let root = getRoot(node);
  let result = root || node;

  let start = 0;
  if (path[0]?.type === '.') {
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

    result = property.node;
  }

  return result;
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

  let hasInitializer = getInitializerTagsIndex(node, buildReferenceTag(null, name)) != null;

  return Tags.getAtName(name, Tags.getSums(node.tags).references) - (hasInitializer ? 1 : 0);
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
      path = new TagPath(path.inner, 0);
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

export const Path = class AgastPath extends WeakStackFrame {
  static from(node) {
    let node_ = isPlainObject(node) ? node : node.node;
    return node_ && this.create(node_);
  }

  static set(node, path, value) {
    return Path.from(node).replaceAt(path, value).node;
  }

  constructor(parent, node, parentIndex = null) {
    super(parent);

    if (!node || !(hasOwn(node, 'type') && hasOwn(node, 'tags'))) throw new Error();

    if (parent && parentIndex == null) throw new Error();
    if (!node) throw new Error();
    if (isArray(node)) throw new Error();

    this.node = node;
    this.parentIndex = parentIndex; // in the parent

    let parentTag = parent && Tags.getAt(parentIndex, parent.node.tags);

    if (parentTag && parentTag.type !== PropertyWrapper) {
      throw new Error();
    }

    parentIndex != null && parentTag?.value.tags[0];

    if (
      parent &&
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
    let tagPath = TagPath.from(this, 0);
    if (tagPath.tag.type === DoctypeTag) {
      tagPath = tagPath.nextSibling;
    }
    return tagPath;
  }

  get openTag() {
    return this.openTagPath.tag;
  }

  get closeTagPath() {
    let tagPath = TagPath.from(this, -1);
    if (tagPath.tag.type !== CloseNodeTag) return null;
    return tagPath;
  }

  get closeTag() {
    return this.closeTagPath.tag;
  }

  tagPathAt(idx, offset) {
    return TagPath.from(this, idx, offset);
  }

  get binding() {
    return this.bindingTag?.value ?? null;
  }

  get bindingTag() {
    return this.bindingTagPath?.tag ?? null;
  }

  get bindingTagPath() {
    return (this.parent?.node ?? null) && new TagPath(this.parent, this.parentIndex, 1);
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
    let path = new TagPath(this.parent, this.parentIndex, 0);
    if (path.tag.type === ShiftTag) {
      path = new TagPath(this.parent, this.parentIndex - path.tag.value.index, 0);
    }
    return path;
  }

  get parentPropertyPath() {
    if (!this.parent?.node) {
      return null;
    }
    let path = new TagPath(this.parent, this.parentIndex);
    if (path.tag.type === ShiftTag) {
      path = new TagPath(this.parent, this.parentIndex - path.tag.value.index);
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
      (!tagPath.propertyWrapper ||
        tagPath.propertyWrapper.tag.value.tags[1]?.type === InitializerTag ||
        isNullNode(tagPath.propertyWrapper.tag.value.property.node))
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
      (!tagPath.propertyWrapper ||
        tagPath.propertyWrapper.tag.value.tags[1]?.type === InitializerTag ||
        isNullNode(tagPath.propertyWrapper.tag.value.property.node))
    ) {
      tagPath = tagPath.previousSibling;
      if (tagPath?.propertyWrapper) {
        tagPath = tagPath.propertyWrapper;
      }
    }
    return tagPath;
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
        getPropertyTagsIndex(pathInst.node, '.', null, 0),
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

  replaceWith(node, binding = buildBinding()) {
    let node_ = getRoot(isPlainObject(node) ? node : node.node);

    if (!node_) throw new Error();

    let built = node_;
    let path = this.parent;
    let replacementPath = [];

    let targetShift_ = this.parent?.parentProperty?.value.tags[0];
    let targetShift = targetShift_ && (targetShift_.type === ReferenceTag ? null : targetShift_);
    let targetReference = this.reference;
    let targetBinding = binding;
    let targetParentIndex = this.parentIndex;
    let held = null;
    let heldCount = 0;
    let value;

    while (path) {
      value = built;
      built = { ...path.node };

      let { tags } = Tags.getAt(targetParentIndex, path.node.tags).value;
      let property = buildProperty(targetReference, targetBinding, value);

      let firstTag = tags[0];
      let newFirstTag = firstTag;
      if (newFirstTag.type === ShiftTag) {
        newFirstTag = buildChild(ReferenceTag, targetReference);
      }

      let tags_ = [
        newFirstTag,
        buildChild(BindingTag, targetBinding),
        buildChild(Property, property),
      ];

      // update bounds

      if (!held && firstTag.type !== ShiftTag) {
        built.tags = Tags.replaceAt(
          targetParentIndex,
          built.tags,
          buildChild(PropertyWrapper, buildPropertyWrapper(tags_, property)),
        );
      } else {
        let i = targetParentIndex + 1;
        let shiftWrapper = Tags.getAt(i, built.tags);

        if (shiftWrapper.type === PropertyWrapper && shiftWrapper.value.tags[0].type === ShiftTag) {
          let outerProperty = shiftWrapper.value.property;
          let { node, reference, binding } = BTree.getAt(
            0,
            shiftWrapper.value.property.node.bounds[0],
          );

          path = path.push(outerProperty.node, i);

          built = value;

          targetShift = null;
          targetReference = reference;
          targetBinding = binding;
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

        let shiftedTargetIndex = targetParentIndex - firstTag.value.index;
        for (let i = firstTag.value.index - 1; i >= 0; i--) {
          built.tags = Tags.removeAt(shiftedTargetIndex + 1, built.tags);
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
      targetBinding = path.binding;
      targetParentIndex = path.parentIndex;
      path = path.parent;
    }

    replacementPath.reverse();

    return Path.from(built).get(replacementPath);
  }

  replaceAt(path, node, binding) {
    return this.get(path).replaceWith(node, binding).atDepth(0);
  }

  atDepth(depth) {
    return skipToDepth(depth, this);
  }
};

export const tagPathsAreEqual = (a, b) => {
  if (a == null || b == null) return b == a;
  return a.path.node === b.path.node && a.tagsIndex === b.tagsIndex;
};

export class TagPath {
  constructor(path, tagsIndex, wrapperIndex) {
    if (path == null || tagsIndex == null) throw new Error();

    let tag = Tags.getAt(tagsIndex, path.node.tags);

    if (tag == null) throw new Error();

    if (tag.type === PropertyWrapper && wrapperIndex != null) {
      tag = tag.value.tags[wrapperIndex];
    }

    this.path = path;
    this.node = path.node;
    this.tag = tag;
    this.tagsIndex = tagsIndex;
    this.wrapperIndex = wrapperIndex;

    freeze(this);
  }

  static from(path, tagsIndex, wrapperIndex) {
    let size = Tags.getSize(path.node.tags);
    let index = tagsIndex < 0 ? size + tagsIndex : tagsIndex;

    let tag = Tags.getAt(index, path.node.tags);

    if (!tag) return null;

    let offset =
      wrapperIndex == null || tag.type !== PropertyWrapper
        ? null
        : wrapperIndex < 0
        ? tag.value.tags.length + wrapperIndex
        : wrapperIndex;

    return index >= 0 && index < size ? new TagPath(path, index, offset) : null;
  }

  static fromNode(node, tagsIndex, wrapperIndex) {
    return TagPath.from(Path.from(node), tagsIndex, wrapperIndex);
  }

  get child() {
    return this.tag;
  }

  siblingAt(index) {
    return TagPath.from(this.path, index);
  }

  get nextSibling() {
    const { path, tagsIndex, wrapperIndex } = this;

    let propPath = new TagPath(path, tagsIndex);

    if (wrapperIndex != null && wrapperIndex + 1 < Tags.getSize(propPath.tag.value.tags)) {
      return new TagPath(path, tagsIndex, wrapperIndex + 1);
    } else if (tagsIndex + 1 < Tags.getSize(path.node.tags)) {
      return new TagPath(path, tagsIndex + 1, 0);
    }

    return TagPath.from(path, tagsIndex + 1, 0);
  }

  get next() {
    let { path, tagsIndex, wrapperIndex } = this;

    let leaving = false;

    for (;;) {
      let lastRef = Tags.getAt(tagsIndex, path.node.tags, 0);
      let tag = Tags.getAt(tagsIndex, path.node.tags);
      let wrapperTag = tag;
      let isInitialTag =
        path.node === this.path.node &&
        tagsIndex === this.tagsIndex &&
        wrapperIndex === this.wrapperIndex;
      let wasLeaving = leaving;
      leaving = false;

      if (!tag) return null;

      wrapperIndex =
        tag.type === PropertyWrapper ? (wrapperIndex == null ? 0 : wrapperIndex) : null;

      if (wrapperIndex != null) {
        wrapperTag = tag.value.tags[wrapperIndex];
      }

      // done
      if (!isInitialTag && wrapperTag.type !== Property) {
        return new TagPath(path, tagsIndex, wrapperIndex);
      }

      // in
      if (wrapperTag.type === Property && !wasLeaving) {
        if (tag.value.tags[1]?.type === InitializerTag || !tag.value.property.node) {
        } else {
          // jump to gap tag?
          let tag1;
          if (
            path.parent &&
            tag.value.property.reference.flags.expression &&
            (tagsIndex === 1 ||
              (tagsIndex === 2 &&
                (tag1 = Tags.getAt(1, path.node.tags)).type === PropertyWrapper &&
                tag1.value.tags[1].type === InitializerTag)) &&
            Tags.getAt(path.parentIndex, path.parent.node.tags, 0)?.type === ShiftTag
          ) {
            let shiftStack = tag.value.property.node.bounds[0];

            let gapNode = BTree.getAt(-1, shiftStack).node;

            path = new Path(path, gapNode, tagsIndex);
            tagsIndex = 0;
            continue;
          }

          path = new Path(path, tag.value.property.node, tagsIndex);
          tagsIndex = 0;
          continue;
        }
      }

      tag;
      // shift
      if (wrapperTag.type === BindingTag && lastRef.type === ShiftTag) {
        let refIndex = tagsIndex - lastRef.value.index;
        if (refIndex < 0) throw new Error();
        let refTag = Tags.getAt(refIndex, path.node.tags, 0);

        if (refTag.type !== ReferenceTag) throw new Error();

        if (Tags.getAt(refIndex, path.node.tags, 1).type !== InitializerTag) {
          path = new Path(path, tag.value.property.node, tagsIndex);

          if (!path) return null;

          tagsIndex = 0;
          continue;
        }
      }

      // over
      if (tag.type === PropertyWrapper && wrapperIndex + 1 < tag.value.tags.length) {
        wrapperIndex++;
        continue;
      } else if (path.node && tagsIndex + 1 < Tags.getSize(path.node.tags)) {
        tagsIndex++;
        wrapperIndex = 0;
        continue;
      }

      // out
      if (path.parentIndex != null && path.parent) {
        do {
          if (
            path.parent &&
            Tags.getAt(path.parentIndex, path.parent.node.tags, 0)?.type === ShiftTag
          ) {
            tagsIndex =
              Tags.getSize(path.parent.node.tags) > path.parentIndex + 1
                ? path.parentIndex + 1
                : null;
          } else {
            tagsIndex = path.parentIndex + 1;
          }

          wrapperIndex = 0;
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

  get propertyWrapper() {
    let { path, tagsIndex } = this;

    let tag = Tags.getAt(tagsIndex, path.node.tags);

    return tag.type === PropertyWrapper ? path.tagPathAt(tagsIndex) : null;
  }

  get nextUnshifted() {
    let { path, tagsIndex, wrapperIndex } = this;

    let leaving = false;

    for (;;) {
      let tag = Tags.getAt(tagsIndex, path.node.tags);
      let wrapperTag = tag;
      let isInitialTag =
        path.node === this.path.node &&
        tagsIndex === this.tagsIndex &&
        wrapperIndex === this.wrapperIndex;
      let wasLeaving = leaving;
      leaving = false;

      if (!tag) return null;

      wrapperIndex =
        tag.type === PropertyWrapper ? (wrapperIndex == null ? 0 : wrapperIndex) : null;

      if (wrapperIndex != null) {
        wrapperTag = tag.value.tags[wrapperIndex];
      }

      if (wrapperTag.type === ReferenceTag && wrapperTag.value.flags.expression) {
        // move past shifts

        let shifts = 0;
        let tag = Tags.getAt(tagsIndex, path.node.tags);

        while (tag?.type === PropertyWrapper && tag.value.tags[0].type === ShiftTag) {
          shifts++;
          wrapperIndex = 1;
          tag = Tags.getAt(tagsIndex + shifts, path.node.tags);
        }
        if (shifts) {
          tagsIndex += shifts;
          continue;
        }
      }

      // done
      if (!isInitialTag && wrapperTag.type !== Property) {
        return new TagPath(path, tagsIndex, wrapperIndex);
      }

      // in
      if (tag.type === PropertyWrapper) {
        if (wrapperIndex + 1 < tag.value.tags.length) {
          wrapperIndex++;
          continue;
        } else if (!wasLeaving && tag.value.tags[1] && tag.value.tags[1].type !== InitializerTag) {
          path = path.push(tag.value.property.node, tagsIndex);
          tagsIndex = 0;
          continue;
        }
      }

      // over
      if (tag.type === PropertyWrapper && wrapperIndex + 1 < tag.value.tags.length) {
        wrapperIndex++;
        continue;
      } else if (path.node && tagsIndex + 1 < Tags.getSize(path.node.tags)) {
        tagsIndex++;
        wrapperIndex = 0;
        continue;
      }

      // out
      if (path.parentIndex != null) {
        do {
          tagsIndex = path.parentIndex + 1;

          path = path.parent;
          leaving = true;
        } while (tagsIndex == null);

        leaving = true;
        continue;
      }

      return null;
    }
  }

  get previousSibling() {
    const { path, tagsIndex, wrapperIndex } = this;

    if (wrapperIndex > 0) {
      return new TagPath(path, tagsIndex, wrapperIndex - 1);
    }

    const child = tagsIndex - 1 < 0 ? null : BTree.getAt(tagsIndex - 1, path.node.tags);

    return child && TagPath.from(path, tagsIndex - 1, -1);
  }

  get innerNode() {
    return this.inner?.node;
  }

  get inner() {
    let { path, tagsIndex, tag, previousSibling } = this;

    let refPath = TagPath.from(path, tagsIndex, 0);

    if (tag.type !== PropertyWrapper) {
      return null;
    }

    let shiftPath = null;
    if (refPath.tag.type === ShiftTag) {
      shiftPath = refPath;
      throw new Error('not implemented');
      refPath = TagPath.from(this.path, this.tagsIndex - refPath.tag.value.index - 2);
    }

    if (refPath.tag.type !== ReferenceTag) throw new Error();

    const { type, name } = refPath.tag.value;

    return this.path.get([
      buildFullPathSegment(
        type,
        name,
        getChildPropertyIndex(refPath.path.node, refPath.tagsIndex),
        shiftPath?.tag.value.index,
      ),
    ]);
  }

  equalTo(tagPath) {
    return this.node === tagPath.node && this.tagsIndex === tagPath.tagsIndex;
  }
}
