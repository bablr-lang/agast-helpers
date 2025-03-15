import { WeakStackFrame } from '@bablr/weak-stack';
import * as btree from '@bablr/agast-helpers/btree';
import {
  ReferenceTag,
  ArrayInitializerTag,
  EmbeddedNode,
  DoctypeTag,
  OpenNodeTag,
  CloseNodeTag,
  GapTag,
  NullTag,
  ShiftTag,
} from './symbols.js';
import {
  buildArrayInitializerTag,
  buildEmbeddedNode,
  buildGapTag,
  buildReferenceTag,
  buildShiftTag,
} from './builders.js';

export const getOpenTag = (node) => {
  if (!node.children.length) return null;
  let tag = btree.getAt(0, node.children);
  if (tag.type === NullTag || tag.type === GapTag) return null;
  if (tag.type === DoctypeTag) {
    tag = btree.getAt(1, node.children);
  }
  if (tag && tag.type !== OpenNodeTag) throw new Error();
  return tag;
};

export const getCloseTag = (node) => {
  const { children } = node;
  const tag = btree.getAt(-1, children);
  if (tag.type !== CloseNodeTag) return null;
  return tag;
};

export const isNullNode = (node) => {
  return node && node.type === null && btree.getAt(0, node.children).type === NullTag;
};

export const isFragmentNode = (node) => {
  return node && node.type === null && getOpenTag(node)?.value.type === null;
};

export const isGapNode = (node) => {
  return node && node.type === null && btree.getAt(0, node.children).type === GapTag;
};

const { hasOwn } = Object;
const { isArray } = Array;

export const referencesAreEqual = (a, b) => {
  return (
    a === b ||
    (a.value.name === b.value.name &&
      a.value.isArray === b.value.isArray &&
      a.value.flags.hasGap === b.value.flags.hasGap &&
      a.value.flags.expression === b.value.flags.expression)
  );
};

export const getProperties = (ref, properties) => {
  const { name, index, isArray } = ref.value;

  if (name === '.') {
    if (!hasOwn(properties, name)) {
      return null;
    }
  }

  if (isArray) {
    return btree.getAt(index ?? -1, properties[name]);
  } else {
    return properties[name];
  }
};

export const getPropertiesSimple = (ref, properties) => {
  const { name, index, isArray } = ref.value;

  if (!hasOwn(properties, name)) {
    return null;
  }

  if (isArray) {
    return properties[name][index == null ? properties[name].length - 1 : index];
  } else {
    return properties[name];
  }
};

export const get = (ref, node) => {
  const result = getProperties(ref, node.properties);
  const { flags } = result.reference.value;

  return flags.expression ? btree.getAt(-1, result.node) : result?.node;
};

export const getShifted = (shiftIndex, ref, node) => {
  const { flags } = ref.value;

  const result = getProperties(ref, node.properties);
  return flags.expression ? btree.getAt(shiftIndex ?? -1, result.node) : result?.node;
};

export const add = (node, reference, value, shift = null) => {
  if (node == null || reference == null || value == null) throw new Error();

  const { properties } = node;
  const { name, isArray, flags } = reference.value;

  if (node.type && name === '.') {
    throw new Error('Only fragments can have . properties');
  }

  if (name == null) throw new Error();

  const lastChild = btree.getAt(-1, node.children);

  if (lastChild.type === ReferenceTag) {
    if (!referencesAreEqual(lastChild, reference)) throw new Error();
  } else if (lastChild.type !== ShiftTag) {
    node.children = btree.push(node.children, shift == null ? reference : buildShiftTag(shift));
  }

  if (name === '#' || name === '@') {
    node.children = btree.push(node.children, buildEmbeddedNode(value));
  } else {
    if (isArray) {
      let isInitializer = Array.isArray(value);
      let exists = !isInitializer && hasOwn(properties, name);

      let existed = exists;
      if (!existed) {
        if (isInitializer && value.length)
          throw new Error('Array value only allowed for initialization');

        properties[name] = [];
        node.children = btree.push(node.children, buildArrayInitializerTag(value));
        exists = !isInitializer;
      }

      if (exists) {
        if (!existed) {
          if (btree.getAt(-1, node.children).type === ReferenceTag) throw new Error();
          node.children = btree.push(node.children, reference);
        }

        let newBinding;
        if (flags.expression) {
          let shiftedNodes = shift != null ? btree.getAt(-1, properties[name])?.node : [];

          newBinding = {
            reference,
            node: btree.push(shiftedNodes, value),
          };
        } else {
          newBinding = { reference, node: value };
        }

        properties[name] =
          shift != null
            ? btree.replaceAt(-1, properties[name], newBinding)
            : btree.push(properties[name], newBinding);

        node.children = btree.push(node.children, buildGapTag(value));
      }
    } else {
      if (flags.expression) {
        let shiftedNodes = shift ? properties[name]?.node : [];
        properties[name] = { reference, node: btree.push(shiftedNodes, value) };
      } else {
        if (hasOwn(properties, name)) {
          throw new Error();
        }
        properties[name] = { reference, node: value };
      }
      node.children = btree.push(node.children, buildGapTag(value));
    }
  }
};

export function* allTagPathsFor(range) {
  if (range == null) return;

  let startPath = range[0];
  let endPath = range[1];
  let path = startPath;
  let ref;

  while (path) {
    if ([ShiftTag, ReferenceTag].includes(path.tag.type)) {
      ref = path.tag;
    }
    if (path.inner && ref?.type === ReferenceTag) {
      path = new TagPath(path.innerPath, 0);
    }

    yield path;

    if (
      endPath &&
      path.childrenIndex === endPath.childrenIndex &&
      path.path.node === endPath.path.node
    ) {
      return;
    }

    path = path.next;
  }
}

export function* allTagsFor(range) {
  for (const path of allTagPathsFor(range)) {
    yield path.tag;
  }
}

export function* ownTagPathsFor(range) {
  if (!isArray(range)) throw new Error();

  const startPath = range[0];
  const endPath = range[1];

  let path = startPath;

  if (startPath.outer !== endPath.outer) throw new Error();

  const { children } = startPath.outer;

  for (let i = startPath.childrenIndex; i < endPath.childrenIndex; i++) {
    yield children[i];
  }
}

export class PathResolver {
  constructor() {
    this.childrenIndex = -1;
    this.counters = {};
    this.reference = null;
  }

  advance(tag) {
    this.childrenIndex++;

    const { counters } = this;
    if (tag.type === ReferenceTag) {
      const { isArray, name, flags } = tag.value;

      let resolvedReference = tag;

      this.reference = tag;

      if (isArray) {
        if (hasOwn(counters, name)) {
          const counter = ++counters[name];

          resolvedReference = buildReferenceTag(name, isArray, flags, counter);
        }
      } else if (name !== '@' && name !== '#') {
        if (hasOwn(counters, name)) throw new Error();

        counters[name] = true;
      }

      return resolvedReference;
    } else if (tag.type === ArrayInitializerTag) {
      counters[this.reference.value.name] = -1;
      return this.reference.value.name;
    }
  }
}

Object.freeze(PathResolver.prototype);

const findRight = (arr, predicate) => {
  for (let i = arr.length - 1; i >= 0; i--) {
    const value = arr[i];
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

const buildBindings = (node) => {
  const { children, properties } = node;
  const referenceIndexes = new Array(children.length);
  const childrenIndexes = Object.fromEntries(Object.keys(properties).map((key) => [key, null]));

  const resolver = new PathResolver();

  for (const tag of btree.traverse(children)) {
    resolver.advance(tag);
    const i = resolver.childrenIndex;

    if (tag.type === ReferenceTag) {
      const { name, isArray, index } = tag.value;

      if (!name) throw new Error();
      // if (name === '.') throw new Error();

      const counter = isArray
        ? hasOwn(resolver.counters, name)
          ? resolver.counters[name]
          : null
        : null;

      if (index != null && index !== counter) throw new Error();

      referenceIndexes[i] = counter;

      if (isArray) {
        if (childrenIndexes[name] === null || !hasOwn(childrenIndexes, name)) {
          childrenIndexes[name] = [];
        } else if (counter >= 0) {
          childrenIndexes[name][counter] = i;
        } else {
          throw new Error();
        }
      } else {
        if (name !== '#' && name !== '@') {
          childrenIndexes[name] = i;
        }
      }
    } else {
      referenceIndexes[i] = null;
    }
  }

  return { referenceIndexes, childrenIndexes };
};

const nodeStates = new WeakMap();

// TODO remove this; it is a very bad API to have to support!!
export const updatePath = (path, tag) => {
  const { node, childrenIndexes, referenceIndexes } = path;
  const i = btree.getSum(node.children) - 1;

  if (tag.type === ReferenceTag) {
    const { name, isArray, index: literalArrayIndex } = tag.value;

    const arrayIndex = isArray
      ? hasOwn(node.properties, name)
        ? btree.getSum(node.properties[name])
        : -1
      : null;

    if (literalArrayIndex != null && literalArrayIndex !== arrayIndex) throw new Error();

    referenceIndexes[i] = arrayIndex;

    if (isArray) {
      if (!hasOwn(childrenIndexes, name) || childrenIndexes[name] === null) {
        childrenIndexes[name] = [];
      } else {
        if (arrayIndex >= 0) {
          childrenIndexes[name][arrayIndex] = i;
        }
      }
    } else {
      if (name !== '#' && name !== '@') {
        childrenIndexes[name] = i;
      }
    }
  } else if (tag.type === ArrayInitializerTag) {
    referenceIndexes[i] = -1;
  } else {
    referenceIndexes[i] = null;
  }
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
      ![ReferenceTag, ShiftTag].includes(btree.getAt(referenceIndex, parent.node.children).type)
    )
      throw new Error();

    nodeStates.set(node, buildBindings(node));

    if (parent && (!this.reference || ![ReferenceTag, ShiftTag].includes(this.reference.type))) {
      throw new Error();
    }

    if (!Number.isFinite(this.depth)) throw new Error();

    buildSkips(this);
  }

  get referenceIndexes() {
    return nodeStates.get(this.node).referenceIndexes;
  }

  get childrenIndexes() {
    return nodeStates.get(this.node).childrenIndexes;
  }

  get reference() {
    return this.outer && btree.getAt(this.referenceIndex, this.outer.children);
  }

  get referencePath() {
    return this.outer && new TagPath(this.parent, this.referenceIndex);
  }

  get gap() {
    return this.outer && btree.getAt(this.referenceIndex + 1, this.outer.children);
  }

  get gapPath() {
    return this.outer && new TagPath(this.parent, this.referenceIndex + 1);
  }

  get outer() {
    return this.parent?.node;
  }

  get(reference, shiftIndex) {
    let node = getShifted(shiftIndex, reference, this.node);

    let shiftOffset = (shiftIndex ?? 0) * 2;

    return (
      node && this.push(node, getPropertiesSimple(reference, this.childrenIndexes) + shiftOffset)
    );
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
    let size = btree.getSum(path.node.children);
    let index = childrenIndex < 0 ? size + childrenIndex : childrenIndex;

    return index >= 0 && index < size ? new TagPath(path, index) : null;
  }

  get tag() {
    return this.child;
  }

  get node() {
    return this.path.node;
  }

  get child() {
    return btree.getAt(this.childrenIndex, this.path.node.children);
  }

  siblingPathAt(index) {
    return TagPath.from(this.path, index);
  }

  siblingAt(index) {
    return this.siblingPathAt(index).tag;
  }

  get nextSibling() {
    const { path, childrenIndex } = this;

    const child =
      childrenIndex + 1 >= btree.getSum(path.node.children)
        ? null
        : btree.getAt(childrenIndex + 1, path.node.children);

    return child && new TagPath(path, childrenIndex + 1);
  }

  get next() {
    let { path, childrenIndex } = this;

    let leaving = false;

    for (;;) {
      let prevTag = btree.getAt(childrenIndex - 1, path.node.children);
      let tag = btree.getAt(childrenIndex, path.node.children);
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
        let prevTag = btree.getAt(childrenIndex - 1, path.node.children);
        let nextTag = btree.getAt(childrenIndex + 1, path.node.children);

        if (
          path.parent &&
          btree.getAt(path.referenceIndex, path.outer.children)?.type === ShiftTag
        ) {
          let third = btree.getAt(2, path.node.children);
          if (childrenIndex === 2 || (childrenIndex === 4 && third.type === ArrayInitializerTag)) {
            childrenIndex = path.referenceIndex + 1;
            path = path.parent;
            leaving = true;
            continue;
          }
        }

        if (prevTag.type === ReferenceTag) {
          refTag = prevTag;

          if (nextTag && nextTag.type === ShiftTag) {
            const shifts = getProperties(refTag, path.node.properties).node;

            if (!Array.isArray(shifts)) throw new Error();

            const { name, isArray, flags } = refTag.value;
            let resolvedReference = refTag;
            if (isArray) {
              let index = path.referenceIndexes[refIndex];
              resolvedReference =
                index === -1 ? null : buildReferenceTag(name, index != null, flags, index);
            }

            path = path.get(resolvedReference, 0);
            childrenIndex = 0;

            if (!path) {
              return null;
            }
            continue;
          } else {
            if (
              !['#', '@'].includes(refTag.value.name) &&
              (!refTag.value.isArray || path.referenceIndexes[refIndex] != null)
            ) {
              const { name, isArray, flags } = refTag.value;
              let resolvedReference = refTag;
              if (isArray) {
                let index = path.referenceIndexes[refIndex];
                resolvedReference =
                  index === -1 ? null : buildReferenceTag(name, index != null, flags, index);
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
          }
        } else if (prevTag.type === ShiftTag) {
          let refIndex = childrenIndex - prevTag.value.index * 2 - 1;
          let refTag = btree.getAt(refIndex, path.node.children);

          const { name, isArray, flags } = refTag.value;
          let resolvedReference = refTag;
          if (isArray) {
            let index = path.referenceIndexes[refIndex];
            resolvedReference =
              index === -1 ? null : buildReferenceTag(name, index != null, flags, index);
          }

          if (resolvedReference) {
            path = path.get(resolvedReference, prevTag.value.index);
            // this was introducing errors
            // caused us to return to a point before we left
            path.referenceIndex = childrenIndex;
            childrenIndex = btree.getAt(2, path.node.children).type === ArrayInitializerTag ? 5 : 3;
            continue;
          }
        } else {
          throw new Error();
        }
      }

      // shift
      if (tag.type === ShiftTag) {
        let refIndex = childrenIndex - tag.value.index * 2;
        let refTag = btree.getAt(refIndex, path.node.children);

        const { name, isArray, flags } = refTag.value;
        let resolvedReference = null;
        if (isArray) {
          let index = path.referenceIndexes[refIndex];
          resolvedReference =
            index === -1 ? null : buildReferenceTag(name, index != null, flags, index);
        } else {
          resolvedReference = refTag;
        }

        if (resolvedReference) {
          path = path.get(resolvedReference, tag.value.index);
          childrenIndex = 0;
          continue;
        }
      }

      // over
      if (path.node && childrenIndex + 1 < btree.getSum(path.node.children)) {
        childrenIndex++;
        continue;
      }

      // out
      if (path.referenceIndex != null) {
        do {
          if (btree.getAt(path.referenceIndex + 2, path.outer.children)?.type === ShiftTag) {
            childrenIndex =
              btree.getSum(path.outer.children) > path.referenceIndex + 2
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
      let tag = btree.getAt(childrenIndex, path.node.children);
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
        let prevTag = btree.getAt(childrenIndex - 1, path.node.children);

        if (prevTag.type === ShiftTag) {
          // continue
        } else if (prevTag.type === ReferenceTag) {
          refTag = prevTag;

          if (
            !['#', '@'].includes(refTag.value.name) &&
            (!refTag.value.isArray || path.referenceIndexes[refIndex] != null)
          ) {
            const { name, isArray, flags } = refTag.value;
            let resolvedReference = refTag;
            if (isArray) {
              let index = path.referenceIndexes[refIndex];
              resolvedReference =
                index === -1 ? null : buildReferenceTag(name, index != null, flags, index);
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
      if (path.node && childrenIndex + 1 < btree.getSum(path.node.children)) {
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
      let tag = btree.getAt(childrenIndex, path.node.children);
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
        childrenIndex = btree.getSum(tag.value.children) - 1;
        continue;
      }

      // in
      if (tag.type === GapTag && !wasLeaving && !isGapNode(path.node)) {
        let refIndex = childrenIndex - 1;
        let refTag;
        let prevTag = btree.getAt(childrenIndex - 1, path.node.children);

        if (prevTag.type === ShiftTag) {
          // continue
        } else if (prevTag.type === ReferenceTag) {
          refTag = prevTag;

          if (
            !['#', '@'].includes(refTag.value.name) &&
            (!refTag.value.isArray || path.referenceIndexes[refIndex] != null)
          ) {
            const { name, isArray, flags } = refTag.value;
            let resolvedReference = refTag;
            if (isArray) {
              let index = path.referenceIndexes[refIndex];
              resolvedReference =
                index === -1 ? null : buildReferenceTag(name, index != null, flags, index);
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
      if (path.node && childrenIndex + 1 < btree.getSum(path.node.children)) {
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

    let resolvedRef = refPath.tag;

    if (refPath.tag.value.isArray) {
      const { name, flags, isArray } = refPath.tag.value;
      resolvedRef = buildReferenceTag(
        name,
        isArray,
        flags,
        refPath.path.referenceIndexes[refPath.childrenIndex],
      );
    }

    return this.path.get(resolvedRef, shiftPath?.tag.value.index);
  }

  equalTo(tagPath) {
    return this.node === tagPath.node && this.childrenIndex === tagPath.childrenIndex;
  }
}
