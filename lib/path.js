import { WeakStackFrame } from '@bablr/weak-stack';
import * as btree from '@bablr/agast-helpers/btree';
import * as sumtree from '@bablr/agast-helpers/sumtree';
import {
  ReferenceTag,
  InitializerTag,
  EmbeddedNode,
  DoctypeTag,
  OpenNodeTag,
  CloseNodeTag,
  GapTag,
  NullTag,
  ShiftTag,
} from './symbols.js';
import {
  buildInitializerTag,
  buildEmbeddedNode,
  buildGapTag,
  buildReferenceTag,
  buildShiftTag,
} from './builders.js';

export const getOpenTag = (node) => {
  if (!node.children.length) return null;
  let tag = sumtree.getAt(0, node.children);
  if (tag.type === NullTag || tag.type === GapTag) return null;
  if (tag.type === DoctypeTag) {
    tag = sumtree.getAt(1, node.children);
  }
  if (tag && tag.type !== OpenNodeTag) throw new Error();
  return tag;
};

export const getCloseTag = (node) => {
  const { children } = node;
  const tag = sumtree.getAt(-1, children);
  if (tag.type !== CloseNodeTag) return null;
  return tag;
};

export const isNullNode = (node) => {
  return node && node.type === null && sumtree.getAt(0, node.children).type === NullTag;
};

export const isFragmentNode = (node) => {
  return node && node.type === null && getOpenTag(node)?.value.type === null;
};

export const isGapNode = (node) => {
  return node && node.type === null && sumtree.getAt(0, node.children).type === GapTag;
};

export const getChildPropertyIndex = (agAstNode, childrenIndex) => {
  let stack = sumtree.findPath(childrenIndex, agAstNode.children);
  let { node, index: leafIdx } = stack.value;
  let leaf = sumtree.getAt(leafIdx, node);

  if (leaf.type !== ReferenceTag) return null;

  let { name, isArray } = leaf.value;
  let count = -1;

  if (!isArray) return null;

  for (let i = leafIdx; i >= 0; i--) {
    let value = sumtree.getAt(i, node);

    if (value.type === ReferenceTag && value.value.name === name) {
      count++;
    }
  }
  stack = stack.pop();

  if (!stack.size) return count - 1;

  ({ node, index: leafIdx } = stack.value);

  do {
    for (let i = leafIdx - 1; i >= 0; i--) {
      let childNode = sumtree.getValues(node)[i];
      let { references } = sumtree.getSums(childNode);

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

export const getPropertyChildrenIndex = (agAstNode, type, name, index) => {
  if (isArray) {
    if (index == null) {
      index = btree.getSize(agAstNode.properties[name]) - 1;
    }
  }

  let firstRefIndex = __getPropertyChildrenIndex(agAstNode, name, 0);
  let nextTag = sumtree.getAt(firstRefIndex + 1, agAstNode.children);

  return __getPropertyChildrenIndex(
    agAstNode,
    name,
    index + (nextTag.type === InitializerTag ? 1 : 0),
  );
};

export const getInitializerChildrenIndex = (agAstNode, reference) => {
  return __getPropertyChildrenIndex(agAstNode, reference.value.name, 0);
};

const __getPropertyChildrenIndex = (agAstNode, name, index) => {
  let nameCount = 0;
  let node = agAstNode.children;
  let idx = -1;

  // drill into subtrees, passing over subtrees with too few references of the desired name
  outer: while (node) {
    let isLeaf = sumtree.isLeafNode(node);
    let sums = sumtree.getSums(node);
    let valueNameCount = sums.references[name];

    if (nameCount + valueNameCount < index) {
      return null;
    }

    for (const value of sumtree.getValues(node)) {
      if (isLeaf) {
        idx++;
        let tag = value;
        if (tag.type === ReferenceTag && tag.value.name === name) {
          nameCount += 1;
          if (nameCount > index) {
            return idx;
          }
        }
      } else {
        let valueSums = sumtree.getSums(value);
        if (nameCount + valueSums.references[name] > index) {
          node = value;
          continue outer;
        } else {
          nameCount += valueSums.references[name] ?? 0;
          idx += sumtree.getSize(value);
        }
      }
    }

    return null;
  }

  return null;
};

const { hasOwn, freeze } = Object;
const { isArray } = Array;

export const getFirstProperty = (node) => {
  let ref = null;
  for (let child of sumtree.traverse(node.children)) {
    if (child.type === ReferenceTag) {
      ref = child;
    } else if (child.type === GapTag) {
      let { name } = ref.value;
      return get([name, 0], node);
    }
  }
  return null;
};

export const referencesAreEqual = (a, b) => {
  return (
    a === b ||
    (a.value.name === b.value.name &&
      a.value.isArray === b.value.isArray &&
      a.value.flags.hasGap === b.value.flags.hasGap &&
      a.value.flags.expression === b.value.flags.expression)
  );
};

export const getProperties = (name, index, properties) => {
  if (hasOwn(properties, name)) {
    let prop = properties[name];

    if (isArray(prop)) {
      return btree.getAt(index ?? -1, prop);
    } else {
      return prop;
    }
  }
  return undefined;
};

export const isDefined = (obj, key) => hasOwn(obj, key) && obj[key] !== undefined;
export const isUndefined = (obj, key) => !hasOwn(obj, key) || obj[key] === undefined;

export const get = (path, node) => {
  return getShifted(null, path, node);
};

export const getShifted = (shiftIndex, path, node) => {
  if (typeof path === 'string') {
    path = [path];
  }

  if (!isArray(path)) throw new Error();

  let ref = null;
  let node_ = node;
  for (let i = 0; i < path.length; i++) {
    let name = path[i];
    let index = null;
    if (Number.isFinite(path[i + 1])) {
      index = path[i + 1];
      if (index < 0) {
        index = btree.getSize(node.properties[name]) + index;
      }
      i++;
    }

    ({ node: node_, reference: ref } = getProperties(name, index, node_.properties));
  }

  return ref.value.flags.expression ? btree.getAt(shiftIndex ?? -1, node_) : node_;
};

export const add = (node, reference, value, shift = null) => {
  if (node == null || reference == null) throw new Error('invalid arguments to add');
  if (value === node) {
    throw new Error('cannot add a node to itself');
  }

  let { properties } = node;
  let { type: refType, name, isArray, flags } = reference.value;

  if (node.type && refType === '.') {
    throw new Error('Only fragments can have . properties');
  }

  if (Array.isArray(value) && !isArray) throw new Error();
  if (Array.isArray(value) && value.length) throw new Error();

  if (name == null && !['.', '#', '@'].includes(refType)) throw new Error();

  let lastChild = sumtree.getAt(-1, node.children);

  let isInitializer = Array.isArray(value);
  if (isInitializer && value.length) throw new Error();

  if (lastChild.type === ReferenceTag) {
    if (!referencesAreEqual(lastChild, reference)) throw new Error();
  } else if (lastChild.type !== ShiftTag) {
    if ([ShiftTag, ReferenceTag].includes(sumtree.getAt(-1, node.children).type)) throw new Error();
    node.children = sumtree.push(node.children, shift > 0 ? buildShiftTag(shift) : reference);
  }

  if (name == null) {
    if (isInitializer) {
      node.children = sumtree.push(node.children, buildInitializerTag(true));
    } else {
      node.children = sumtree.push(node.children, buildEmbeddedNode(value));
    }
  } else {
    if (isArray) {
      let exists = !isInitializer && isDefined(properties, name);

      let existed = exists;
      if (!existed) {
        properties[name] = [];
        node.children = sumtree.push(node.children, buildInitializerTag(true));
        exists = !isInitializer;
      }

      if (exists) {
        if (!existed) {
          if (sumtree.getAt(-1, node.children).type === ReferenceTag) throw new Error();
          node.children = sumtree.push(node.children, reference);
        }

        let newBinding;
        if (flags.expression) {
          let shiftedNodes = shift > 0 ? btree.getAt(-1, properties[name])?.node : [];

          newBinding = freeze({
            reference,
            node: btree.push(shiftedNodes, value),
          });
        } else {
          newBinding = freeze({ reference, node: value });
        }

        properties[name] =
          shift > 0
            ? btree.replaceAt(-1, properties[name], newBinding)
            : btree.push(properties[name], newBinding);

        node.children = sumtree.push(node.children, buildGapTag(value));
      }
    } else {
      if (value === undefined) {
        if (isUndefined(properties, name)) {
          let newBinding;
          if (flags.expression) {
            let shiftedNodes = shift > 0 ? btree.getAt(-1, properties[name])?.node : [];

            newBinding = {
              reference,
              node: btree.push(shiftedNodes, undefined),
            };
          } else {
            newBinding = { reference, node: undefined };
          }
          properties[name] = newBinding;
          node.children = sumtree.push(node.children, buildInitializerTag());
        }
      } else {
        if (flags.expression) {
          if (shift == null) {
            throw new Error();
          }

          let shiftedNodes = shift ? properties[name]?.node : [];
          properties[name] = { reference, node: btree.push(shiftedNodes, value) };
        } else {
          if (shift != null) throw new Error();
          if (hasOwn(properties, name) && properties[name].node !== undefined) {
            throw new Error(`Cannot assign name: ${name} twice. Should it have been an array?`);
          }
          properties[name] = { reference, node: value };
        }
        node.children = sumtree.push(node.children, buildGapTag(value));
      }
    }
  }
};

export function* allTagPathsFor(range, options = {}) {
  if (range == null) return;

  const { unshift = false } = options;
  let startPath = range[0];
  let endPath = range[1];
  let path = startPath;

  while (path) {
    if (path.inner && path.previousSibling.tag.type === ReferenceTag) {
      path = new TagPath(path.innerPath, 0);
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
  let sum = sumtree.getSize(node.children);
  return sum ? [0, sum - 1] : null;
};

export function* ownTagPathsFor(range) {
  if (!isArray(range)) throw new Error();

  let startPath = range[0];
  let endPath = range[1];

  if (startPath.outer !== endPath.outer) throw new Error();

  let { children } = startPath.outer;

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

    skips[skipIdx] = frame.at(frame.depth - skipAmount);

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

export const Path = class AgastPath extends WeakStackFrame {
  static from(node) {
    return this.create(node);
  }

  constructor(parent, node, referenceIndex = null) {
    super(parent);

    if (!(hasOwn(node, 'type') && hasOwn(node, 'language'))) throw new Error();

    if (parent && referenceIndex == null) throw new Error();
    if (!node) throw new Error();
    if (isArray(node)) throw new Error();

    this.node = node;
    this.referenceIndex = referenceIndex; // in the parent

    if (
      referenceIndex != null &&
      ![ReferenceTag, ShiftTag].includes(sumtree.getAt(referenceIndex, parent.node.children).type)
    ) {
      throw new Error();
    }

    if (parent && (!this.reference || ![ReferenceTag, ShiftTag].includes(this.reference.type))) {
      throw new Error();
    }

    if (!Number.isFinite(this.depth)) throw new Error();

    buildSkips(this);
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
    return TagPath.from(this, -1);
  }

  get closeTag() {
    return this.closeTagPath.tag;
  }

  get reference() {
    return this.outer && sumtree.getAt(this.referenceIndex, this.outer.children);
  }

  get referencePath() {
    return this.outer && new TagPath(this.parent, this.referenceIndex);
  }

  get gap() {
    return this.outer && sumtree.getAt(this.referenceIndex + 1, this.outer.children);
  }

  get gapPath() {
    return this.outer && new TagPath(this.parent, this.referenceIndex + 1);
  }

  get outer() {
    return this.parent?.node;
  }

  get(path, shiftIndex = null) {
    let path_ = path;
    if (typeof path_ === 'string') {
      path_ = [path_];
    }
    if (!isArray(path_)) throw new Error();

    let pathInst = this;
    for (let i = 0; i < path_.length; i++) {
      let name = path_[i];
      let index = null;
      if (Number.isFinite(path_[i + 1])) {
        index = path_[i + 1];
        i++;
      }

      let { node, reference: ref } = getProperties(name, index, pathInst.node.properties);
      let shiftOffset = (shiftIndex && i === path_.length - 1 ? shiftIndex : 0) * 2;

      if (ref.value.flags.expression) {
        node = btree.getAt(shiftIndex ?? 0, node);
      }

      pathInst = pathInst.push(
        node,
        getPropertyChildrenIndex(pathInst.node, ref.value.type, ref.value.name, index) +
          shiftOffset,
      );
    }

    return pathInst;
  }

  at(depth) {
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

    this.path = path;
    this.childrenIndex = childrenIndex;

    if (this.tag == null) throw new Error();
  }

  static from(path, childrenIndex) {
    let size = sumtree.getSize(path.node.children);
    let index = childrenIndex < 0 ? size + childrenIndex : childrenIndex;

    return index >= 0 && index < size ? new TagPath(path, index) : null;
  }

  static fromNode(node, childrenIndex) {
    return TagPath.from(Path.from(node), childrenIndex);
  }

  get tag() {
    return this.child;
  }

  get node() {
    return this.path.node;
  }

  get child() {
    return sumtree.getAt(this.childrenIndex, this.path.node.children);
  }

  siblingPathAt(index) {
    return TagPath.from(this.path, index);
  }

  siblingAt(index) {
    return this.siblingPathAt(index)?.tag;
  }

  get nextSibling() {
    const { path, childrenIndex } = this;

    const child =
      childrenIndex + 1 >= sumtree.getSize(path.node.children)
        ? null
        : sumtree.getAt(childrenIndex + 1, path.node.children);

    return child && new TagPath(path, childrenIndex + 1);
  }

  get next() {
    let { path, childrenIndex } = this;

    let leaving = false;

    for (;;) {
      let prevTag = sumtree.getAt(childrenIndex - 1, path.node.children);
      let tag = sumtree.getAt(childrenIndex, path.node.children);
      let isInitialTag = path.node === this.path.node && childrenIndex === this.childrenIndex;
      let wasLeaving = leaving;
      leaving = false;

      if (!tag) return null;

      // done
      if (
        !isInitialTag &&
        tag.type !== EmbeddedNode &&
        (tag.type !== GapTag || isGapNode(path.node) || prevTag.type === ShiftTag)
      ) {
        return new TagPath(path, childrenIndex);
      }

      // in
      if (tag.type === EmbeddedNode && !wasLeaving) {
        path = path.push(tag.value, childrenIndex - 1);
        childrenIndex = 0;
        continue;
      }

      // in
      if (tag.type === GapTag && !wasLeaving && !isGapNode(path.node)) {
        let refIndex = childrenIndex - 1;
        let refTag;
        let prevTag = sumtree.getAt(childrenIndex - 1, path.node.children);
        let nextTag = sumtree.getAt(childrenIndex + 1, path.node.children);

        if (
          path.parent &&
          sumtree.getAt(path.referenceIndex, path.outer.children)?.type === ShiftTag
        ) {
          let third = sumtree.getAt(2, path.node.children);
          if (childrenIndex === 2 || (childrenIndex === 4 && third.type === InitializerTag)) {
            childrenIndex = path.referenceIndex + 1;
            path = path.parent;
            leaving = true;
            continue;
          }
        }

        if (prevTag.type === ReferenceTag) {
          refTag = prevTag;

          if (nextTag && nextTag.type === ShiftTag) {
            const shifts = getProperties(
              refTag.value.name,
              refTag.value.index,
              path.node.properties,
            ).node;

            if (!Array.isArray(shifts)) throw new Error();

            let { name, isArray } = refTag.value;
            let index = isArray ? getChildPropertyIndex(path.node, refIndex) : null;

            if (index !== -1) {
              path = path.get(index == null ? name : [name, index], 0);
              childrenIndex = 0;

              if (!path) {
                return null;
              }
              continue;
            }
          } else {
            if (
              refTag.value.name != null &&
              (!refTag.value.isArray || getChildPropertyIndex(path.node, refIndex) != null)
            ) {
              let { name, isArray } = refTag.value;
              let index = isArray ? getChildPropertyIndex(path.node, refIndex) : null;

              if (index !== -1) {
                path = path.get(index == null ? name : [name, index]);
                childrenIndex = 0;

                if (!path) {
                  return null;
                }
                continue;
              }
            }
          }
        } else if (prevTag.type === ShiftTag) {
          let refIndex = childrenIndex - prevTag.value.index * 2 - 1;
          let refTag = sumtree.getAt(refIndex, path.node.children);

          const { name, isArray } = refTag.value;
          let index = isArray ? getChildPropertyIndex(path.node, refIndex) : null;

          if (index !== -1) {
            path = path.get(index == null ? name : [name, index], prevTag.value.index);

            childrenIndex = sumtree.getAt(2, path.node.children).type === InitializerTag ? 5 : 3;
            continue;
          }
        } else {
          throw new Error();
        }
      }

      // shift
      if (tag.type === ShiftTag) {
        let refIndex = childrenIndex - tag.value.index * 2;
        let refTag = sumtree.getAt(refIndex, path.node.children);

        const { name, isArray } = refTag.value;
        let pathDesc = name;
        let index;
        if (isArray) {
          index = getChildPropertyIndex(path.node, refIndex);
          pathDesc = [name, index];
        }
        if (index !== -1) {
          path = path.get(pathDesc, tag.value.index);

          if (!path) return null;

          childrenIndex = 0;
          continue;
        }
      }

      // over
      if (path.node && childrenIndex + 1 < sumtree.getSize(path.node.children)) {
        childrenIndex++;
        continue;
      }

      // out
      if (path.referenceIndex != null) {
        do {
          if (sumtree.getAt(path.referenceIndex, path.outer.children)?.type === ShiftTag) {
            childrenIndex =
              sumtree.getSize(path.outer.children) > path.referenceIndex + 2
                ? path.referenceIndex + 2
                : null;
          } else {
            childrenIndex = path.referenceIndex + 1;
          }

          path = path.parent;
          leaving = true;
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
      let tag = sumtree.getAt(childrenIndex, path.node.children);
      let isInitialTag = path.node === this.path.node && childrenIndex === this.childrenIndex;
      let wasLeaving = leaving;
      leaving = false;

      if (!tag) return null;

      // done
      if (
        !isInitialTag &&
        tag.type !== EmbeddedNode &&
        tag.type !== ShiftTag &&
        (tag.type !== GapTag || isGapNode(path.node))
      ) {
        return new TagPath(path, childrenIndex);
      }

      // in
      if (tag.type === EmbeddedNode && !wasLeaving) {
        path = path.push(tag.value, childrenIndex - 1);
        childrenIndex = 0;
        continue;
      }

      // in
      if (tag.type === GapTag && !wasLeaving && !isGapNode(path.node)) {
        let refIndex = childrenIndex - 1;
        let refTag;
        let prevTag = sumtree.getAt(childrenIndex - 1, path.node.children);

        if (prevTag.type === ShiftTag) {
          // continue
        } else if (prevTag.type === ReferenceTag) {
          refTag = prevTag;

          if (
            !['#', '@'].includes(refTag.value.type) &&
            (!refTag.value.isArray || getChildPropertyIndex(path.node, refIndex) != null)
          ) {
            const { name, isArray } = refTag.value;
            let pathDesc = name;
            if (isArray) {
              let index_ = getChildPropertyIndex(path.node, refIndex);
              if (index_ !== -1) {
                pathDesc = [name, index_];
              }
            }

            if (refTag) {
              path = path.get(pathDesc);
              childrenIndex = 0;

              if (!path) {
                return null;
              }
              continue;
            }
          }
        } else {
          throw new Error();
        }
      }

      // over
      if (path.node && childrenIndex + 1 < sumtree.getSize(path.node.children)) {
        childrenIndex++;
        continue;
      }

      // out
      if (path.referenceIndex != null) {
        do {
          childrenIndex = path.referenceIndex + 1;

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
      let tag = sumtree.getAt(childrenIndex, path.node.children);
      let isInitialTag = path.node === this.path.node && childrenIndex === this.childrenIndex;
      let wasLeaving = leaving;
      leaving = false;

      if (!tag) return null;

      // done
      if (
        !isInitialTag &&
        tag.type !== EmbeddedNode &&
        tag.type !== ShiftTag &&
        (tag.type !== GapTag || isGapNode(path.node))
      ) {
        return new TagPath(path, childrenIndex);
      }

      // in
      if (tag.type === EmbeddedNode && !wasLeaving) {
        path = path.push(tag.value, childrenIndex - 1);
        childrenIndex = sumtree.getSize(tag.value.children) - 1;
        continue;
      }

      // in
      if (tag.type === GapTag && !wasLeaving && !isGapNode(path.node)) {
        let refIndex = childrenIndex - 1;
        let refTag;
        let prevTag = sumtree.getAt(childrenIndex - 1, path.node.children);

        if (prevTag.type === ShiftTag) {
          // continue
        } else if (prevTag.type === ReferenceTag) {
          refTag = prevTag;

          if (
            !['#', '@'].includes(refTag.value.type) &&
            (!refTag.value.isArray || getChildPropertyIndex(path.node, refIndex) != null)
          ) {
            const { type, name, isArray, flags } = refTag.value;
            let resolvedReference = refTag;
            if (isArray) {
              let index = getChildPropertyIndex(path.node, refIndex);
              resolvedReference =
                index === -1 ? null : buildReferenceTag(type, name, index != null, flags, index);
            }

            if (resolvedReference) {
              path = path.get(resolvedReference);
              childrenIndex = 0;

              if (!path) {
                return null;
              }
              continue;
            }
          }
        } else {
          throw new Error();
        }
      }

      // over
      if (path.node && childrenIndex + 1 < sumtree.getSize(path.node.children)) {
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

  get inner() {
    return this.innerPath?.node;
  }

  get innerPath() {
    let { tag, previousSibling: refPath } = this;

    if (tag.type !== GapTag || isGapNode(this.node)) {
      return null;
    }

    let shiftPath = null;
    if (refPath.tag.type === ShiftTag) {
      shiftPath = refPath;
      refPath = TagPath.from(this.path, this.childrenIndex - refPath.tag.value.index * 2 - 1);
    }

    if (refPath.tag.type !== ReferenceTag) throw new Error();

    const { type, name, flags, isArray } = refPath.tag.value;
    let pathSpec = name;

    if (isArray) {
      pathSpec = [name, getChildPropertyIndex(refPath.path.node, refPath.childrenIndex)];
    }

    return this.path.get(pathSpec, shiftPath?.tag.value.index);
  }

  equalTo(tagPath) {
    return this.node === tagPath.node && this.childrenIndex === tagPath.childrenIndex;
  }
}
