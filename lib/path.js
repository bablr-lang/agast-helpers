import { WeakStackFrame } from '@bablr/weak-stack';
import * as btree from '@bablr/agast-helpers/btree';
import * as Children from './children.js';
import {
  ReferenceTag,
  InitializerTag,
  DoctypeTag,
  OpenNodeTag,
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
  let idx = getPropertyChildrenIndex(node, '.', null, index);

  if (idx == null) return null;

  let tag = Children.getAt(idx + 2, node.children);

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
  if (!node.children.length) return null;
  let tag = Children.getAt(0, node.children);
  if (tag.type === NullTag || tag.type === GapTag) return null;
  if (tag.type === DoctypeTag) {
    tag = Children.getAt(1, node.children);
  }
  if (tag && tag.type !== OpenNodeTag) throw new Error();
  return tag;
};

export const getCloseTag = (node) => {
  const { children } = node;
  const tag = Children.getAt(-1, children);
  if (tag.type !== CloseNodeTag) return null;
  return tag;
};

export const isNullNode = (node) => {
  return node && node.type === null && Children.getAt(0, node.children).type === NullTag;
};

export const isFragmentNode = (node) => {
  return node && node.type === null && getOpenTag(node)?.value.type === null;
};

export const isGapNode = (node) => {
  return node && node.type === null && Children.getAt(0, node.children).type === GapTag;
};

export const isStubNode = (node) => {
  return (
    node && node.type === null && [GapTag, NullTag].includes(Children.getAt(0, node.children).type)
  );
};

export const isStubTag = (tag) => {
  return [GapTag, NullTag].includes(tag.type);
};

export const getChildPropertyIndex = (agAstNode, childrenIndex) => {
  let child = Children.getAt(childrenIndex, agAstNode.children);

  let refIndex = child.type === ShiftTag ? childrenIndex - child.value.index * 3 : childrenIndex;

  let stack = Children.findPath(refIndex, agAstNode.children);
  let { node, index: leafIdx } = stack.value;
  let leaf = Children.getAt(leafIdx, node);

  if (leaf.type !== ReferenceTag) return null;

  let { name, isArray } = leaf.value;
  let count = -1;

  if (!isArray) return null;

  for (let i = leafIdx; i >= 0; i--) {
    let value = Children.getAt(i, node);

    if (value.type === ReferenceTag && value.value.name === name) {
      count++;
    }
  }
  stack = stack.pop();

  if (!stack.size) return count - 1;

  ({ node, index: leafIdx } = stack.value);

  do {
    for (let i = leafIdx - 1; i >= 0; i--) {
      let childNode = Children.getValues(node)[i];
      let { references } = Children.getSums(childNode);

      if (hasOwn(references, name)) {
        count += references[name];
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

export const getPropertyChildrenIndex = (agAstNode, type, name, index, shiftIndex) => {
  let firstRefIndex = __getPropertyChildrenIndex(agAstNode, type, name, 0);
  let ref = firstRefIndex == null ? null : Children.getAt(firstRefIndex, agAstNode.children);
  let nextTag =
    firstRefIndex == null ? null : Children.getAt(firstRefIndex + 1, agAstNode.children);
  let initializerOffset = nextTag?.type === InitializerTag ? 1 : 0;

  if (ref?.value.isArray) {
    if (index < 0) {
      if (name) {
        index = btree.getSums(agAstNode.children).references[name] - initializerOffset + index;
      } else {
        index = btree.getSums(agAstNode.children).specialTypes[type] - initializerOffset + index;
      }
    } else if (index == null) {
      if (name) {
        index = btree.getSums(agAstNode.children).references[name] - 1 - initializerOffset;
      } else {
        index = btree.getSums(agAstNode.children).specialTypes[type] - 1 - initializerOffset;
      }

      if (index < 0) return null;
    }
  }

  let refIndex = __getPropertyChildrenIndex(
    agAstNode,
    type,
    name,
    (index ?? 0) + initializerOffset,
  );

  if (ref?.value.flags.expression && shiftIndex != null) {
    if (shiftIndex < 0) {
      let shifts = 0;
      // TODO speed this up for deeply nested shifts
      // algorithm: make big jump forward, then look at shift index to see if we overshot completely
      // works because we know the size of the thing and a bigger thing doesn't fit in a smaller one
      while (Children.getAt(refIndex + shifts * 3 + 3, agAstNode.children)?.type === ShiftTag) {
        shifts++;
      }

      return refIndex + (shifts + shiftIndex + 1) * 3;
    } else {
      return refIndex + (shiftIndex - 1) * 3;
    }
  }

  return refIndex;
};

export const getInitializerChildrenIndex = (agAstNode, referenceTag) => {
  let { type, name } = referenceTag.value;
  let index = __getPropertyChildrenIndex(agAstNode, type, name, 0);

  if (index == null) return null;

  let nextTag = Children.getAt(index + 1, agAstNode.children);

  return nextTag?.type === InitializerTag ? index : null;
};

const __getPropertyChildrenIndex = (agAstNode, type, name, index) => {
  let nameCount = 0;
  let node = agAstNode.children;
  let idx = -1;

  // drill into subtrees, passing over subtrees with too few references of the desired name
  outer: while (node) {
    let isLeaf = Children.isLeafNode(node);
    let sums = Children.getSums(node);
    let valueNameCount = name != null ? sums.references[name] : sums.specialTypes[type];

    if (nameCount + valueNameCount < index) {
      return null;
    }

    for (const value of Children.getValues(node)) {
      if (isLeaf) {
        idx++;
        let tag = value;
        if (
          tag.type === ReferenceTag &&
          ((name != null && tag.value.name === name) || (type != null && tag.value.type === type))
        ) {
          nameCount += 1;
          if (nameCount > index) {
            return idx;
          }
        }
      } else {
        let valueSums = Children.getSums(value);
        if (
          nameCount + (name != null ? valueSums.references[name] : valueSums.specialTypes[type]) >
          index
        ) {
          node = value;
          continue outer;
        } else {
          nameCount +=
            (name != null ? valueSums.references[name] : valueSums.specialTypes[type]) ?? 0;
          idx += Children.getSize(value);
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
  for (let child of Children.traverse(node.children)) {
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
  for (let child of Children.traverse(node.children)) {
    if (child.type === Property) {
      let ref = child.value.reference;
      if (!ref.flags.expression) {
        return child.value;
      } else {
        let childrenIndex = getPropertyChildrenIndex(node, ref.type, ref.name, 0, -1);
        return Children.getAt(childrenIndex, node.children + 2)?.value.node;
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
  for (const child of Children.traverse(node.children)) {
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

  let refIndex = getPropertyChildrenIndex(node, type, name, index, shiftIndex);

  if (refIndex == null) return null;

  return Children.getAt(refIndex + 2, node.children)?.value;
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
    getInitializerChildrenIndex(node_, buildReferenceTag(null, name)) != null
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

  let hasInitializer = getInitializerChildrenIndex(node, buildReferenceTag(null, name)) != null;

  return Children.getSums(node.children).references[name] - (hasInitializer ? 1 : 0);
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

    if (
      endPath &&
      path.childrenIndex === endPath.childrenIndex &&
      path.path.node === endPath.path.node
    ) {
      return;
    }

    let gapPath = path.path.parent && TagPath.from(path.path.parent, path.path.referenceIndex + 1);

    if (
      endPath &&
      path.tag.type === CloseNodeTag &&
      gapPath &&
      gapPath.childrenIndex === endPath.childrenIndex &&
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
  let sum = Children.getSize(node.children);
  return sum ? [0, sum - 1] : null;
};

export function* ownTagPathsFor(range) {
  if (!isArray(range)) throw new Error();

  let startPath = range[0];
  let endPath = range[1];

  if (startPath.parent.node !== endPath.parent.node) throw new Error();

  let { children } = startPath.parent.node;

  for (let i = startPath.childrenIndex; i < endPath.childrenIndex; i++) {
    yield children[i];
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
    refTagPath = tagPath.siblingAt(tagPath.childrenIndex - tagPath.tag.value.index * 3);
  }

  let { type, name } = refTagPath.tag.value;

  if (refTagPath.tag.type !== ReferenceTag) throw new Error();

  let index = getChildPropertyIndex(tagPath.node, refTagPath.childrenIndex);
  let shiftIndex = isShift ? (tagPath.tag.value.index ?? 0) + 1 : null;

  return [{ type, name, index, shiftIndex }];
};

export const Path = class AgastPath extends WeakStackFrame {
  static from(node) {
    return node && this.create(node);
  }

  constructor(parent, node, referenceIndex = null) {
    super(parent);

    if (!(hasOwn(node, 'type') && hasOwn(node, 'children'))) throw new Error();

    if (parent && referenceIndex == null) throw new Error();
    if (!node) throw new Error();
    if (isArray(node)) throw new Error();

    this.node = node;
    this.referenceIndex = referenceIndex; // in the parent

    let referenceTag =
      referenceIndex != null && Children.getAt(referenceIndex, parent.node.children);

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
      (this.parent?.node ?? null) &&
      Children.getAt(this.referenceIndex + 1, this.parent.node.children)
    );
  }

  get bindingTagPath() {
    return (this.parent?.node ?? null) && new TagPath(this.parent, this.referenceIndex + 1);
  }

  get reference() {
    return this.referenceTag?.value;
  }

  get referenceTag() {
    return (
      (this.parent?.node ?? null) && Children.getAt(this.referenceIndex, this.parent.node.children)
    );
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
        getPropertyChildrenIndex(pathInst.node, '.', null, 0),
      );
    }

    for (let i = 0; i < path_.length; i++) {
      let nameOrSeg = path_[i];

      if (isString(nameOrSeg)) {
        nameOrSeg = { type: null, name: nameOrSeg, index: null, shiftIndex: null };
      }

      let seg = nameOrSeg;

      let childrenIndex = getPropertyChildrenIndex(
        pathInst.node,
        seg.type,
        seg.name,
        seg.index,
        seg.shiftIndex,
      );

      let property = Children.getAt(childrenIndex + 2, pathInst.node.children).value;

      if (!property) return null;

      let { node } = property;

      pathInst = pathInst.push(node, childrenIndex);
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

      built.children = Children.replaceAt(
        targetReferenceIndex + 1,
        built.children,
        buildChild(BindingTag, targetBinding),
      );
      built.children = Children.replaceAt(
        targetReferenceIndex + 2,
        built.children,
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
  return a.path.node === b.path.node && a.childrenIndex === b.childrenIndex;
};

export class TagPath {
  constructor(path, childrenIndex) {
    if (path == null || childrenIndex == null) throw new Error();

    let tag = Children.getAt(childrenIndex, path.node.children);

    if (tag == null) throw new Error();

    this.path = path;
    this.node = path.node;
    this.tag = tag;
    this.childrenIndex = childrenIndex;

    freeze(this);
  }

  static from(path, childrenIndex) {
    let size = Children.getSize(path.node.children);
    let index = childrenIndex < 0 ? size + childrenIndex : childrenIndex;

    return index >= 0 && index < size ? new TagPath(path, index) : null;
  }

  static fromNode(node, childrenIndex) {
    return TagPath.from(Path.from(node), childrenIndex);
  }

  get child() {
    return this.tag;
  }

  siblingAt(index) {
    return TagPath.from(this.path, index);
  }

  get nextSibling() {
    const { path, childrenIndex } = this;

    const child =
      childrenIndex + 1 >= Children.getSize(path.node.children)
        ? null
        : Children.getAt(childrenIndex + 1, path.node.children);

    return child && new TagPath(path, childrenIndex + 1);
  }

  get next() {
    let { path, childrenIndex } = this;

    let leaving = false;

    for (;;) {
      let prevTag = Children.getAt(childrenIndex - 1, path.node.children);
      let tag = Children.getAt(childrenIndex, path.node.children);
      let isInitialTag = path.node === this.path.node && childrenIndex === this.childrenIndex;
      let wasLeaving = leaving;
      leaving = false;

      if (!tag) return null;

      // done
      if (!isInitialTag && tag.type !== Property) {
        return new TagPath(path, childrenIndex);
      }

      // in
      if (tag.type === Property && !wasLeaving) {
        // jump to gap tag?
        if (
          path.parent &&
          tag.value.reference.flags.expression &&
          (childrenIndex === 3 ||
            (childrenIndex === 5 &&
              Children.getAt(2, path.node.children).type === InitializerTag)) &&
          Children.getAt(path.referenceIndex, path.parent.node.children)?.type === ShiftTag
        ) {
          let shiftStack = tag.value.node.leftStack;

          let gapNode = btree.getAt(-1, shiftStack).node;

          path = new Path(path, gapNode, childrenIndex - 2);
          childrenIndex = 0;
          continue;
        }

        path = path.push(tag.value.node, childrenIndex - 2);
        childrenIndex = 0;
        continue;
      }

      // shift
      if (tag.type === BindingTag && prevTag.type === ShiftTag) {
        let refIndex = childrenIndex - 1 - prevTag.value.index * 3;
        if (refIndex < 0) throw new Error();
        let refTag = Children.getAt(refIndex, path.node.children);

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

          childrenIndex = 0;
          continue;
        }
      }

      // over
      if (path.node && childrenIndex + 1 < Children.getSize(path.node.children)) {
        childrenIndex++;
        continue;
      }

      // out
      if (path.referenceIndex != null && path.parent) {
        do {
          if (
            path.parent &&
            Children.getAt(path.referenceIndex, path.parent.node.children)?.type === ShiftTag
          ) {
            childrenIndex =
              Children.getSize(path.parent.node.children) > path.referenceIndex + 2
                ? path.referenceIndex + 2
                : null;
          } else {
            childrenIndex = path.referenceIndex + 2;
          }

          path = path.parent;
          leaving = true;

          if (!path) return null;
        } while (childrenIndex == null);

        leaving = true;
        continue;
      }

      return null;
    }
  }

  get nextUnshifted() {
    let { path, childrenIndex } = this;

    let leaving = false;

    for (;;) {
      let tag = Children.getAt(childrenIndex, path.node.children);
      let isInitialTag = path.node === this.path.node && childrenIndex === this.childrenIndex;
      let wasLeaving = leaving;
      leaving = false;

      if (!tag) return null;

      if (tag.type === ReferenceTag && tag.value.flags.expression) {
        // look forward for another reference
        let offset = 1;
        let tag_ = tag;
        do {
          tag_ = Children.getAt(childrenIndex + offset, path.node.children);
          offset++;

          if (tag_?.type === InitializerTag) break;
        } while (tag_ && [BindingTag, ShiftTag].includes(tag_.type));
        if (!tag_) {
          return null;
        }
      }

      // done
      if (!isInitialTag && tag.type !== Property) {
        return new TagPath(path, childrenIndex);
      }

      // in
      if (
        tag.type === Property &&
        !wasLeaving &&
        !(Children.getAt(childrenIndex + 1, path.node.children)?.type === ShiftTag)
      ) {
        // TODO use properties to skip over a lot of tag walking
        path = path.push(tag.value.node, childrenIndex - 2);
        childrenIndex = 0;
        continue;
      }

      // over
      if (path.node && childrenIndex + 1 < Children.getSize(path.node.children)) {
        childrenIndex++;
        continue;
      }

      // out
      if (path.referenceIndex != null) {
        do {
          childrenIndex = path.referenceIndex + 2;

          path = path.parent;
          leaving = true;
        } while (childrenIndex == null);

        leaving = true;
        continue;
      }

      return null;
    }
  }

  get previousSibling() {
    const { path, childrenIndex } = this;

    const child = childrenIndex - 1 < 0 ? null : btree.getAt(childrenIndex - 1, path.node.children);

    return child && new TagPath(path, childrenIndex - 1);
  }

  get previous() {
    throw new Error('not implemented');
  }

  get previousUnshifted() {
    let { path, childrenIndex } = this;

    let leaving = false;

    for (;;) {
      let tag = Children.getAt(childrenIndex, path.node.children);
      let isInitialTag = path.node === this.path.node && childrenIndex === this.childrenIndex;
      let wasLeaving = leaving;
      leaving = false;

      if (!tag) return null;

      // done
      if (!isInitialTag && tag.type !== ShiftTag && tag.type !== Property) {
        return new TagPath(path, childrenIndex);
      }

      // in
      if (tag.type === Property && !wasLeaving) {
        path = path.push(tag.value.node, childrenIndex - 1);
        childrenIndex = Children.getSize(tag.value.children) - 1;
        continue;
      }

      // over
      if (path.node && childrenIndex + 1 < Children.getSize(path.node.children)) {
        childrenIndex--;
        continue;
      }

      // out
      if (path.referenceIndex != null) {
        do {
          childrenIndex = path.referenceIndex;

          path = path.parent;
          leaving = true;
        } while (childrenIndex == null);

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
      refPath = TagPath.from(this.path, this.childrenIndex - refPath.tag.value.index * 3 - 2);
    }

    if (refPath.tag.type !== ReferenceTag) throw new Error();

    const { type, name } = refPath.tag.value;

    return this.path.get([
      buildFullPathSegment(
        type,
        name,
        getChildPropertyIndex(refPath.path.node, refPath.childrenIndex),
        shiftPath?.tag.value.index,
      ),
    ]);
  }

  equalTo(tagPath) {
    return this.node === tagPath.node && this.childrenIndex === tagPath.childrenIndex;
  }
}
