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
  NullTag,
} from './symbols.js';
import { arrayReduce, arraySlice, freezeRecord, isArray, isObject, isString } from './object.js';
import { buildReference, parseTag, parseTagType } from './builders.js';
import { printSelfClosingNodeTag, printTag } from './print.js';
import { arrayValues } from './iterable.js';
import { inRange } from './parse.js';
import { getOpenTag } from './path.js';

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

  let isRoot = isString(values[1]) && startsNode(parseTag(values[1]));

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
      for (let i = 0; i < values.length; i++) {
        let value = values[i];
        size += getSize(value);
        if (getDepth(value) !== firstDepth) {
          throw new Error('tree of mixed depths');
        } else if (!validNodes.has(value)) {
          throw new Error('tree node not valid');
        } else if (getType(value) !== type) {
          throw new Error('tree of mixed types');
        }
      }

      if (size && !isRoot) {
        let hash = 0;
        let valuesIdx = 0;
        let valueFirstIdx = 0;
        let nextValueFirstIdx = valueFirstIdx + getSize(values[valuesIdx]);

        for (let idx = 0; ; idx++) {
          let value = values[valuesIdx];

          if (idx + 16 >= nextValueFirstIdx) {
            let leafValue = getAt(idx - valueFirstIdx, value);
            let lastHash = hash;
            hash = stepGearHashValue(leafValue, hash);

            if (idx && idx === valueFirstIdx) {
              if (!hashesBreak(lastHash, hash)) {
                throw new Error('nodes collapse');
              }
            }
          } else {
            hash = 0;
            idx = nextValueFirstIdx - 16 - 1;
          }

          if (idx === nextValueFirstIdx - 1) {
            valuesIdx++;
            if (valuesIdx < values.length) {
              valueFirstIdx = idx + 1;
              nextValueFirstIdx = valueFirstIdx + getSize(values[valuesIdx]);
            } else {
              break;
            }
          }
        }
      }
    } else {
      let hash = 0;
      let lastHash = null;
      for (let value of arrayValues(values)) {
        hash = stepGearHashValue(value, hash);

        if (lastHash !== null && hashesBreak(lastHash, hash)) {
          throw new Error('nodes should break');
        }
        lastHash = hash;
      }
    }
  }

  let tree;
  if (isArray(values) && values.length <= (isRoot ? 4 : 1)) {
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

export const startsNode = (tag) => {
  let tagType = parseTagType(tag);
  return [OpenNodeTag, NullTag, GapTag].includes(tagType);
};

function* leafNodes(tree) {
  let stack = [];
  let node = tree;
  let i = 0;

  for (;;) {
    if (getDepth(node) > 1) {
      if (i < getValues(node).length) {
        let value = getValues(node)[i];

        stack.push({ node, i });
        node = value;
        i = 0;
      }
    } else {
      yield node;
    }

    if (!stack.length) return;

    ({ node, i } = stack.pop());
    i++;
  }
}

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

const listValues = (node) => {
  return arrayValues(getValues(node));
};

const nextPath = (path) => {
  throw new Error('not implemented');
};

const splice_ = (idx, removeCount, insertValues, tree) => {
  let idx_ = !isArray(idx) && idx < 0 ? Math.max(getSize(tree) + idx + 1, 0) : idx;
  let path = findPath(idx_, tree);
  let rootPath = path[0];
  let depth = path.length;
  let size_ = getSize(tree);
  let insertValues_ = insertValues;
  let removeCount_ = removeCount;

  let isLeaf = true;
  for (let d = depth; d > 0; d--) {
    let { node, index } = path.pop();
    let values = [...listValues(node)];
    let nextInsertValues = [];
    let nextRemoveCount = 1;
    let chunk = [];
    let lastHash = null;
    let hash = idx_ && gearHash16At(idx_ - 1, tree);

    for (let i = 0; i < removeCount_; i++) {
      debugger;
      if (isLeaf) {
        size_--;
      }
    }

    if (values.length) {
      if (
        hashesBreak(
          hash,
          // TODO is this handling deleteLeftovers?
          stepGearHashValue(insertValues_.length ? insertValues_[0] : getAt(idx_, tree), hash),
        )
      ) {
        nextRemoveCount = 0;
      } else {
        let target = Number.isFinite(index) ? index - 1 : index > 0 ? values.length - 1 : 0;
        if (isLeaf) {
          chunk.push(...values.slice(0, target + 1));
          nextRemoveCount += target;
        } else {
          chunk.push(values[target]);
        }
      }
    }

    for (let i = 0; i < insertValues_.length; i++) {
      let value = insertValues_[i];

      hash = stepGearHashValue(value, hash);

      if (hashesBreak(lastHash, hash)) {
        nextInsertValues.push(treeFromValues(chunk));
        chunk = [];
      } else {
        chunk.push(value);
      }
      if (isLeaf) {
        idx_++;
        size_++;
      }
      lastHash = hash;
    }

    for (let i = 0; i < Math.min(16, size_ - idx_); i++) {
      let value = getAt(i, tree);

      hash = stepGearHashValue(value, hash);

      if (hashesBreak(lastHash, hash)) {
        nextInsertValues.push(chunk);
        chunk = [];
      } else {
        chunk.push(value);
      }
      lastHash = hash;
    }

    nextInsertValues.push(deleteLeftovers);

    nextInsertValues.push(treeFromValues(chunk));

    // now we should be re-synced

    isLeaf = false;
    insertValues_ = nextInsertValues;
    removeCount_ = nextRemoveCount;
  }

  {
    let values = [tree];
    let { index } = rootPath;
    let target = Number.isFinite(index)
      ? index - removeCount_
      : index > 0
      ? values.length - removeCount_
      : 0;
    values.splice(target, removeCount_, ...insertValues_);

    return values.length === 1 ? values[0] : treeFromValues(values);
  }
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
    throw new Error('not implemented');
  } else {
    if (tag_.type === OpenNodeTag) {
      if (getSize(tags) !== 0) throw new Error();

      let tree = __treeFromValues([tags[1][0], tag]);
      validNodes.add(tree);
      return tree;
    } else {
      if (!sigilTag || sigilTag.type !== OpenNodeTag) {
        return splice_(-1, 0, [tag], tags);
      }

      let children = getValues(tags)[2] ?? treeFromValues([]);

      // sometimes this is the top level
      if (sigilTag) {
        if (tag_.type === CloseNodeTag) {
          let { 0: hash, 1: open, 2: children = treeFromValues([]) } = getValues(tags);

          return treeFromValues([hash, open, children, tag], 1);
        } else {
          let { 0: hash, 1: open } = getValues(tags);

          children = splice_(-1, 0, [tag], children);

          return treeFromValues([hash, open, children], 1);
        }
      } else {
        return splice_(-1, 0, [tag], tags);
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
    let newTags = [...listValues(tree)];
    if (idx_ === 0) {
      newTags[0] = tag_;
    } else if (idx_ === 1) {
      newTags[1] = tag_;
    } else if (tagObj.type === CloseNodeTag) {
      if (idx_ !== getSize(tree) - 1) throw new Error();
      newTags[3] = tag_;
    } else {
      let children = getValues(tree)[2];

      children = splice_(idx_ - 2, 1, [tag_], children);

      newTags[2] = children;
    }
    return treeFromValues(newTags, 1);
  } else {
    return splice_(idx_, 1, [tag_], tree);
  }
};

export const removeAt = (idx, tree) => {
  let idx_ = idx < 0 ? getSize(tree) + idx : idx;

  let sigilTag = parseTag(getAt(1, tree));

  if (sigilTag && sigilTag.type === OpenNodeTag) {
    let newTags = [...listValues(tree)];
    if (idx_ === 0 || (isArray(idx) && idx[0] === 0)) {
      newTags.splice(0, 1);
    } else if (idx_ === 1 || (isArray(idx) && idx[0] === 1)) {
      newTags.splice(1, 2);
    } else if (idx_ === getSize(tree) - 1 || (isArray(idx) && idx[0] === 3)) {
      newTags.splice(3, 2);
    } else {
      let children = getValues(tree)[2];
      let idx__ = isArray(idx_) ? arraySlice(idx, 1) : idx_ - 2;

      children = splice_(idx__, 1, [], children);

      newTags[2] = children;
    }
    return treeFromValues(newTags, 1);
  } else {
    return splice_(idx_, 1, [], tree);
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

let GEARS = [
  3071, 28360, 20328, 5906, 48946, 17179, 7916, 63758, 26001, 6917, 10653, 24230, 27274, 36079,
  3793, 44607, 19887, 1677, 51790, 13208, 38356, 15307, 65343, 16544, 40955, 22012, 21058, 54868,
  16266, 32258, 25266, 9178, 23053, 39711, 28720, 24136, 31168, 53125, 55358, 17465, 39226, 34725,
  12322, 58455, 31741, 53745, 4074, 32261, 31760, 21148, 59556, 24531, 65436, 31088, 49819, 41018,
  43629, 34302, 7753, 51745, 17693, 12621, 5770, 58460, 59218, 46646, 15053, 56272, 40649, 12281,
  30466, 24954, 5814, 294, 36140, 41262, 23035, 25411, 38622, 29252, 6356, 23078, 18999, 44327,
  2726, 28228, 36600, 2468, 9874, 2469, 60845, 50920, 50872, 57217, 34812, 32442, 60985, 20076,
  16890, 26532, 2859, 14431, 5350, 3932, 9227, 24472, 36049, 14680, 36146, 2733, 46765, 40800,
  52351, 36443, 19660, 51283, 12066, 54953, 63285, 23337, 1017, 57085, 2754, 40602, 37051, 9562,
  13173, 5594, 50901, 25277, 63847, 14204, 52513, 46149, 57562, 35158, 55352, 56718, 59747, 31185,
  1920, 26149, 47188, 4933, 33482, 61947, 51310, 56624, 45366, 15817, 7444, 38234, 7124, 60273,
  39317, 55123, 54980, 10717, 63071, 24027, 62892, 5575, 25067, 26190, 2141, 63034, 26905, 51504,
  13535, 24053, 45730, 1921, 58590, 64830, 17112, 57801, 35445, 57056, 25525, 48242, 44240, 1609,
  27396, 46966, 60929, 18790, 17608, 65529, 64543, 7126, 53291, 16231, 52561, 56005, 4077, 1616,
  36177, 7817, 54079, 21100, 42964, 30274, 11327, 17124, 30788, 62038, 64372, 47538, 34037, 59572,
  13527, 13588, 38078, 16676, 17139, 2762, 55282, 20834, 7322, 22804, 21280, 46947, 26391, 19676,
  19311, 56030, 28227, 17635, 39400, 16278, 37844, 21462, 29191, 43958, 2423, 38456, 18301, 12750,
  42627, 6946, 548, 34088, 59279, 42428, 9760, 4588, 55425, 19588, 10664, 60549, 62352, 6410, 59315,
  2294, 4081, 21565,
];

export const stepGearHash16 = (byte, hash = 0) => {
  return ((hash << 1) + GEARS[byte]) & 0xffff;
};

export const gearHash16 = (bytes) => {
  let hash = 0;
  for (let byte of bytes) {
    hash = stepGearHash16(byte, hash);
  }
  return hash;
};

function* bytes16(hashes) {
  if (hashes.length > 16) throw new Error();

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
  let valueHash = gearHash(encodeUTF8(codePoints(printValue(value))));
  return ((hash << 1) + GEARS[valueHash >> 8]) & 0xffff;
};

export const gearHash16At = (index, node) => {
  let start = Math.max(0, index - 16);
  let end = index;

  let hash = 0;
  for (let i = start; i <= end; i++) {
    hash = stepGearHashValue(getAt(i, node), hash);
  }
  return hash;
};

export const gearHashValues = (values) => {
  let hash = 0;

  for (let value of isArray(values) ? arrayValues(values) : values) {
    hash = stepGearHashValue(value, hash);
  }

  return hash;
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
          printed += tag;
          break;
      }
    }
    return printed;
  } else {
    return value;
  }
};
