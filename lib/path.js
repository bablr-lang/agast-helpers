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
  Property,
} from './symbols.js';
import { isString } from './object.js';
import { buildBinding, buildChild, buildProperty } from './builders.js';
import { buildReferenceTag, finalizeNode } from './tree.js';

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

  let tag = Tags.getAt(idx + 2, node.tags);

  if (tag.type !== Property) throw new Error();
  return tag.value;
};

export const getRoot = (node, index = 0) => {
  if (!isFragmentNode(node)) {
    return node;
  }

  return getRootProperty(node, index).node;
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

  let refIndex = child.type === ShiftTag ? tagsIndex - child.value.index * 3 : tagsIndex;

  let stack = Tags.findPath(refIndex, agAstNode.tags);
  let { node, index: leafIdx } = stack.value;
  let leaf = Tags.getAt(leafIdx, node);

  if (leaf.type !== ReferenceTag) return null;

  let { name, isArray } = leaf.value;
  let count = -1;

  if (!isArray) return null;

  for (let i = leafIdx; i >= 0; i--) {
    let value = Tags.getAt(i, node);

    if (value.type === ReferenceTag && value.value.name === name) {
      count++;
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

        if (hasOwn(references, name)) {
          count += references[name];
        }
      } else {
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
  let firstRefIndex = __getPropertyTagsIndex(agAstNode, type, name, 0);
  let ref = firstRefIndex == null ? null : Tags.getAt(firstRefIndex, agAstNode.tags);
  let nextTag = firstRefIndex == null ? null : Tags.getAt(firstRefIndex + 1, agAstNode.tags);
  let initializerOffset = nextTag?.type === InitializerTag ? 1 : 0;

  if (ref?.value.isArray) {
    if (index < 0) {
      if (name) {
        index = BTree.getSums(agAstNode.tags).references[name] - initializerOffset + index;
      } else {
        index = BTree.getSums(agAstNode.tags).specialTypes[type] - initializerOffset + index;
      }
    } else if (index == null) {
      if (name) {
        index = BTree.getSums(agAstNode.tags).references[name] - 1 - initializerOffset;
      } else {
        index = BTree.getSums(agAstNode.tags).specialTypes[type] - 1 - initializerOffset;
      }

      if (index < 0) return null;
    }
  }

  let refIndex = __getPropertyTagsIndex(agAstNode, type, name, (index ?? 0) + initializerOffset);

  if (ref?.value.flags.expression && shiftIndex != null) {
    if (shiftIndex < 0) {
      let shifts = 0;
      // TODO speed this up for deeply nested shifts
      // algorithm: make big jump forward, then look at shift index to see if we overshot completely
      // works because we know the size of the thing and a bigger thing doesn't fit in a smaller one
      while (Tags.getAt(refIndex + shifts * 3 + 3, agAstNode.tags)?.type === ShiftTag) {
        shifts++;
      }

      return refIndex + (shifts + shiftIndex + 1) * 3;
    } else {
      return refIndex + (shiftIndex - 1) * 3;
    }
  }

  return refIndex;
};

export const getInitializerTagsIndex = (agAstNode, referenceTag) => {
  let { type, name } = referenceTag.value;
  let index = __getPropertyTagsIndex(agAstNode, type, name, 0);

  if (index == null) return null;

  let nextTag = Tags.getAt(index + 1, agAstNode.tags);

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

    let valueNameCount = name != null ? sums.references[name] : sums.specialTypes[type];

    if (nameCount + valueNameCount < index) {
      return null;
    }

    for (const value of Tags.getValues(node)) {
      if (!isArray(value)) {
        idx++;
        let tag = value;
        if (
          tag.type === ReferenceTag &&
          ((name != null && tag.value.name === name) || (type != null && tag.value.type === type))
        ) {
          nameCount += 1;
          if (nameCount > index) {
            return idx + 1;
          }
        }
      } else {
        let valueSums = Tags.getSums(value);
        if (
          nameCount + (name != null ? valueSums.references[name] : valueSums.specialTypes[type]) >
          index
        ) {
          node = value;
          continue outer;
        } else {
          nameCount +=
            (name != null ? valueSums.references[name] : valueSums.specialTypes[type]) ?? 0;
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
  for (let child of Tags.traverse(node.tags)) {
    if (child.type === Property) {
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
    if (child.type === Property) {
      yield child.node;
    }
  }
}

export const getProperty = (pathSegment, node) => {
  if (!node) throw new Error();

  if (pathSegment == null) throw new Error('Bad path segment');

  let { name, type, index, shiftIndex } =
    typeof pathSegment === 'string' ? buildPathSegment(pathSegment) : pathSegment;

  let refIndex = getPropertyTagsIndex(node, type, name, index, shiftIndex);

  if (refIndex == null) return null;

  return Tags.getAt(refIndex + 2, node.tags)?.value;
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

  let result = node;
  for (let i = 0; i < path.length; i++) {
    let nameOrSeg = path[i];
    let isName = typeof nameOrSeg === 'string';
    let property;

    if (!isName && (!nameOrSeg || !hasOwn(nameOrSeg, 'shiftIndex'))) throw new Error('Bad path');

    let name = isName ? nameOrSeg : nameOrSeg.name;

    property = getProperty(isName ? name : nameOrSeg, result);

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

  return Tags.getSums(node.tags).references[name] - (hasInitializer ? 1 : 0);
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

    let gapPath = path.path.parent && TagPath.from(path.path.parent, path.path.referenceIndex + 1);

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
    refTagPath = tagPath.siblingAt(tagPath.tagsIndex - tagPath.tag.value.index * 3);
  }

  let { type, name } = refTagPath.tag.value;

  if (refTagPath.tag.type !== ReferenceTag) throw new Error();

  let index = getChildPropertyIndex(tagPath.node, refTagPath.tagsIndex);
  let shiftIndex = isShift ? (tagPath.tag.value.index ?? 0) + 1 : null;

  return [{ type, name, index, shiftIndex }];
};

export const Path = class AgastPath extends WeakStackFrame {
  static from(node) {
    return node && this.create(node);
  }

  constructor(parent, node, referenceIndex = null) {
    super(parent);

    if (!(hasOwn(node, 'type') && hasOwn(node, 'tags'))) throw new Error();

    if (parent && referenceIndex == null) throw new Error();
    if (!node) throw new Error();
    if (isArray(node)) throw new Error();

    this.node = node;
    this.referenceIndex = referenceIndex; // in the parent

    let referenceTag = referenceIndex != null && Tags.getAt(referenceIndex, parent.node.tags);

    if (referenceTag && ![ReferenceTag, ShiftTag].includes(referenceTag.type)) {
      throw new Error();
    }

    if (
      parent &&
      (!this.referenceTag || ![ReferenceTag, ShiftTag].includes(this.referenceTag.type))
    ) {
      throw new Error();
    }

    // if (
    //   parent &&
    //   (['#', '@'].includes(this.referenceTag.value.type)
    //     ? parent.tagPathAt(referenceIndex + 1).tag.value
    //     : get(pathForTagPath(parent.tagPathAt(referenceIndex)), parent.node)) !== node
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

  tagPathAt(idx) {
    return TagPath.from(this, idx);
  }

  get binding() {
    return this.bindingTag?.value;
  }

  get bindingTag() {
    return (
      (this.parent?.node ?? null) && Tags.getAt(this.referenceIndex + 1, this.parent.node.tags)
    );
  }

  get bindingTagPath() {
    return (this.parent?.node ?? null) && new TagPath(this.parent, this.referenceIndex + 1);
  }

  get reference() {
    return this.referenceTag?.value;
  }

  get referenceTag() {
    return (this.parent?.node ?? null) && Tags.getAt(this.referenceIndex, this.parent.node.tags);
  }

  get referenceTagPath() {
    return (this.parent?.node ?? null) && new TagPath(this.parent, this.referenceIndex);
  }

  get(path) {
    let path_ = path;
    if (typeof path_ === 'string') {
      path_ = [path_];
    }
    if (!isArray(path_)) throw new Error();

    let pathInst = this;

    if (!pathInst.node.type && pathInst.node.flags.cover) {
      if (pathInst.depth) throw new Error();
      pathInst = Path.from(pathInst.node).push(
        getRoot(pathInst.node),
        getPropertyTagsIndex(pathInst.node, '.', null, 0),
      );
    }

    for (let i = 0; i < path_.length; i++) {
      let nameOrSeg = path_[i];

      if (isString(nameOrSeg)) {
        nameOrSeg = { type: null, name: nameOrSeg, index: null, shiftIndex: null };
      }

      let seg = nameOrSeg;

      let tagsIndex = getPropertyTagsIndex(
        pathInst.node,
        seg.type,
        seg.name,
        seg.index,
        seg.shiftIndex,
      );

      let property = Tags.getAt(tagsIndex + 2, pathInst.node.tags).value;

      if (!property) return null;

      let { node } = property;

      pathInst = pathInst.push(node, tagsIndex);
    }

    return pathInst;
  }

  replaceWith(node, binding = buildBinding()) {
    let built = node;

    if (!node) throw new Error();

    `
      Algorithm: 
    `;

    let path = this.parent;
    let replacementPath = [];

    let targetReference = this.reference;
    let targetReferenceIndex = this.referenceIndex;
    let targetBinding = binding;

    while (path) {
      let property = buildProperty(targetReference, binding, built);

      built = { ...path.node };

      built.tags = Tags.replaceAt(
        targetReferenceIndex + 1,
        built.tags,
        buildChild(BindingTag, targetBinding),
      );
      built.tags = Tags.replaceAt(
        targetReferenceIndex + 2,
        built.tags,
        buildChild(Property, property),
      );

      finalizeNode(built);

      if (targetReference.name) {
        replacementPath.push(targetReference.name);
      }

      targetReference = path.reference;
      targetReferenceIndex = path.referenceIndex;
      targetBinding = path.binding;
      path = path.parent;
    }

    replacementPath.reverse();

    return Path.from(built).get(replacementPath);
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
  constructor(path, tagsIndex) {
    if (path == null || tagsIndex == null) throw new Error();

    let tag = Tags.getAt(tagsIndex, path.node.tags);

    if (tag == null) throw new Error();

    this.path = path;
    this.node = path.node;
    this.tag = tag;
    this.tagsIndex = tagsIndex;

    freeze(this);
  }

  static from(path, tagsIndex) {
    let size = Tags.getSize(path.node.tags);
    let index = tagsIndex < 0 ? size + tagsIndex : tagsIndex;

    return index >= 0 && index < size ? new TagPath(path, index) : null;
  }

  static fromNode(node, tagsIndex) {
    return TagPath.from(Path.from(node), tagsIndex);
  }

  get child() {
    return this.tag;
  }

  siblingAt(index) {
    return TagPath.from(this.path, index);
  }

  get nextSibling() {
    const { path, tagsIndex } = this;

    const child =
      tagsIndex + 1 >= Tags.getSize(path.node.tags)
        ? null
        : Tags.getAt(tagsIndex + 1, path.node.tags);

    return child && new TagPath(path, tagsIndex + 1);
  }

  get next() {
    let { path, tagsIndex } = this;

    let leaving = false;

    for (;;) {
      let prevTag = Tags.getAt(tagsIndex - 1, path.node.tags);
      let tag = Tags.getAt(tagsIndex, path.node.tags);
      let isInitialTag = path.node === this.path.node && tagsIndex === this.tagsIndex;
      let wasLeaving = leaving;
      leaving = false;

      if (!tag) return null;

      // done
      if (!isInitialTag && tag.type !== Property) {
        return new TagPath(path, tagsIndex);
      }

      // in
      if (tag.type === Property && !wasLeaving) {
        // jump to gap tag?
        if (
          path.parent &&
          tag.value.reference.flags.expression &&
          (tagsIndex === 3 ||
            (tagsIndex === 5 && Tags.getAt(2, path.node.tags).type === InitializerTag)) &&
          Tags.getAt(path.referenceIndex, path.parent.node.tags)?.type === ShiftTag
        ) {
          let shiftStack = tag.value.node.bounds[0];

          let gapNode = BTree.getAt(-1, shiftStack).node;

          path = new Path(path, gapNode, tagsIndex - 2);
          tagsIndex = 0;
          continue;
        }

        path = path.push(tag.value.node, tagsIndex - 2);
        tagsIndex = 0;
        continue;
      }

      // shift
      if (tag.type === BindingTag && prevTag.type === ShiftTag) {
        let refIndex = tagsIndex - 1 - prevTag.value.index * 3;
        if (refIndex < 0) throw new Error();
        let refTag = Tags.getAt(refIndex, path.node.tags);

        const { name, isArray } = refTag.value;
        let pathDesc = buildPathSegment(name);
        let index;
        if (isArray) {
          index = getChildPropertyIndex(path.node, refIndex);
          pathDesc = buildPathSegment(name, index);
        }

        pathDesc.shiftIndex = prevTag.value.height;

        if (index !== -1) {
          path = path.get([pathDesc]);

          if (!path) return null;

          tagsIndex = 0;
          continue;
        }
      }

      // over
      if (path.node && tagsIndex + 1 < Tags.getSize(path.node.tags)) {
        tagsIndex++;
        continue;
      }

      // out
      if (path.referenceIndex != null && path.parent) {
        do {
          if (
            path.parent &&
            Tags.getAt(path.referenceIndex, path.parent.node.tags)?.type === ShiftTag
          ) {
            tagsIndex =
              Tags.getSize(path.parent.node.tags) > path.referenceIndex + 2
                ? path.referenceIndex + 2
                : null;
          } else {
            tagsIndex = path.referenceIndex + 2;
          }

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
    let { path, tagsIndex } = this;

    let leaving = false;

    for (;;) {
      let tag = Tags.getAt(tagsIndex, path.node.tags);
      let isInitialTag = path.node === this.path.node && tagsIndex === this.tagsIndex;
      let wasLeaving = leaving;
      leaving = false;

      if (!tag) return null;

      if (tag.type === ReferenceTag && tag.value.flags.expression) {
        // look forward for another reference
        let offset = 1;
        let tag_ = tag;
        do {
          tag_ = Tags.getAt(tagsIndex + offset, path.node.tags);
          offset++;

          if (tag_?.type === InitializerTag) break;
        } while (tag_ && [BindingTag, ShiftTag].includes(tag_.type));
        if (!tag_) {
          return null;
        }
      }

      // done
      if (!isInitialTag && tag.type !== Property) {
        return new TagPath(path, tagsIndex);
      }

      // in
      if (
        tag.type === Property &&
        !wasLeaving &&
        !(Tags.getAt(tagsIndex + 1, path.node.tags)?.type === ShiftTag)
      ) {
        // TODO use properties to skip over a lot of tag walking
        path = path.push(tag.value.node, tagsIndex - 2);
        tagsIndex = 0;
        continue;
      }

      // over
      if (path.node && tagsIndex + 1 < Tags.getSize(path.node.tags)) {
        tagsIndex++;
        continue;
      }

      // out
      if (path.referenceIndex != null) {
        do {
          tagsIndex = path.referenceIndex + 2;

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
    const { path, tagsIndex } = this;

    const child = tagsIndex - 1 < 0 ? null : BTree.getAt(tagsIndex - 1, path.node.tags);

    return child && new TagPath(path, tagsIndex - 1);
  }

  get previous() {
    throw new Error('not implemented');
  }

  get previousUnshifted() {
    let { path, tagsIndex } = this;

    let leaving = false;

    for (;;) {
      let tag = Tags.getAt(tagsIndex, path.node.tags);
      let isInitialTag = path.node === this.path.node && tagsIndex === this.tagsIndex;
      let wasLeaving = leaving;
      leaving = false;

      if (!tag) return null;

      // done
      if (!isInitialTag && tag.type !== ShiftTag && tag.type !== Property) {
        return new TagPath(path, tagsIndex);
      }

      // in
      if (tag.type === Property && !wasLeaving) {
        path = path.push(tag.value.node, tagsIndex - 1);
        tagsIndex = Tags.getSize(tag.value.tags) - 1;
        continue;
      }

      // over
      if (path.node && tagsIndex + 1 < Tags.getSize(path.node.tags)) {
        tagsIndex--;
        continue;
      }

      // out
      if (path.referenceIndex != null) {
        do {
          tagsIndex = path.referenceIndex;

          path = path.parent;
          leaving = true;
        } while (tagsIndex == null);

        leaving = true;
        continue;
      }

      return null;
    }
  }

  get innerNode() {
    return this.inner?.node;
  }

  get inner() {
    let { tag, previousSibling } = this;

    let refPath = previousSibling?.previousSibling;

    if (tag.type !== Property) {
      return null;
    }

    let shiftPath = null;
    if (refPath.tag.type === ShiftTag) {
      shiftPath = refPath;
      refPath = TagPath.from(this.path, this.tagsIndex - refPath.tag.value.index * 3 - 2);
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
