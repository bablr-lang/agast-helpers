import { isRecord } from '@bablr/record';
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
} from './symbols.js';
import { arrayReduce, arraySlice, freezeRecord, isArray, isObject, isString } from './object.js';
import { buildReference, parseTag, parseTagType } from './builders.js';
import { printTag } from './print.js';
import { arrayValues } from './iterable.js';
import { inRange } from './parse.js';
import { startsNode } from './path.js';

// Target nodes of size 8
let CRITICAL_THRESHHOLD = 8187; // 0xffff / 8

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

const treeFromValues = (values, depth) => {
  let depth_ = depth ?? Infinity;

  if (!isArray(values) && !values[Symbol.iterator]) throw new Error();

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

      for (let i = 0; i < values.length; i++) {
        let value = values[i];
        if (nodeCollapses(value)) {
          throw new Error('invalid btree: uncollapsed node');
        } else if (getDepth(value) !== firstDepth) {
          throw new Error('tree of mixed depths');
        } else if (!validNodes.has(value)) {
          throw new Error('tree node not valid');
        } else if (getType(value) !== type) {
          throw new Error('tree of mixed types');
        }
      }
    }
  }

  let tree;
  if (isArray(values) && values.length <= 4) {
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

const setValuesAt = (idx, node, value) => {
  const values = getValues(node);

  if (!Number.isFinite(idx)) throw new Error();

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

const push_ = (value, tree) => {
  let result;
  let path = findPath(getSize(tree), tree, getDepth(tree) - getDepth(value));

  let pathIdx = path.length - 1;
  let { node, index } = path[pathIdx];

  let pushout = value;

  let values = getValues(node);

  if (tree[0] === 16) {
    console.log(printTree(tree));
  }

  for (;;) {
    if (pushout) {
      values = [...arrayValues(values)];
      let hash = parseInt(getSums(node).gearHash, 16);

      let finiteIndex = index === Infinity ? values.length : index;

      if (!isFinite(finiteIndex)) throw new Error();
      if (values.length && hashesBreak(hash, stepGearHashValue(pushout, hash))) {
        pushout = __treeFromValues([pushout]);
        validNodes.add(pushout);
      } else {
        values.splice(finiteIndex, 0, pushout);
        node = treeFromValues(values);
        pushout = null;
      }
    }

    if (pathIdx === 0) {
      if (pushout) {
        return treeFromValues([node, pushout]);
      } else {
        return node;
      }
    }

    const poppedNode = node;
    pathIdx--;
    ({ node, index } = path[pathIdx]);

    node = setValuesAt(index, node, poppedNode);
    values = getValues(node);
  }

  result = __treeFromValues([...arrayValues(getValues(tree)), value]);
  validNodes.add(result);
  return result;
};

export const hashesBreak = (first, second) => {
  if (first == null) return false;
  if (first < CRITICAL_THRESHHOLD) {
    return second > 0xffff - CRITICAL_THRESHHOLD;
  } else {
    return second < CRITICAL_THRESHHOLD;
  }
};

export const nodeCollapses = (node) => {
  let values = getValues(node);
  if (values.length <= 2) return false;

  if (startsNode(parseTag(values[1]))) {
    return values.length <= 4;
  }

  let hash = 0;
  for (let value of arrayValues(values)) {
    let prevHash = hash;
    hash = stepGearHashValue(value, hash);
    if (hashesBreak(prevHash, hash)) {
      return true;
    }
  }
  return false;
};

const removeAt_ = (idx, tree) => {
  if (idx > getSize_(tree)) throw new Error('Index exceeds tree bounds');

  let path = findPath(idx, tree);

  let pathIdx = path.length - 1;
  let { node, index } = path[pathIdx];

  const initialValues = [...arrayValues(getValues(node))];

  initialValues.splice(index, 1);

  let returnValue = !isFinite(node[0]) ? initialValues : treeFromValues(initialValues);

  for (;;) {
    let values = getValues(returnValue);
    let adjustSibling = null;

    if (pathIdx >= 1 && nodeCollapses(returnValue)) {
      let { node: parentNode, index: parentIndex } = path[pathIdx - 1];
      const prevSibling = getValues(parentNode)[parentIndex - 1];
      const nextSibling = getValues(parentNode)[parentIndex + 1];
      let targetSibling = nodeCanDonate(prevSibling)
        ? prevSibling
        : nodeCanDonate(nextSibling)
        ? nextSibling
        : null;
      let targetSiblingIndex = targetSibling && (prevSibling ? parentIndex - 1 : parentIndex + 1);

      if (targetSibling) {
        let targetValues = slice.call(getValues(targetSibling));

        const donationIdx = targetSibling === prevSibling ? targetValues.length - 1 : 0;
        const donated = targetValues[donationIdx];
        targetValues.splice(donationIdx, 1);

        adjustSibling = {
          node: treeFromValues(targetValues),
          index: targetSiblingIndex,
        };

        values = slice.call(values);

        values.splice(targetSibling === prevSibling ? values.length : 0, 0, donated);

        returnValue = treeFromValues(values);
      } else if (prevSibling && getValues(prevSibling).length + values.length <= NODE_SIZE) {
        adjustSibling = {
          node: null,
          index: parentIndex - 1,
        };

        returnValue = treeFromValues([
          ...arrayValues(getValues(prevSibling)),
          ...arrayValues(values),
        ]);
      } else if (nextSibling && values.length + getValues(nextSibling).length <= NODE_SIZE) {
        adjustSibling = {
          node: null,
          index: parentIndex + 1,
        };

        returnValue = treeFromValues([
          ...arrayValues(values),
          ...arrayValues(getValues(nextSibling)),
        ]);
      }
    }

    if (pathIdx === 0) {
      return returnValue;
    }

    pathIdx--;
    ({ node, index } = path[pathIdx]);

    values = slice.call(getValues(node));

    values.splice(index, 1, returnValue);

    if (adjustSibling) {
      const { index, node } = adjustSibling;
      if (node) {
        values.splice(index, 1, node);
      } else {
        values.splice(index, 1);
      }
    }

    if (values.length === 1) {
      values = getValues(values[0]);
    }

    returnValue = node = treeFromValues(values);
  }
};

const pop = (tree) => {
  return removeAt_(-1, tree);
};

const shift = (tree) => {
  return removeAt_(0, tree);
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

  return Number.isFinite(node[0]) ? node[2] || null : null;
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
        yield value;
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
  if (idx == null) throw new Error();
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

const replaceAt_ = (idx, value, tree) => {
  let path = findPath(idx, tree, getDepth(tree) - getDepth(value));

  if (getSize_(tree) < idx) {
    throw new Error('Cannot add past the end of a list');
  }

  let pathIndex = path.length - 1;
  let { node, index } = path[pathIndex];

  let returnValue = setValuesAt(index, node, value);

  for (;;) {
    ({ node, index } = path[pathIndex]);

    if (pathIndex > 0) {
      pathIndex--;
      ({ node, index } = path[pathIndex]);

      returnValue = setValuesAt(index, node, returnValue);
    } else {
      return returnValue;
    }
  }
};

export const referenceIsSingular = (ref) => {
  return !ref.flags.array && !['#', '@', '.', '__'].includes(ref.type);
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

const __findStats = (name, sortedArray, startIdx, endIdx) => {
  if (!sortedArray.length || endIdx < startIdx) return null;

  let idx = startIdx + Math.floor((endIdx - startIdx) / 2 + 0.1);
  let skipIdx = idx * 3;
  let key = sortedArray[skipIdx];
  let value = sortedArray[skipIdx + 1];

  let direction = compareNames(name, key);

  if (direction === 0) {
    return value;
  } else {
    if (startIdx === endIdx) return null;

    if (direction > 0) {
      return __findStats(name, sortedArray, idx + 1, endIdx);
    } else {
      return __findStats(name, sortedArray, startIdx, idx - 1);
    }
  }
};

export const findStats = (name, sortedArray, startIdx = 0, endIdx = sortedArray.length / 3 - 1) => {
  return __findStats(name, sortedArray, startIdx, endIdx);
};

export const getIndex = (pathSegment, tags) => {
  let { type, name, index, shiftIndex } = pathSegment;
  let firstPropsIndex = __getPropertyTagsIndex(tags, type, name, 0);
  let prop = firstPropsIndex == null ? null : getAt(firstPropsIndex, tags);
  let ref = prop?.value.reference;
  let sums = getSums(tags);
  let counts = name ? sums.names : sums.types;

  if (ref?.flags.array) {
    if (index < 0) {
      index = findStats(type, counts) + index;
    } else if (index == null) {
      index = findStats(name, counts) - 1;

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
      while (getAt(parentIndex + shifts, getValues(tags)[2])?.value.shift) {
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
  let node = getValues(tags)[2];
  let idx = -1;

  // drill into subtrees, passing over subtrees with too few references of the desired name
  outer: while (node) {
    let sums = getSums(node);

    if (!sums) throw new Error();

    let valueNameCount = name != null ? findStats(name, sums.names) : findStats(type, sums.types);

    if (nameCount + valueNameCount < index) {
      return null;
    }

    for (const value of arrayValues(getValues(node))) {
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
                return idx + 2;
              }
            }
          }
        }
      } else {
        let valueSums = getSums(value);
        if (
          nameCount +
            (name != null ? findStats(name, valueSums.names) : findStats(type, valueSums.types)) >
          index
        ) {
          node = value;
          continue outer;
        } else {
          nameCount +=
            (name != null ? findStats(name, valueSums.names) : findStats(type, valueSums.types)) ??
            0;
          idx += getSize(value);
        }
      }
    }

    return null;
  }

  return null;
};

export const compareNames = (a, b) => (a > b ? 1 : b > a ? -1 : 0);

export const sumValues = (values, depth) => {
  let mapStats = arrayReduce(
    values,
    (acc, val) => {
      const { names, types } = acc;
      if (isArray(val)) {
        acc.lineBreaks += getSums(val).lineBreaks;
        acc.gaps += getSums(val).gaps;

        let arrs = [
          [getSums(val).names, names],
          [getSums(val).types, types],
        ];

        for (let { 0: arr, 1: map } of arrs) {
          for (let i = 0; i < arr.length; i++) {
            let key = arr[i];
            let value = arr[++i];
            let reference = arr[++i];

            let count = map.get(key)?.[1] ?? 0;

            if (referenceIsSingular(reference) && count > 0) throw new Error();

            map.set(key, [key, count + value, reference]);
          }
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
          if (!isArray(tags[1][0]) && !isString(tags[1][0])) throw new Error();
          let refOrShiftTag = isArray(tags[1][0]) ? buildReference() : parseTag(tags[1][0]);

          if (tags[1][2]) {
            acc.gaps += tags[1][2].value.tags[2].gaps;
          }
          if (refOrShiftTag?.type !== ShiftTag) {
            let ref = refOrShiftTag?.value || buildReference();
            const { type, name } = ref;

            if (name) {
              let count = names.get(name)?.[1] ?? 0;

              if (referenceIsSingular(ref) && count > 0) throw new Error();

              names.set(name, [name, count + 1, ref]);
            }

            if (type) {
              let count = types.get(type)?.[1] ?? 0;

              if (referenceIsSingular(ref) && count > 0) throw new Error();

              types.set(type, [type, count + 1, ref]);
            }
          }
        }
      }
      return acc;
    },
    {
      gaps: 0,
      lineBreaks: 0,
      names: new Map(),
      types: new Map(),
    },
  );

  let { lineBreaks, gaps } = mapStats;
  let stats = freezeRecord({
    gaps,
    lineBreaks,
    names: freezeRecord(
      [...mapStats.names.values()].sort((a, b) => compareNames(a[0], b[0])).flatMap((_) => _),
    ),
    types: freezeRecord(
      [...mapStats.types.values()].sort((a, b) => compareNames(a[0], b[0])).flatMap((_) => _),
    ),
    hashes: null,
    gearHash: gearHashValues(values).toString(16),
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
      tags[1][1] &&
      parseTagType(tags[1][1]) === OpenNodeTag &&
      inRange(absIdx, 2, getSize(tags[1][2]) + 1)
    ) {
      return getAt_(absIdx - 2, tags[1][2]);
    } else {
      if (isNode(tags) && tags[1][1] && parseTagType(tags[1][1]) === OpenNodeTag) {
        return getAt_([absIdx >= 2 ? absIdx - getSize(tags[1][2]) + 1 : absIdx], tags);
      } else {
        return getAt_(idx, tags);
      }
    }
  }
};

export const getSize = (tags) => {
  if (!isNode(tags)) return 1;
  let sigilTag = tags[1][1];
  if (isString(sigilTag) && parseTagType(sigilTag) === OpenNodeTag) {
    let children = tags[1][2];
    return getSize_(tags) + (children ? getSize_(children) - 1 : 0);
  } else {
    return getSize_(tags);
  }
};

export const push = (tag, tags) => {
  let tag_ = parseTag(tag);
  let sigilTag = parseTag(getAt(1, tags));

  if (
    !isNode(tag_) &&
    ![
      OpenNodeTag,
      Property,
      CloseNodeTag,
      AttributeDefinition,
      BindingTag,
      LiteralTag,
      GapTag,
    ].includes(tag_.type)
  )
    throw new Error();

  if (isNode(tag_)) {
    if (!sigilTag || sigilTag.type !== OpenNodeTag) {
      return concat(tags, tag_);
    }
    let children = getValues(tags)[2] ?? treeFromValues([]);

    let { 0: hash, 1: open } = getValues(tags);

    children = concat(children, tag_);

    return treeFromValues([hash, open, children]);
  } else {
    if (tag_.type === OpenNodeTag) {
      if (getSize(tags) !== 0) throw new Error();

      let tree = __treeFromValues([tags[1][0], tag]);
      validNodes.add(tree);
      return tree;
    } else {
      if (!sigilTag || sigilTag.type !== OpenNodeTag) {
        return push_(tag, tags);
      }

      let children = getValues(tags)[2] ?? treeFromValues([]);

      // sometimes this is the top level
      if (sigilTag) {
        if (tag_.type === CloseNodeTag) {
          let { 0: hash, 1: open, 2: children = treeFromValues([]) } = getValues(tags);

          return treeFromValues([hash, open, children, printTag(tag_)], 1);
        } else {
          let { 0: hash, 1: open } = getValues(tags);

          children = push_(printTag(tag_), children);

          return treeFromValues([hash, open, children], 1);
        }
      } else {
        return push_(tag_, tags);
      }
    }
  }
};

export const replaceAt = (idx, tag, tree) => {
  let idx_ = idx < 0 ? getSize(tree) + idx : idx;
  let tagObj = parseTag(tag);
  let tag_ = printTag(tag);

  if (tagObj.type !== parseTagType(getAt(idx_, tree))) throw new Error();
  let sigilTag = parseTag(getAt(1, tree));

  if (sigilTag && sigilTag.type === OpenNodeTag) {
    let newTags = [...arrayValues(getValues(tree))];
    if (idx_ === 0) {
      newTags[0] = tag_;
    } else if (idx_ === 1) {
      newTags[1] = tag_;
    } else if (tagObj.type === CloseNodeTag) {
      if (idx_ !== getSize(tree) - 1) throw new Error();
      newTags[3] = tag_;
    } else {
      let children = getValues(tree)[2];

      children = replaceAt_(idx_ - 2, tag_, children);

      newTags[2] = children;
    }
    return treeFromValues(newTags, 1);
  } else {
    return replaceAt_(idx_, tag_, tree);
  }
};

export const removeAt = (idx, tree) => {
  let idx_ = idx < 0 ? getSize(tree) + idx : idx;

  let sigilTag = parseTag(getAt(1, tree));

  if (sigilTag && sigilTag.type === OpenNodeTag) {
    let newTags = [...arrayValues(getValues(tree))];
    if (idx_ === 0) {
      newTags.splice(0, 1);
    } else if (idx_ === 0) {
      newTags.splice(1, 2);
    } else if (idx_ === getSize(tree) - 1) {
      newTags.splice(3, 2);
    } else {
      let children = getValues(tree)[2];

      children = removeAt_(idx_ - 2, children);

      newTags[2] = children;
    }
    return treeFromValues(newTags, 1);
  } else {
    return removeAt_(idx_, tree);
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
  let { 0: hash, 1: open, 2: children, 3: close } = getValues(tree);

  let newValues = [hash ? fn(hash) : empty()];
  if (open) {
    newValues.push(fn(open));
    if (children) newValues.push(map_(fn, children));
    if (close) newValues.push(fn(close));
  }

  return treeFromValues(newValues, 1);
};

function* codePoints(str) {
  for (let chr of str) {
    return chr.codePointAt(0);
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

let GEARS = [
  3071, 28360, 20328, 5906, 48946, 17179, 7916, 63758, 26001, 6917, 10653, 24230, 27274, 36079,
  3793, 44607, 19887, 1677, 51790, 13208, 38356, 15307, 65343, 16544, 40955, 22012, 21058, 54868,
  16266, 32258, 25266, 9178, 23053, 39711, 28720, 24136, 31168, 53125, 55358, 17465, 39226, 34725,
  12322, 58455, 31741, 53745, 4074, 32261, 31760, 21148, 59556, 24531, 65436, 31088, 49819, 41018,
  43629, 34302, 7753, 51745, 17693, 12621, 5770, 58460, 59218, 46646, 15053, 56272, 40649, 12281,
  30466, 24954, 5814, 94, 36140, 41262, 23035, 25411, 38622, 29252, 6356, 23078, 18999, 44327, 2726,
  28228, 36600, 2468, 9874, 2469, 60845, 50920, 50872, 57217, 34812, 32442, 60985, 20076, 16890,
  26532, 2859, 14431, 5350, 3932, 9227, 24472, 36049, 14680, 36146, 2733, 46765, 40800, 52351,
  36443, 19660, 51283, 12066, 54953, 63285, 23337, 1017, 57085, 2754, 40602, 37051, 9562, 13173,
  5594, 50901, 25277, 63847, 14204, 52513, 46149, 57562, 35158, 55352, 56718, 59747, 31185, 1920,
  26149, 47188, 4933, 33482, 61947, 51310, 56624, 45366, 15817, 7444, 38234, 7124, 60273, 39317,
  55123, 54980, 10717, 63071, 24027, 62892, 5575, 25067, 26190, 2141, 63034, 26905, 51504, 13535,
  24053, 45730, 1921, 58590, 64830, 17112, 57801, 35445, 57056, 25525, 48242, 44240, 1609, 27396,
  46966, 60929, 18790, 17608, 65529, 64543, 7126, 53291, 16231, 52561, 56005, 4077, 1616, 36177,
  7817, 54079, 21100, 42964, 30274, 11327, 17124, 30788, 62038, 64372, 47538, 34037, 59572, 13527,
  13588, 38078, 16676, 17139, 2762, 55282, 20834, 7322, 22804, 21280, 46947, 26391, 19676, 19311,
  56030, 28227, 17635, 39400, 16278, 37844, 21462, 29191, 43958, 2423, 38456, 18301, 12750, 42627,
  6946, 548, 34088, 59279, 42428, 9760, 4588, 55425, 19588, 10664, 60549, 62352, 6410, 59315, 2294,
  4081, 21565,
];

export const stepGearHash = (byte, hash = 0) => {
  return ((hash << 1) + GEARS[byte]) & 0xffff;
};

export const gearHash = (bytes) => {
  let hash = 0;
  for (let byte of bytes) {
    hash = stepGearHash(byte, hash);
  }
  return hash;
};

export const stepGearHashValue = (value, hash = 0) => {
  let valueHash = gearHash(encodeUTF8(codePoints(printValue(value))));
  return ((hash << 1) + GEARS[valueHash >> 8]) & 0xffff;
};

export const gearHashValues = (values) => {
  let hash = 0;

  for (let value of isArray(values) ? arrayValues(values) : values) {
    hash = stepGearHashValue(value, hash);
  }

  return hash;
};

const printHash = (hash) => {
  return hash.toString(16);
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
          printed += 'null';
          break;
        case GapNode:
          printed += '<//>';
          break;
        case TreeNode:
          printed += `##${getSums(tag.value.tags).gearHash}##<//>`;
          break;
        case HashTag:
          // hash tags do not affect tree balancing
          break;
        default:
          printed += tag;
          break;
      }
    }
    return printed;
  } else {
    return value;
  }
};
