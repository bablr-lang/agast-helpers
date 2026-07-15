/* global BigInt */
import * as BList from './b-list.js';

import {
  ReferenceTag,
  AttributeDefinition,
  CloseNodeTag,
  GapTag,
  LiteralTag,
  OpenNodeTag,
  Property,
  ShiftTag,
  TreeNode,
  GapNode,
  NullNode,
  BindingTag,
  Document,
  HashTag,
  NullTag,
  EscapeTag,
} from './symbols.js';
import {
  arrayLast,
  arrayReduce,
  arraySlice,
  freezeRecord,
  isArray,
  isObject,
  isString,
} from './object.js';
import { buildReference, buildReferenceTag, parseTag, parseTagType } from './builders.js';
import { compareNames, printReference, printStatsReference, printTag } from './print.js';
import { arrayValues, concat } from './iterable.js';
import { inRange } from './parse.js';

// expected node size is 11 children
let CRITICAL_THRESHHOLD = 0x1000; // 0x10000 / 16

// expected literal size is 88 characters
// we expect 968 characters per node
// 88 characters per hash (SHA) + 4 (####) + contentLength
// probably around 12% - 15% overhead?
let LITERAL_CRITICAL_THRESHHOLD = 0x4000000; // 0x100000000 / 64

let porcelain = { porcelain: true };

let { setPrototypeOf, freeze } = Object;
let { isFinite } = Number;
let { slice, reduce } = Array.prototype;

export const freezeRecord_ = (obj) => {
  setPrototypeOf(obj, null);
  freeze(obj);
  return obj;
};

const type = Symbol.for('Tags');

let validNodes = new WeakSet();

const countValues = (values, depth) => {
  if (Object.getPrototypeOf(values)) throw new Error();

  return depth > 1
    ? Array.prototype.map.call(values, getValueSize).reduce((a, b) => a + b, 0)
    : values.length;
};

export const getType = (value) => {
  return isNode(value) ? value[3] : 0;
};

export const getDepth = (value) => {
  return isNode(value) ? value[4] : 0;
};

const treeFrom = (...values) => {
  return treeFromValues(values);
};

export { treeFrom as from };

export const create = () => {
  return treeFromValues([]);
};

const __treeFromValues = (values, depth) => {
  let depth_ = depth ?? Infinity;
  freezeRecord(values);

  if (!isArray(values) && !values[Symbol.iterator]) throw new Error();

  let firstValue = values[0];
  let firstDepth = getDepth(firstValue);

  if (depth_ === Infinity) {
    depth_ = firstDepth + 1;
  }
  let stats = sumValues(values, depth_);
  return freezeRecord([countValues(values, depth_), freezeRecord(values), stats, type, depth_]);
};

const validateShift = (lastProperty, property) => {
  if (lastProperty?.type === Property && property.type === Property) {
    let lastShift = lastProperty.value.shift;
    let { shift } = property.value;

    if (lastShift && shift) {
      if (shift.index !== lastShift.index + 1 || shift.height !== lastShift.height + 1)
        throw new Error('bad shift');
    }
  }
};

const getFirstPropertyChild = (children) => {
  for (let child of traverse(children)) {
    if (child.type === Property) {
      return child;
    }
  }
  return null;
};

export const getPathValue = (path) => {
  return getValues(path.node)[path.index];
};

export const allShouldersCold = (lastValue, value) => {
  if (getDepth(lastValue) !== getDepth(value)) throw new Error();

  let shoulderPath = findTreePath(0, value);
  let lastShoulderPath = findTreePath(-1, lastValue);

  for (let d = getDepth(lastValue); d >= 1; d--) {
    if (!valuesBreak_(concat(listValues(lastShoulderPath.node), listValues(shoulderPath.node)))) {
      return false;
    }

    shoulderPath = shoulderPath.parent;
    lastShoulderPath = lastShoulderPath.parent;
  }

  // the construction is irreducable
  return true;
};

export const treeFromValues = (values, depth) => {
  let depth_ = depth ?? Infinity;

  if (values[0] === null && (values[1] === null || parseTagType(values[1]) === OpenNodeTag))
    throw new Error();

  if (!isArray(values) && !values[Symbol.iterator]) throw new Error();

  let isRoot = (isString(values[0]) && startsNode(parseTag(values[0]))) || values[0] === null;

  if (isArray(values)) {
    if (isFinite(values[0])) throw new Error();

    freezeRecord(values);

    let firstValue = values[0];
    let firstDepth = getDepth(firstValue);

    if (depth_ === Infinity) {
      depth_ = firstDepth + 1;
    }

    if (depth_ > 1) {
      if (depth_ !== firstDepth + 1) throw new Error();

      let size = 0;
      let lastValue = null;
      for (let value of arrayValues(values)) {
        size += getSize(value);
        if (lastValue && !allShouldersCold(lastValue, value)) {
          throw new Error('nodes should collapse');
        } else if (lastValue && !validateShift(getAt(-1, lastValue), getAt(0, value))) {
        } else if (getDepth(value) !== firstDepth) {
          throw new Error('tree of mixed depths');
        } else if (!validNodes.has(value)) {
          throw new Error('tree node not valid');
        } else if (getType(value) !== type) {
          throw new Error('tree of mixed types');
        }
        lastValue = value;
      }
    } else {
      if (!isRoot) {
        if (values.length > 1 && valuesBreak_(arrayValues(values))) {
          throw new Error('node should break');
        }
      }

      let lastShift = null;
      for (let value of arrayValues(values)) {
        if (isArray(value)) continue;
        let tag = value && parseTag(value);

        if (isString(value) && printTag(tag, { porcelain: true }) !== value) throw new Error();

        switch (tag?.type) {
          case Property: {
            let property = value;
            let { shift } = property.value;

            validateShift(lastShift, shift);

            lastShift = shift;
            break;
          }

          case LiteralTag:
            if (literalBreaks(tag.value)) throw new Error();
            break;
        }
      }
    }
  }

  let tree;
  if (isArray(values)) {
    let stats = sumValues(values, depth_);

    tree = freezeRecord([countValues(values, depth_), freezeRecord(values), stats, type, depth_]);
    validNodes.add(tree);
  } else {
    let newValues;
    let hash;
    let temp = [];
    do {
      newValues = [];

      for (let value of isArray(values) ? arrayValues(values) : values) {
        temp.push(value);
        let lastHash = hash;
        hash = stepGearHashValue(value, hash);

        if (hashesBreak(lastHash, hash)) {
          let tree = __treeFromValues(temp);
          validNodes.add(tree);
          newValues.push(tree);
          temp = [];
        }
      }

      if (temp.length) {
        freezeRecord(temp);
        let tree = __treeFromValues(temp);
        validNodes.add(tree);
        newValues.push(tree);
        temp = [];
      }

      freezeRecord(newValues);
      values = newValues;
    } while (newValues.length > 1);

    return newValues[0];
  }

  return tree;
};

export const stepGearHashLiteral = (value, hash = 0) => {
  if (value === null) throw new Error();
};

export const literalBreaks = (str) => {
  let hash = 0n;
  let lastHash = null;
  for (let chr of str) {
    for (let byte of encodeUTF8([chr.codePointAt(0)])) {
      hash = BigInt(BigInt(hash << 1n) + BigInt(GEARS32[byte])) & BigInt(0xffffffff);
    }

    if (literalHashesBreak(lastHash, hash)) {
      return true;
    }

    lastHash = hash;
  }

  return false;
};

export function* literalParts(str) {
  let hash = 0n;
  let lastHash = null;
  let part = '';

  for (let chr of str) {
    for (let byte of encodeUTF8([chr.codePointAt(0)])) {
      hash = BigInt(BigInt(hash << 1n) + BigInt(GEARS32[byte])) & BigInt(0xffffffff);
    }

    if (literalHashesBreak(lastHash, hash)) {
      if (part.length) {
        yield part;
      }
      hash = 0n;
      lastHash = null;
      part = '';

      for (let byte of encodeUTF8([chr.codePointAt(0)])) {
        hash = BigInt(BigInt(hash << 1n) + BigInt(GEARS32[byte])) & BigInt(0xffffffff);
      }
    }

    part += String.fromCodePoint(chr.codePointAt(0));

    lastHash = hash;
  }

  if (part.length) {
    yield part;
  }
}

const setValuesAt = (idx, node, value) => {
  const values = getValues(node);

  if (!isFinite(idx)) throw new Error();

  if (!value == null) {
    throw new Error();
  }

  const newValues = [...arrayValues(values)];
  newValues[idx] = value;
  return treeFromValues(newValues);
};

export const empty = () => {
  return treeFromValues([]);
};

export const startsNode = (tag) => {
  let tagType = parseTagType(tag);
  return [OpenNodeTag, NullTag, GapTag].includes(tagType);
};

export const endsNode = (tag) => {
  let tagType = parseTagType(tag);
  if ([CloseNodeTag, NullTag, GapTag].includes(tagType)) return true;

  return tagType === OpenNodeTag ? parseTag(tag).value.selfClosing : false;
};

export const hashesBreak = (first, second) => {
  if (first == null) return false;
  if (first < CRITICAL_THRESHHOLD) {
    return second > 0xffff - CRITICAL_THRESHHOLD;
  } else {
    return second < CRITICAL_THRESHHOLD;
  }
};

export const literalHashesBreak = (first, second) => {
  if (first == null) return false;
  if (first < LITERAL_CRITICAL_THRESHHOLD) {
    return second > 0xffffffff - LITERAL_CRITICAL_THRESHHOLD;
  } else {
    return second < LITERAL_CRITICAL_THRESHHOLD;
  }
};

const listValues = (node) => {
  return arrayValues(getValues(node));
};

const valuesBreak_ = (values) => {
  let hash = 0;
  let lastHash = null;
  for (let value of values) {
    if (value !== null) {
      hash = stepGearHashValue(value, hash);
      if (hashesBreak(lastHash, hash)) return true;
      lastHash = hash;
    }
  }
  return false;
};

const valuesBreak = (values) => {
  let hash = 0;
  let lastHash = null;
  let lastValue = null;
  let first = true;
  let isLeaf = !values.length || values[0] === null || isString(values[0]);
  for (let value of arrayValues(values)) {
    hash = stepGearHashValue(value, hash);
    if (
      isLeaf
        ? hashesBreak(lastHash, hash)
        : valuesBreak_(concat(listValues(lastValue), listValues(value)))
    ) {
      return true;
    }
    lastHash = hash;
    lastValue = value;
    first = false;
  }
  return !first;
};

const indexFromPath = (path) => {
  let index = 0;
  for (let i = 0; i < path.length; i++) {
    let { node, index: nodeIndex } = path[i];
    let values = getValues(node);
    if (getDepth(node)) {
      for (let j = 0; j < nodeIndex; j++) {
        let value = values[j];
        index += getSize(value);
      }
    }
  }
  return index;
};

export const findTreePath = (idx, tree, depth = Infinity) => {
  if (idx == null) return null;
  if (tree && !isArray(tree)) throw new Error();

  let path = null;
  let node = tree;
  let treeDepth = getDepth(tree);

  if (isArray(idx)) {
    if (idx.length > getDepth(tree)) return null;
    for (let seg of arrayValues(idx)) {
      let index = typeof seg !== 'object' ? seg : seg.index;
      if (typeof index === 'string') throw new Error();
      if (!isNode(node)) return null;
      let index_ = index < 0 ? getValues(node).length + index : index;
      path = freezeRecord({ parent: path, depth: path ? path.depth + 1 : 1, node, index: index_ });
      node = getValues(node)[index_];
      if (node && !isNode(node)) {
        return path;
      }
      if (!node) return null;
    }

    return path;
  }

  let treeSum = getSize_(tree);
  let currentIdx = idx < 0 ? treeSum - 1 : 0;
  let direction = idx < 0 ? -1 : 1;
  let targetIdx = idx < 0 ? treeSum + idx : idx;

  stack: while (node) {
    assertValidNode(node);

    const values = getValues(node);
    let candidateNode;

    let backwards = idx < 0;
    const increment = backwards ? -1 : 1;
    for (
      let i = backwards ? values.length - 1 : 0;
      backwards ? i >= 0 : i < values.length;
      i += increment
    ) {
      let value = values[i];
      if (isNode(value) && (path?.depth ?? 0) + 1 < Math.min(depth, treeDepth)) {
        candidateNode = value;

        const sum = getSize_(candidateNode);
        const nextIndex = currentIdx + sum * direction;
        if (
          (backwards ? nextIndex < targetIdx : nextIndex > targetIdx) ||
          (backwards ? nextIndex < 0 : nextIndex >= treeSum)
        ) {
          path = freezeRecord({ parent: path, depth: path ? path.depth + 1 : 1, node, index: i });
          node = candidateNode;
          continue stack;
        } else {
          currentIdx += sum * direction;
        }
      } else {
        const nextIndex = currentIdx + direction;
        if (!isFinite(targetIdx)) {
          path = freezeRecord({
            parent: path,
            depth: path ? path.depth + 1 : 1,
            node,
            index: targetIdx,
          });

          return path;
        } else if (backwards ? nextIndex < targetIdx : nextIndex > targetIdx) {
          path = freezeRecord({ parent: path, depth: path ? path.depth + 1 : 1, node, index: i });

          return path;
        } else if (
          backwards
            ? nextIndex < targetIdx || nextIndex < 0
            : nextIndex > targetIdx || nextIndex >= treeSum
        ) {
          break;
        } else {
          currentIdx += direction;
        }
      }
    }

    path = freezeRecord({
      parent: path,
      depth: path ? path.depth + 1 : 1,
      node,
      index: backwards ? -Infinity : Infinity,
    });

    return path;
  }

  return null;
};

const getNextTreePath = (treePath) => {
  let treePath_ = treePath;

  while (treePath_) {
    let { parent, depth, node, index } = treePath_;
    if (index + 1 < node[1].length) {
      ++index;
      return freezeRecord({ parent, depth, node, index });
    } else {
      let targetDepth = depth;
      while (parent && parent.index + 1 >= parent.node[1].length) {
        parent = parent.parent;
      }
      if (!parent) return null;

      depth = parent.depth;
      node = parent.node;
      index = parent.index + 1;
      parent = parent.parent;

      let childPath = freezeRecord({ parent, depth, node, index });

      // go back down to target depth22
      while (depth < targetDepth) {
        let child = node[1][index];

        if (child == null) return null;

        depth++;
        parent = childPath;
        node = child;
        index = 0;

        childPath = freezeRecord({ parent, depth, node, index });
      }

      return childPath;
    }
  }

  return null;
};

const pathsSameNode = (a, b) => {
  // nodes aren't safe to compare with === but paths are
  return (a === null && a === b) || (a && b && a.parent === b.parent && a.index === b.index);
};

const ___splice = (idx, removeCount, insertValues, tree) => {
  let idx_ = !isArray(idx) && idx < 0 ? Math.max(getSize(tree) + idx + 1, 0) : idx;
  let removes = removeCount;
  let targetOffset = 0;
  let inserts = [...arrayValues(insertValues || [])];
  let nextRemoves = 1;
  let nextTargetOffset = 0;
  let nextInserts = [];

  let isLeaf = true;

  for (let dPath = findTreePath(idx_, tree); dPath; dPath = dPath.parent) {
    let path = dPath;
    let lastPath = null;
    let hash = 0;
    let lastHash = null;
    let target = path.index - targetOffset;

    if (isLeaf || (isFinite(target) && target > 0)) {
      // leading pulldown
      let chunk = [...listValues(path.node)].slice(0, target);

      if (chunk.length) {
        inserts.unshift(...chunk);
      }
    } else {
      if (path.parent?.index > 0) {
        // pull down the whole last chunk in case we need to re-break with it
        inserts.unshift(...listValues(getValues(path.parent.node)[path.parent.index - 1]));
        ++nextTargetOffset;
        ++nextRemoves;
      }
    }

    let chunk = [];

    let lastValue;
    for (let value_ of inserts) {
      let value = isArray(value_) ? value_ : printTag(value_, porcelain);
      hash = stepGearHashValue(value, hash);

      let breaks =
        !!lastValue &&
        (isLeaf
          ? hashesBreak(lastHash, hash)
          : valuesBreak_(concat(listValues(lastValue), listValues(value))));

      if (breaks) {
        if (
          !nextInserts.length ||
          valuesBreak_(concat(listValues(arrayLast(nextInserts)), chunk))
        ) {
          nextInserts.push(treeFromValues(chunk));
        } else {
          let lastInsertValue = nextInserts.pop();
          nextInserts.push(treeFromValues(concat(listValues(lastInsertValue), chunk)));
        }

        chunk = [];

        chunk.push(value);
      } else {
        if (isLeaf) {
          chunk.push(value);
        } else {
          let lastValue = chunk.pop();
          chunk.push(treeFromValues(concat(listValues(lastValue), listValues(value))));
        }
      }

      lastHash = hash;
      lastValue = value;
    }

    if (isFinite(target)) {
      let index = target + removes;

      path = index < path.node[1].length ? freezeRecord({ ...path, index }) : null;
    }

    let remainingRebreaks = 8;
    for (; path && isFinite(target); path = getNextTreePath(path)) {
      let value = path.node[1][target];
      let lastValue = lastPath && lastPath.node[1][target];

      if (!removes) {
        hash = stepGearHashValue(value, hash);

        nextRemoves += lastPath && !pathsSameNode(lastPath, path) ? 1 : 0;

        let breaks =
          lastValue &&
          (isLeaf
            ? hashesBreak(lastHash, hash)
            : valuesBreak_(concat(listValues(lastValue), listValues(value))));

        if (breaks) {
          nextInserts.push(treeFromValues(chunk));
          chunk = [];
        } else {
          chunk.push(value);
        }
      }

      if (remainingRebreaks) {
        --remainingRebreaks;
      } else {
        break;
      }

      lastPath = path;
      lastHash = hash;
    }

    if (chunk.length) {
      if (!nextInserts.length || valuesBreak_(concat(listValues(arrayLast(nextInserts)), chunk))) {
        nextInserts.push(treeFromValues(chunk));
      } else {
        let lastInsertValue = nextInserts.pop();
        nextInserts.push(treeFromValues(concat(listValues(lastInsertValue), chunk)));
      }
    }

    removes = nextRemoves;
    targetOffset = nextTargetOffset;
    inserts = nextInserts;
    nextRemoves = 1;
    nextInserts = [];
    isLeaf = false;
  }

  return inserts.length === 1 ? inserts[0] : treeFromValues(inserts);
};

export const __splice = (idx, removeCount, insertValues, tree) => {
  let result = ___splice(idx, removeCount, insertValues, tree);

  if (getSize(result) !== getSize(tree) - removeCount + (insertValues?.length ?? 0)) {
    throw new Error();
  }

  return result;
};

export const isValidNode = (node) => {
  return validNodes.has(node) || BList.isValidNode(node);
};

export const assertValidNode = (node) => {
  if (!isValidNode(node)) throw new Error();
};

export const isNode = (value) => {
  let isArr = isArray(value);
  return isArr && typeof value[0] === 'number';
};

export const getValues = (node) => {
  return node ? (isNode(node) ? node[1] : freezeRecord([node])) : freezeRecord([]);
};

export const getSums = (node) => {
  assertValidNode(node);

  return isFinite(node[0]) ? node[2] || null : null;
};

export function* traverse(tree) {
  let states = [{ node: tree, i: 0 }];

  assertValidNode(tree);

  stack: while (states.length) {
    let s = states[states.length - 1];
    let { node } = s;

    let values = getValues(node);
    let depth = getDepth(node);

    for (let { i } = s; s.i < values.length; ) {
      let value = values[i];
      if (isNode(value) && depth >= 1) {
        let node = value;
        assertValidNode(node);
        states.push({ node, i: 0 });
        i = ++s.i;
        continue stack;
      } else {
        if (value !== null) {
          yield value;
        }
        i = ++s.i;
      }
    }

    states.pop();
  }
}

const map_ = (fn, tree) => {
  let s = { node: tree, i: 0, returnValue: undefined };
  let states = [s];
  let lastState = s;

  assertValidNode(tree);

  stack: while (states.length) {
    let { node } = s;

    let values = getValues(node);
    let depth = getDepth(node);

    if (depth > 1) {
      s.returnValue ||= [];

      if (s.i < values.length) {
        let node = values[s.i++];
        assertValidNode(node);
        lastState = s;
        s = { node, i: 0 };
        states.push(s);

        continue stack;
      }
    } else {
      s.returnValue = Array.prototype.map.call(values, fn);
    }

    lastState = s;
    states.pop();
    s = states[states.length - 1];
    if (s) {
      s.returnValue.push(treeFromValues(lastState.returnValue));
    }
  }
  return treeFromValues(lastState.returnValue);
};

const getValueSize = (value) => {
  if (!isNode(value)) {
    return 1;
  } else {
    return value[0];
  }
};

export const getSize_ = (tree) => {
  if (tree == null) {
    return 0;
  } else {
    return getValueSize(tree);
  }
};

export const findPath = (idx, tree, depth = Infinity) => {
  if (idx == null) return null;
  if (tree && !isArray(tree)) throw new Error();

  let path = [];
  let node = tree;
  let treeDepth = getDepth(tree);

  if (isArray(idx)) {
    if (idx.length > getDepth(tree)) return null;
    for (let seg of arrayValues(idx)) {
      let index = typeof seg !== 'object' ? seg : seg.index;
      if (typeof index === 'string') throw new Error();
      if (!isNode(node)) return null;
      let index_ = index < 0 ? getValues(node).length + index : index;
      path.push({ index: index_, node });
      node = getValues(node)[index_];
      if (node && !isNode(node)) {
        return path;
      }
      if (!node) return null;
    }

    return path;
  }

  let treeSum = getSize_(tree);
  let currentIdx = idx < 0 ? treeSum - 1 : 0;
  let direction = idx < 0 ? -1 : 1;
  let targetIdx = idx < 0 ? treeSum + idx : idx;

  stack: while (node) {
    assertValidNode(node);

    const values = getValues(node);
    let candidateNode;

    let backwards = idx < 0;
    const increment = backwards ? -1 : 1;
    for (
      let i = backwards ? values.length - 1 : 0;
      backwards ? i >= 0 : i < values.length;
      i += increment
    ) {
      let value = values[i];
      if (isNode(value) && path.length + 1 < Math.min(depth, treeDepth)) {
        candidateNode = value;

        const sum = getSize_(candidateNode);
        const nextIndex = currentIdx + sum * direction;
        if (
          (backwards ? nextIndex < targetIdx : nextIndex > targetIdx) ||
          (backwards ? nextIndex < 0 : nextIndex >= treeSum)
        ) {
          path.push({ index: i, node });
          node = candidateNode;
          continue stack;
        } else {
          currentIdx += sum * direction;
        }
      } else {
        const nextIndex = currentIdx + direction;
        if (!isFinite(targetIdx)) {
          path.push({ index: targetIdx, node });

          return path;
        } else if (backwards ? nextIndex < targetIdx : nextIndex > targetIdx) {
          path.push({ index: i, node });

          return path;
        } else if (
          backwards
            ? nextIndex < targetIdx || nextIndex < 0
            : nextIndex > targetIdx || nextIndex >= treeSum
        ) {
          break;
        } else {
          currentIdx += direction;
        }
      }
    }

    path.push({ index: backwards ? -Infinity : Infinity, node });

    return path;
  }

  return null;
};

const getAt_ = (idx, tree) => {
  const path = findPath(idx, tree);
  let seg = path && path[path.length - 1];
  return seg && getValues(seg.node)[seg.index];
};

export const referenceIsSingular = (ref) => {
  return !ref.flags.array && !['#', '.', '__'].includes(ref.type);
};

export const referencesAreEqual = (a, b) => {
  return (
    a === b ||
    (a.type === b.type &&
      a.name === b.name &&
      a.flags.array === b.flags.array &&
      a.flags.intrinsic === b.flags.intrinsic &&
      a.flags.hasGap === b.flags.hasGap &&
      a.flags.expression === b.flags.expression)
  );
};

export const getTags = (node) => {
  switch (node.type) {
    case TreeNode:
      return node.value.tags;
    case NullNode:
      return node.value.tags;
    case GapNode:
      return node.value.tags;
    case Document:
      return getTags(node.value.tree);
    default:
      throw new Error();
  }
};

const __findStats = (ref, sortedArray, startIdx, endIdx) => {
  if (!sortedArray.length || endIdx < startIdx) return null;

  let idx = startIdx + Math.floor((endIdx - startIdx) / 2 + 0.1);
  let skipIdx = idx * 3;
  let ref_ = sortedArray[skipIdx];
  let value = sortedArray[skipIdx + 1];
  let expected = ref;

  let direction = compareNames(expected, ref_);

  if (direction === 0) {
    return value;
  } else {
    if (startIdx === endIdx) return null;

    if (direction > 0) {
      return __findStats(ref, sortedArray, idx + 1, endIdx);
    } else {
      return __findStats(ref, sortedArray, startIdx, idx - 1);
    }
  }
};

export const findStats = (ref, sortedArray, startIdx = 0, endIdx = sortedArray.length / 3 - 1) => {
  return __findStats(ref, sortedArray, startIdx, endIdx);
};

export const getIndex = (pathSegment, tags) => {
  if (nodeIsRoot(tags) && !tags[1][1]) return null;

  let { type, name, index, shiftIndex } = pathSegment;
  let firstPropsIndex = __getPropertyTagsIndex(tags, type, name, 0);
  let prop = firstPropsIndex == null ? null : getAt(firstPropsIndex, tags);
  let ref = prop?.value.reference;
  let sums = getSums(nodeIsRoot(tags) ? tags[1][1] : tags);
  let counts = sums.refs;

  if (ref?.flags.array) {
    if (index < 0) {
      index = findStats(ref, counts) + index;
    } else if (index == null) {
      index = findStats(ref, counts) - 1;

      if (index < 0) return null;
    }
  }

  let parentIndex = __getPropertyTagsIndex(tags, type, name, index ?? 0);

  if (parentIndex != null && ref?.flags.expression) {
    let shiftIndex_ = shiftIndex == null ? -1 : shiftIndex;
    if (shiftIndex_ < 0) {
      let shifts = 0;
      // TODO speed this up for deeply nested shifts
      // algorithm: make big jump forward, then look at shift index to see if we overshot completely
      // works because we know the size of the thing and a bigger thing doesn't fit in a smaller one
      while (getAt(parentIndex + shifts, getValues(tags)[3])?.value.shift) {
        shifts++;
      }

      if (-shiftIndex_ > shifts + 1) return null;

      return parentIndex + shifts + shiftIndex_ + 1;
    } else {
      if (parentIndex + shiftIndex_ >= getSize(tags)) {
        return null;
      }

      return parentIndex + shiftIndex_;
    }
  }

  return parentIndex;
};

const __getPropertyTagsIndex = (tags, type, name, index) => {
  let nameCount = 0;
  let node = isString(tags[1][0]) && startsNode(parseTag(tags[1][0])) ? getValues(tags)[1] : tags;
  let idx = -1;

  // drill into subtrees, passing over subtrees with too few references of the desired name
  outer: while (node) {
    let sums = getSums(node);

    if (!sums) return null;

    let ref = printTag(buildReferenceTag(type, name));
    let valueNameCount = findStats(ref, sums.refs);

    if (nameCount + valueNameCount < index) {
      return null;
    }

    for (const value of listValues(node)) {
      if (!isNode(value)) {
        idx++;
        let tag = value;
        if (isObject(tag) && tag.type === Property) {
          let { tags, reference } = tag.value;
          if (parseTagType(tags[1][0]) === ReferenceTag) {
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
        let valueSums = getSums(value);
        if (nameCount + findStats(ref, valueSums.refs) > index) {
          node = value;
          continue outer;
        } else {
          nameCount += findStats(ref, valueSums.refs) ?? 0;
          idx += getSize(value);
        }
      }
    }

    return null;
  }

  return null;
};

export const valuesAreNodeRoot = (values) => {
  return values[0] === null || (isString(values[0]) && startsNode(values[0]));
};

export const nodeIsRoot = (node) => {
  return valuesAreNodeRoot(getValues(node));
};

export const sumValues = (values, depth) => {
  if (valuesAreNodeRoot(values)) {
    return null;
  }

  let mapStats = arrayReduce(
    values,
    (acc, val) => {
      const { refs } = acc;
      if (isArray(val)) {
        acc.lineBreaks += getSums(val).lineBreaks;
        acc.gaps += getSums(val).gaps;

        let valRefs = getSums(val).refs;

        for (let i = 0; i < valRefs.length; i++) {
          let key = valRefs[i];
          let value = valRefs[++i];
          let reference = valRefs[++i];

          let count = refs.get(key)?.[1] ?? 0;

          if (referenceIsSingular(reference) && count > 0)
            throw new Error('doubled reference: ' + printReference(reference));

          refs.set(key, [key, count + value, reference]);
        }
      } else if (val) {
        let tag = parseTag(val);
        if (tag.type === LiteralTag) {
          let text = tag.value;
          let idx = 0;
          while ((idx = text.indexOf('\n', idx + 1)) >= 0) {
            acc.lineBreaks++;
          }
        } else if (tag.type === GapTag) {
          acc.gaps++;
        } else if (tag.type === Property) {
          let { tags } = tag.value;
          if (tags[1][0] && !isString(tags[1][0])) throw new Error();
          let refOrShiftTag = !tags[1][0] ? buildReference() : parseTag(tags[1][0]);

          if (tags[1][3]) {
            let node = tags[1][3];
            if (node.type === TreeNode) {
              acc.gaps += node.value.children[2].gaps;
            } else if (node.type === GapNode) {
              acc.gaps++;
            }
          }
          if (refOrShiftTag?.type !== ShiftTag) {
            let ref = refOrShiftTag?.value || buildReference();
            let statsRef = printStatsReference(ref);
            let count = refs.get(statsRef)?.[1] ?? 0;

            if (referenceIsSingular(ref) && count > 0) throw new Error();

            refs.set(statsRef, [statsRef, count + 1, ref]);
          }
        }
      }
      return acc;
    },
    {
      gaps: 0,
      lineBreaks: 0,
      refs: new Map(),
    },
  );

  let { lineBreaks, gaps } = mapStats;
  let stats = freezeRecord({
    gaps,
    lineBreaks,
    refs: freezeRecord(
      [...mapStats.refs.values()].sort((a, b) => compareNames(a[0], b[0])).flatMap((_) => _),
    ),
    gearHash: gearHashValues(values).toString(16).padStart(4, '0'),
  });
  return stats;
};

export const fromValues = (...args) => {
  // TODO validate here
  return treeFromValues(...args);
};

export const getAt = (idx, tags) => {
  if (isArray(idx)) {
    if (idx.length > 1) {
      let outer = getAt_(arraySlice(idx, 0, 1), tags);

      return outer ? getAt_(arraySlice(idx, 1), isArray(outer) ? outer : outer.value.tags) : null;
    } else {
      return getAt_(idx, tags);
    }
  } else {
    let absIdx = idx < 0 ? getSize(tags) + idx : idx;
    if (
      (tags[1][0] === null || parseTagType(tags[1][0]) === OpenNodeTag) &&
      inRange(absIdx, 1, getSize(tags[1][1]))
    ) {
      return getAt_(absIdx - 1, tags[1][1]);
    } else {
      if (isNode(tags) && tags[1][0] && parseTagType(tags[1][0]) === OpenNodeTag) {
        return getAt_([absIdx >= 1 ? absIdx - getSize(tags[1][1]) + 1 : absIdx], tags);
      } else {
        return getAt_(idx, tags);
      }
    }
  }
};

export const getSize = (tags) => {
  if (!isNode(tags)) return 1;
  let sigilTag = tags[1][0];
  if (sigilTag === null || (isString(sigilTag) && parseTagType(sigilTag) === OpenNodeTag)) {
    return getSize_(tags) + getSize_(tags[1][1]) - (tags[1].length >= 2);
  } else {
    return getSize_(tags);
  }
};

export const getSigilTag = (tags) => {
  let candidate = tags[1][0];

  return startsNode(candidate) ? parseTag(candidate) : candidate === null ? parseTag('<__>') : null;
};

export const push = (tag, tags) => {
  let tag_ = parseTag(tag);
  let sigilTag = getSigilTag(tags);

  if (
    !isNode(tag_) &&
    ![
      OpenNodeTag,
      Property,
      CloseNodeTag,
      AttributeDefinition,
      BindingTag,
      LiteralTag,
      EscapeTag,
      GapTag,
    ].includes(tag_.type)
  )
    throw new Error();

  if (isNode(tag_)) {
    throw new Error('not implemented');
  } else {
    if (tag_.type === OpenNodeTag) {
      if (getSize(tags) !== 0) throw new Error();

      let tree = __treeFromValues([tags[1][0], tag]);
      validNodes.add(tree);
      return tree;
    } else {
      if (!sigilTag || sigilTag.type !== OpenNodeTag) {
        return __splice(-1, 0, [tag], tags);
      }

      let children = getValues(tags)[1] ?? treeFromValues([]);

      // sometimes this is the top level
      if (sigilTag) {
        if (tag_.type === CloseNodeTag) {
          let { 0: open, 1: children = treeFromValues([]) } = getValues(tags);

          return treeFromValues([open, children, tag], 1);
        } else {
          let { 0: open } = getValues(tags);

          children = __splice(-1, 0, [tag], children);

          return treeFromValues([open, children], 1);
        }
      } else {
        return __splice(-1, 0, [tag], tags);
      }
    }
  }
};

export const replaceAt = (idx, tag, tree) => {
  let idx_ = idx < 0 ? getSize(tree) + idx : idx;
  let tagObj = parseTag(tag);
  let tag_ = printTag(tag, porcelain);

  if (tagObj.type !== parseTagType(getAt(idx_, tree))) throw new Error();
  let sigilTag = tree[1][0];

  if (sigilTag === null || parseTagType(sigilTag) === OpenNodeTag) {
    let newTags = [...listValues(tree)];
    if (idx_ === 0) {
      newTags[0] = tag_;
    } else if (tagObj.type === CloseNodeTag) {
      if (idx_ !== getSize(tree) - 1) throw new Error();
      newTags[2] = tag_;
    } else {
      let children = getValues(tree)[1];

      let children_ = __splice(idx_ - 1, 1, [tag_], children);

      newTags[1] = children_;
    }
    return treeFromValues(newTags, 1);
  } else {
    return __splice(idx_, 1, [tag_], tree);
  }
};

export const removeAt = (idx, tree) => {
  let idx_ = idx < 0 ? getSize(tree) + idx : idx;

  let sigilTag = getSigilTag(tree);

  if (sigilTag && sigilTag.type === OpenNodeTag) {
    let newTags = [...listValues(tree)];
    if (idx_ === 0 || (isArray(idx) && idx[0] === 0)) {
      newTags.splice(0, 1);
    } else if (idx_ === getSize(tree) - 1 || (isArray(idx) && idx[0] === 2)) {
      newTags.splice(2, 1);
    } else {
      let children = getValues(tree)[1];
      let idx__ = isArray(idx_) ? arraySlice(idx, 1) : idx_ - 1;

      children = __splice(idx__, 1, [], children);

      newTags[1] = children;
    }
    return treeFromValues(newTags, 1);
  } else {
    return __splice(idx_, 1, [], tree);
  }
};

export function* traverseInner(tree) {
  for (let tag of traverse(tree)) {
    if (isObject(tag) && tag.type === Property) {
      yield* BList.traverse(tag.value.tags);
    } else {
      yield tag;
    }
  }
}

export const map = (fn, tree) => {
  let { 0: open, 1: children, 2: close } = getValues(tree);

  if (!startsNode(open)) {
    return map_(fn, tree);
  }

  let newValues = [];
  if (open) {
    newValues.push(fn(open));
    if (children) newValues.push(map_(fn, children));
    if (close) newValues.push(fn(close));
  }

  return treeFromValues(newValues, 1);
};

function* codePoints(str) {
  for (let chr of str) {
    yield chr.codePointAt(0);
  }
}

function* encodeUTF8(points) {
  let leadSurrogate = null;

  for (let point of points) {
    if (point >= 0xd800 && point <= 0xdbff) {
      leadSurrogate = point;
      continue;
    }

    if (leadSurrogate !== null) {
      if (point >= 0xdc00 && point <= 0xdfff) {
        point = (leadSurrogate - 0xd800) * 0x400 + point - 0xdc00 + 0x10000;
      } else {
        yield leadSurrogate;
      }
      leadSurrogate = null;
    }

    if (point < 0x80) {
      yield point;
    } else if (point < 0x800) {
      yield (point >> 6) | 192;
      yield (point & 63) | 128;
    } else if (point < 0xd800 || (point >= 0xe000 && point < 0x10000)) {
      yield (point >> 12) | 224;
      yield ((point >> 6) & 63) | 128;
      yield (point & 63) | 128;
    } else if (point >= 0x10000 && point <= 0x10ffff) {
      yield (point >> 18) | 240;
      yield ((point >> 12) & 63) | 128;
      yield ((point >> 6) & 63) | 128;
      yield (point & 63) | 128;
    } else {
      // invalid
      yield 0xef;
      yield 0xbf;
      yield 0xbd;
    }
  }

  if (leadSurrogate) {
    yield leadSurrogate;
  }
}

const UTF8From = (str) => {
  return encodeUTF8(codePoints(str));
};

let GEARS32 = [
  0x2928ea69, 0x74656e3b, 0x81e8eeee, 0xc7d32c29, 0xc6eb0d30, 0x48a20a2f, 0xca2b9cea, 0x25e6413c,
  0x5108622e, 0x7e3653ae, 0xc3b9665f, 0xa07ec1aa, 0x628ff219, 0x47421152, 0x647650a9, 0xd217d3d2,
  0x4f0811ea, 0x2918eada, 0x59181089, 0xef786e26, 0x5e662f4f, 0x22a74b32, 0xa9d665b9, 0x3555ebde,
  0x063c13d8, 0x1b81735a, 0xb85bdac2, 0x1c03b392, 0x5a5959b2, 0x9912adca, 0xad12301d, 0x92aa131a,
  0x897f2f55, 0xe9406f61, 0x71c1bea1, 0x4e995c8b, 0x4eb04df7, 0x461c779e, 0x2797cb0c, 0xfd160333,
  0x1073a0ce, 0x196401a2, 0x9eb4dcce, 0x73e17eb4, 0x90972a08, 0xe5a4048c, 0xfe1e0b16, 0xc1f00849,
  0xf1484e28, 0xb24d09a7, 0xd7eb18c2, 0xc3e742a0, 0xba6bb453, 0x0370bde1, 0x66684a9e, 0x31634481,
  0xcac46c5c, 0xab93c5f1, 0x547612e5, 0xec8bb9bf, 0xa286f878, 0x295cd1c7, 0x56379d32, 0x6aa418c0,
  0xff609018, 0xdc209c74, 0x4d4b1c54, 0x34dda513, 0x686e05d0, 0x8e54d2a2, 0xf85ae6d4, 0xc5badff6,
  0xb05f0d42, 0xd2a6373f, 0x70aba1dc, 0x0ffe88f2, 0xc01d7a60, 0x61595c65, 0xdcedeef8, 0x6c5ae2da,
  0x9ac3ed8a, 0xfe24742d, 0x49d3720f, 0x3dd58f9c, 0x3b82ed4f, 0x2854a9ac, 0x69f3466d, 0x8b5a3351,
  0xb03b669a, 0xa867ee10, 0x9c6b4cff, 0xfa45a125, 0x162a6303, 0x7179bf89, 0x14874496, 0x21c0dd67,
  0x68c016e8, 0x3b834707, 0x6d00332d, 0xcdf326ab, 0x3177afb3, 0x94984ef7, 0xdbb155cc, 0xfacbc5fe,
  0xc689b1e0, 0xe17a375f, 0x8706981c, 0xc3962143, 0x35a67f61, 0xbce2db97, 0x1c7bad57, 0x7c84efb2,
  0x1c8ae39d, 0x57d64f83, 0xd27d5166, 0x76a1e77e, 0x9963d012, 0x2501c5e6, 0x67cbff21, 0x1ee5c6c7,
  0x1fffc7af, 0xfcfdf92a, 0x860671e9, 0xa4307e49, 0x1448ab69, 0xbff2834b, 0x45922b4e, 0x853d8226,
  0xf5473b95, 0xa8ec816d, 0x8f99d3cf, 0x23efc63c, 0x0dc9653b, 0xccd61e37, 0x1912761a, 0x7aed67b0,
  0x4c7009ce, 0xf8dde262, 0x47b73936, 0x2e93e356, 0x44fb0c20, 0x9914965a, 0x0c384042, 0xeb5275ad,
  0xf924bc31, 0xf0ed608f, 0x5ff6455d, 0xf4df3085, 0x7c6e6c83, 0x4f03e456, 0x752cff40, 0x6057aa11,
  0x6949105d, 0xfd15fa76, 0x367ab52a, 0xdc1973bb, 0xd2382cec, 0x833dadc3, 0xb84b2c55, 0x36aebf27,
  0xffd7467b, 0x632cb80b, 0x844c7fc0, 0x47eabcf2, 0xa7d7f5bf, 0xdf708cd9, 0x52c1a24a, 0x904b6523,
  0x193577f8, 0x429adfc2, 0x94fe5343, 0x4100a151, 0x9d2d52ef, 0x6efb8e08, 0xf858fd98, 0x49bc94bd,
  0xf1837fe0, 0xd0242a70, 0xd6aa7bdc, 0xb4f16fdc, 0x9bc28a38, 0xce2b9707, 0xfd0335e1, 0x422518f3,
  0x6373b766, 0xbc3a81d2, 0xae9a7f44, 0xfc5250cc, 0x81a27c05, 0x5665cc0e, 0xc1f0f220, 0x7674bfc9,
  0x423d56a8, 0x7bc4df5b, 0x8ce196c1, 0xe454546c, 0xe8e2c088, 0xc847c2b1, 0xd3e2ab97, 0xd04a7cf8,
  0xb7d9a0b4, 0x6073edfd, 0x53b5a561, 0x5828c2f0, 0x48074a2a, 0xebac5432, 0xe37df053, 0xcd07de79,
  0xff028e3a, 0xc2d1eecc, 0xef34f9d6, 0x70f465cf, 0x6af15021, 0xdc4cbbcd, 0x04cbf6b6, 0xc26b00d7,
  0xadc74144, 0x42dc2adf, 0x0e1b7751, 0x33b3f165, 0x8630efa3, 0x46b479a1, 0xf3f067a7, 0xfe3cad74,
  0xc8d8adc6, 0x0ae7ec07, 0x34380eed, 0x123373e0, 0x5c42e37a, 0x7d05a582, 0x86543a8c, 0x3b8d2380,
  0x895f9401, 0x07416351, 0xa7f90688, 0x688a2e66, 0x39e12c34, 0x8ee18c5b, 0xc146d556, 0xefb993ec,
  0xbe5c0cac, 0x50347757, 0x9d4c467d, 0x992ffe19, 0x20173621, 0x11e4f9cd, 0xcd22ea06, 0x195671ab,
  0x9f2450c8, 0x9deee2ba, 0xf3057224, 0x04ccacdb, 0x0790e3d8, 0x160ffc7e, 0x1971a098, 0x9a897d39,
];

export const stepGearHash16 = (byte, hash = 0) => {
  return ((hash << 1) + GEARS32[byte]) & 0xffff;
};

export const stepGearHash32 = (byte, hash = 0) => {
  return ((hash << 1) + GEARS32[byte]) & 0xffffffff;
};

export const gearHash16 = (bytes) => {
  let hash = 0;
  for (let byte of bytes) {
    hash = stepGearHash16(byte, hash);
  }
  return hash;
};

export const gearHash32 = (bytes) => {
  let hash = 0;
  for (let byte of bytes) {
    hash = stepGearHash32(byte, hash);
  }
  return hash;
};

function* bytes16(hashes) {
  for (let hash of hashes) {
    yield hash & 0xff00;
    yield hash & 0xff;
  }
}

export const gearHash = (bytes) => {
  let hashes = [];
  let hash = 0;
  let count = 0;
  for (let byte of bytes) {
    hash = stepGearHash16(byte, hash);

    if (count === 16) {
      hashes.push(hash);

      if (hashes.length === 8) {
        hash = gearHash16(bytes16(hashes));
        hashes = [hash];
      }
      count = 0;
    } else {
      count++;
    }
  }

  hashes.push(hash);

  return gearHash16(bytes16(hashes));
};

export const stepGearHashValue = (value, hash = 0) => {
  if (value === null) throw new Error();
  let valueHash = gearHash(UTF8From(printValue(value)));
  return ((hash << 2) + GEARS32[valueHash >> 8]) & 0xffff;
};

export const gearHashValues = (values) => {
  return gearHash(
    UTF8From('<__>' + [...arrayValues(values)].map((value) => printValue(value)).join('') + '</>'),
  );
};

const printHash = (hash) => {
  return hash.toString(16).padStart(4, '0');
};

const printValue = (value) => {
  if (isArray(value)) {
    return `__:##${getSums(value).gearHash}##<//>`;
  } else if (isObject(value)) {
    let property = value;
    let printed = '';
    for (let tag of traverse(property.value.tags)) {
      switch (tag.type) {
        case NullNode:
        case TreeNode:
        case GapNode:
          printed += '<//>';
          break;
        case HashTag:
        case BindingTag:
          break; // these do not affect tree balancing
        default:
          printed += printTag(tag, porcelain);
          break;
      }
    }
    return printed;
  } else {
    return value;
  }
};
