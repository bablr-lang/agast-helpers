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
  BindingTag,
} from './symbols.js';
import {
  buildInitializerTag,
  buildEmbeddedNode,
  buildBindingTag,
  buildReferenceTag,
  buildShiftTag,
} from './builders.js';
import { buildGapTag, buildStubNode } from './tree.js';
import { isString } from './object.js';

export const buildPathSegment = (name, index = null, shiftIndex = null) => {
  return { type: null, name, index, shiftIndex };
};

export const buildTypePathSegment = (type, index = null, shiftIndex = null) => {
  return { type, name: null, index, shiftIndex };
};

export const buildFullPathSegment = (type, name, index = null, shiftIndex = null) => {
  return { type, name, index, shiftIndex };
};

export const getRoot = (node, index = 0) => {
  if (node == null) {
    return node;
  }
  if (isFragmentNode(node)) {
    let idx = getPropertyChildrenIndex(node, '.', null, index);

    if (idx == null) return null;

    return sumtree.getAt(idx + 1, node.children).value;
  }
  return node;
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
  let child = sumtree.getAt(childrenIndex, agAstNode.children);

  let refIndex = child.type === ShiftTag ? childrenIndex - child.value.index * 2 : childrenIndex;

  let stack = sumtree.findPath(refIndex, agAstNode.children);
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
  let firstRefIndex = __getPropertyChildrenIndex(agAstNode, type, name, 0);
  let nextTag = sumtree.getAt(firstRefIndex + 1, agAstNode.children);
  let initializerOffset = nextTag.type === InitializerTag ? 1 : 0;

  if (isArray) {
    if (index == null) {
      if (type) {
        index = btree.getSums(agAstNode.children).specialTypes[type] - 1 - initializerOffset;
      } else {
        index = btree.getSums(agAstNode.children).references[name] - 1 - initializerOffset;
      }
    }
  }

  return __getPropertyChildrenIndex(agAstNode, type, name, index + initializerOffset);
};

export const getInitializerChildrenIndex = (agAstNode, reference) => {
  let { type, name } = reference.value;
  return __getPropertyChildrenIndex(agAstNode, type, name, 0);
};

const __getPropertyChildrenIndex = (agAstNode, type, name, index) => {
  let nameCount = 0;
  let node = agAstNode.children;
  let idx = -1;

  // drill into subtrees, passing over subtrees with too few references of the desired name
  outer: while (node) {
    let isLeaf = sumtree.isLeafNode(node);
    let sums = sumtree.getSums(node);
    let valueNameCount = type == null ? sums.references[name] : sums.specialTypes[type];

    if (nameCount + valueNameCount < index) {
      return null;
    }

    for (const value of sumtree.getValues(node)) {
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
        let valueSums = sumtree.getSums(value);
        if (
          nameCount + (type == null ? valueSums.references[name] : valueSums.specialTypes[type]) >
          index
        ) {
          node = value;
          continue outer;
        } else {
          nameCount +=
            (type == null ? valueSums.references[name] : valueSums.specialTypes[type]) ?? 0;
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
    } else if (child.type === BindingTag) {
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

export const getProperties = (pathSegment, properties) => {
  if (!hasOwn(pathSegment, 'shiftIndex')) throw new Error();
  let { name, index } = pathSegment;

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
  if (!node) throw new Error();

  if (path == null) throw new Error('Bad path');

  if (!isArray(path)) {
    path = [path];
  }

  let ref = null;
  let node_ = node;
  for (let i = 0; i < path.length; i++) {
    let nameOrSeg = path[i];
    let isName = typeof nameOrSeg === 'string';
    let binding;

    if (!isName && (!nameOrSeg || !hasOwn(nameOrSeg, 'shiftIndex'))) throw new Error('Bad path');

    let name = isName ? nameOrSeg : nameOrSeg.name;

    if (name) {
      let { index } = nameOrSeg;

      if (index < 0) {
        index = btree.getSize(node.properties[name]) + index;
      }
      i++;

      binding = getProperties(buildPathSegment(name, index), node_.properties);

      ({ node: node_, reference: ref } = binding || {});
    } else if (!isName) {
      let { type } = nameOrSeg;
      if (type !== '.') throw new Error('not implemented');

      let refIndex = getPropertyChildrenIndex(node_, '.');

      if (refIndex == null) return null;

      ref = sumtree.getAt(refIndex, node_.children);
      node_ = sumtree.getAt(refIndex + 1, node_.children).value;
    } else {
      throw new Error();
    }

    if (!node_) return null;

    if (ref.value.flags.expression) {
      node_ = btree.getAt(isName || !nameOrSeg.shiftIndex ? -1 : nameOrSeg.shiftIndex, node_);
    }
  }

  return node_;
};

export const add = (node, reference, value, shift = null) => {
  if (shift === 0) throw new Error();
  if (node == null || reference == null) throw new Error('invalid arguments to add');
  if (value === node) {
    throw new Error('cannot add a node to itself');
  }

  if (!node.flags.hasGap && value && !Array.isArray(value) && value.flags.hasGap) {
    throw new Error();
  }

  let { properties } = node;
  let { type: refType, name, isArray, flags } = reference.value;

  if (getCloseTag(node)) throw new Error('node is done');

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
    node.children = sumtree.push(node.children, shift > 1 ? buildShiftTag(shift) : reference);
  }

  if (name == null) {
    if (isInitializer) {
      if (hasOwn(properties, name)) throw new Error('double initializer');
      node.children = sumtree.push(node.children, buildInitializerTag(true));
    } else {
      node.children = sumtree.push(node.children, buildEmbeddedNode(value));
    }
  } else {
    if (isArray) {
      let exists = !isInitializer && isDefined(properties, name);

      if (isInitializer && hasOwn(properties, name)) throw new Error('double initializer');

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
          let shiftedNodes =
            shift > 1
              ? btree.getAt(-1, properties[name])?.node || [buildStubNode(buildGapTag())]
              : [buildStubNode(buildGapTag())];

          newBinding = freeze({
            reference,
            node: btree.push(shiftedNodes, value),
          });
        } else {
          newBinding = freeze({ reference, node: value });
        }

        properties[name] =
          shift > 1
            ? btree.replaceAt(-1, properties[name], newBinding)
            : btree.push(properties[name], newBinding);

        node.children = sumtree.push(node.children, buildBindingTag());
      }
    } else {
      if (value === undefined) {
        if (hasOwn(properties, name)) throw new Error('double initializer');
        if (isUndefined(properties, name)) {
          let newBinding;
          if (flags.expression) {
            let shiftedNodes =
              shift > 1
                ? btree.getAt(-1, properties[name])?.node || [buildStubNode(buildGapTag())]
                : [buildStubNode(buildGapTag())];

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

          let shiftedNodes = shift > 1 ? properties[name]?.node : [buildStubNode(buildGapTag())];
          properties[name] = { reference, node: btree.push(shiftedNodes, value) };
        } else {
          if (shift != null) throw new Error();
          if (hasOwn(properties, name) && properties[name].node !== undefined) {
            throw new Error(`Cannot assign name: ${name} twice. Should it have been an array?`);
          }
          properties[name] = { reference, node: value };
        }
        node.children = sumtree.push(node.children, buildBindingTag());
      }
    }
  }
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
  let sum = sumtree.getSize(node.children);
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
    refTagPath = tagPath.siblingAt(tagPath.childrenIndex - tagPath.tag.value.index * 2);
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

    if (!(hasOwn(node, 'type') && hasOwn(node, 'properties'))) throw new Error();

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

    // if (
    //   parent &&
    //   (['#', '@'].includes(this.reference.value.type)
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
    return TagPath.from(this, -1);
  }

  get closeTag() {
    return this.closeTagPath.tag;
  }

  tagPathAt(idx) {
    return TagPath.from(this, idx);
  }

  get reference() {
    return (
      (this.parent?.node ?? null) && sumtree.getAt(this.referenceIndex, this.parent.node.children)
    );
  }

  get referencePath() {
    return (this.parent?.node ?? null) && new TagPath(this.parent, this.referenceIndex);
  }

  get(path, shiftIndex = null) {
    if (shiftIndex !== null) throw new Error();

    let path_ = path;
    if (typeof path_ === 'string') {
      path_ = [path_];
    }
    if (!isArray(path_)) throw new Error();

    let pathInst = this;
    for (let i = 0; i < path_.length; i++) {
      let nameOrSeg = path_[i];

      if (isString(nameOrSeg)) {
        nameOrSeg = { type: null, name: nameOrSeg, index: null, shiftIndex: null };
      }

      let binding = getProperties(nameOrSeg, pathInst.node.properties);

      if (!binding) return null;

      let { node, reference: ref } = binding;

      let shiftIndex_ = nameOrSeg.shiftIndex;

      if (shiftIndex_ && shiftIndex_ < 0) {
        shiftIndex_ = btree.getSize(node) + shiftIndex_;
      } else if (shiftIndex_ == null && ref.value.flags.expression) {
        shiftIndex_ = 1;
      }

      let shiftOffset = shiftIndex_ ? (shiftIndex_ - 1) * 2 : 0;

      if (ref.value.flags.expression) {
        node = btree.getAt(shiftIndex_, node);
      }

      pathInst = pathInst.push(
        node,
        getPropertyChildrenIndex(pathInst.node, nameOrSeg.type, nameOrSeg.name, nameOrSeg.index) +
          shiftOffset,
      );
    }

    return pathInst;
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

    let tag = sumtree.getAt(childrenIndex, path.node.children);

    if (tag == null) throw new Error();

    this.path = path;
    this.node = path.node;
    this.tag = tag;
    this.childrenIndex = childrenIndex;

    freeze(this);
  }

  static from(path, childrenIndex) {
    let size = sumtree.getSize(path.node.children);
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
        (tag.type !== BindingTag || prevTag.type === ShiftTag)
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
      if (tag.type === BindingTag && !wasLeaving) {
        let refIndex = childrenIndex - 1;
        let refTag;
        let prevTag = sumtree.getAt(childrenIndex - 1, path.node.children);
        let nextTag = sumtree.getAt(childrenIndex + 1, path.node.children);

        if (
          path.parent &&
          (childrenIndex === 2 ||
            (childrenIndex === 4 &&
              sumtree.getAt(2, path.node.children).type === InitializerTag)) &&
          sumtree.getAt(path.referenceIndex, path.parent.node.children)?.type === ShiftTag
        ) {
          let refTag = prevTag;
          let binding = path.node.properties[refTag.value.name];
          let third = sumtree.getAt(2, path.node.children);
          // this doesn't appear to know how to get back to the right index
          // ...given that this gap can be bound from more than one location
          // path = path.get(refTag.value.name, 0);
          path = new Path(path, btree.getAt(0, binding.node), 1);
          childrenIndex = 0;
          continue;
          // if (childrenIndex === 2) {
          //   childrenIndex = path.referenceIndex + 1;
          //   path = path.parent;
          //   leaving = true;
          //   continue;
          // }
        }

        if (prevTag.type === ReferenceTag) {
          refTag = prevTag;

          if (nextTag && nextTag.type === ShiftTag) {
            let { name, isArray, index: index_ } = refTag.value;
            const shifts = getProperties(buildPathSegment(name, index_), path.node.properties).node;

            if (!Array.isArray(shifts)) throw new Error();

            let index = isArray ? getChildPropertyIndex(path.node, refIndex) : null;

            if (index !== -1) {
              path = path.get([index == null ? name : buildPathSegment(name, index, 1)]);
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
                path = path.get([buildPathSegment(name, index)]);
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
            path = path.get([buildPathSegment(name, index, prevTag.value.index)]);

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
        let pathDesc = buildPathSegment(name);
        let index;
        if (isArray) {
          index = getChildPropertyIndex(path.node, refIndex);
          pathDesc = buildPathSegment(name, index);
        }

        pathDesc.shiftIndex = tag.value.index + 1;

        if (index !== -1) {
          path = path.get([pathDesc]);

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
      if (path.referenceIndex != null && path.parent) {
        do {
          if (
            path.parent &&
            sumtree.getAt(path.referenceIndex, path.parent.node.children)?.type === ShiftTag
          ) {
            childrenIndex =
              sumtree.getSize(path.parent.node.children) > path.referenceIndex + 2
                ? path.referenceIndex + 2
                : null;
          } else {
            childrenIndex = path.referenceIndex + 1;
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
      let tag = sumtree.getAt(childrenIndex, path.node.children);
      let isInitialTag = path.node === this.path.node && childrenIndex === this.childrenIndex;
      let wasLeaving = leaving;
      leaving = false;

      if (!tag) return null;

      if (tag.type === ReferenceTag && tag.value.flags.expression) {
        // look forward for another reference
        let offset = 1;
        let tag_ = tag;
        do {
          tag_ = sumtree.getAt(childrenIndex + offset, path.node.children);
          offset++;

          if (tag_?.type === InitializerTag) break;
        } while (tag_ && [BindingTag, ShiftTag].includes(tag_.type));
        if (!tag_) {
          return null;
        }
      }

      // done
      if (
        !isInitialTag &&
        tag.type !== EmbeddedNode &&
        tag.type !== ShiftTag &&
        tag.type !== BindingTag
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
      if (tag.type === BindingTag && !wasLeaving) {
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
            const { flags, name, isArray } = refTag.value;
            let pathDesc = buildPathSegment(name);
            if (isArray) {
              let index_ = getChildPropertyIndex(path.node, refIndex);
              if (index_ !== -1) {
                pathDesc.index = index_;
              }
            }

            if (flags.expression) {
              pathDesc.shiftIndex = -1;
            }

            if (refTag) {
              path = path.get([pathDesc]);
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
        tag.type !== BindingTag
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
      if (tag.type === BindingTag && !wasLeaving) {
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

  get innerNode() {
    return this.inner?.node;
  }

  get inner() {
    let { tag, previousSibling: refPath } = this;

    if (tag.type !== BindingTag) {
      return null;
    }

    let shiftPath = null;
    if (refPath.tag.type === ShiftTag) {
      shiftPath = refPath;
      refPath = TagPath.from(this.path, this.childrenIndex - refPath.tag.value.index * 2 - 1);
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
