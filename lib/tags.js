import { buildModule, defaultNodeSize } from '@bablr/btree/enhanceable';
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
} from './symbols.js';
import { freeze, isArray, isObject } from './object.js';
import { buildReference, parseTag, parseTagType } from './builders.js';
import { printTag } from './print.js';

export { defaultNodeSize };

export const referenceIsSingular = (ref) => {
  return !ref.flags.array && !['#', '@', '.'].includes(ref.type);
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

const __findStats = (name, sortedArray, startIdx = 0, endIdx = sortedArray.length - 1) => {
  if (!sortedArray.length || endIdx < startIdx) return null;

  let idx = startIdx + Math.floor((endIdx - startIdx) / 2 + 0.1);
  let entry = sortedArray[idx];
  let { 0: key, 1: value } = entry;

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

export const findStats = (name, sortedArray, startIdx = 0, endIdx = sortedArray.length - 1) => {
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
      while (getAt(parentIndex + shifts, getValues(tags)[1])?.value.shift) {
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
  let node = getValues(tags)[1];
  let idx = -1;

  // drill into subtrees, passing over subtrees with too few references of the desired name
  outer: while (node) {
    let sums = getSums(node);

    if (!sums) throw new Error();

    let valueNameCount = name != null ? findStats(name, sums.names) : findStats(type, sums.types);

    if (nameCount + valueNameCount < index) {
      return null;
    }

    for (const value of getValues(node)) {
      if (isLeaf(value)) {
        idx++;
        let tag = value;
        if (isObject(tag) && tag.type === Property) {
          let { tags, reference } = tag.value;
          if (tags[1][0].type === ReferenceTag) {
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

export const sumValues = (values) => {
  let mapStats = values.reduce(
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
          for (const { 0: key, 1: value, 2: reference } of arr) {
            let count = map.get(key)?.[1] ?? 0;

            if (referenceIsSingular(reference) && count > 0) throw new Error();

            map.set(key, freeze([key, count + value, reference]));
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
          let refOrShiftTag = tags[1][0];

          if (tags[1][2]) {
            acc.gaps += tags[1][2].value.tags[2].gaps;
          }
          if (refOrShiftTag?.type !== ShiftTag) {
            let ref = refOrShiftTag?.value || buildReference();
            const { type, name } = ref;

            if (name) {
              let count = names.get(name)?.[1] ?? 0;

              if (referenceIsSingular(ref) && count > 0) throw new Error();

              names.set(name, freeze([name, count + 1, ref]));
            }

            if (type) {
              let count = types.get(type)?.[1] ?? 0;

              if (referenceIsSingular(ref) && count > 0) throw new Error();

              types.set(type, freeze([type, count + 1, ref]));
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
  let stats = {
    gaps,
    lineBreaks,
    names: freeze([...mapStats.names.values()].sort((a, b) => compareNames(a[0], b[0]))),
    types: freeze([...mapStats.types.values()].sort((a, b) => compareNames(a[0], b[0]))),
  };
  freeze(stats);
  return stats;
};

const module_ = buildModule(defaultNodeSize, sumValues, Symbol.for('Tags'));

const {
  from,
  fromValues,
  create,
  addAt,
  isValidNode,
  isNode,
  isLeaf,
  assertValidNode,
  getValues,
  getSums,
  traverse,
  getSize,
  findPath,
  getAt,
} = module_;

const push = (tag, tags) => {
  let tag_ = parseTag(tag);
  let firstTag = parseTag(getAt(0, tags));

  if (
    isLeaf(tag_) &&
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
    if (!firstTag || firstTag.type !== OpenNodeTag) {
      return module_.concat(tags, tag_);
    }
    let children = getValues(tags)[1] ?? module_.fromValues([]);

    let { 0: open } = getValues(tags);

    children = module_.concat(children, tag_);

    return module_.fromValues([open, children]);
  } else {
    if (tag_.type === OpenNodeTag) {
      if (getSize(tags) !== 0) throw new Error();
      return module_.push(tag_, tags);
    } else {
      if (!firstTag || firstTag.type !== OpenNodeTag) {
        return module_.push(tag_, tags);
      }

      let children = getValues(tags)[1] ?? module_.fromValues([]);

      // sometimes this is the top level
      if (firstTag) {
        if (tag_.type === CloseNodeTag) {
          let { 0: open, 1: children = module_.fromValues([]) } = getValues(tags);

          return module_.fromValues([open, children, tag_]);
        } else {
          let { 0: open } = getValues(tags);

          children = module_.push(tag_, children);

          return module_.fromValues([open, children]);
        }
      } else {
        return module_.push(tag_, tags);
      }
    }
  }
};

const replaceAt = (idx, tag, tree) => {
  let idx_ = idx < 0 ? getSize(tree) + idx : idx;
  let tagObj = parseTag(tag);
  let tag_ = printTag(tag);

  if (tagObj.type !== parseTagType(getAt(idx_, tree))) throw new Error();
  let firstTag = parseTag(getAt(0, tree));

  if (firstTag && firstTag.type === OpenNodeTag) {
    let newTags = [...getValues(tree)];
    if (idx_ === 0) {
      newTags[0] = tag_;
    } else if (tagObj.type === CloseNodeTag) {
      if (idx_ !== getSize(tree) - 1) throw new Error();
      newTags[2] = tag_;
    } else {
      let children = getValues(tree)[1];

      children = module_.replaceAt(idx_ - 1, tag_, children);

      newTags[1] = children;
    }
    return module_.fromValues(newTags);
  } else {
    return module_.replaceAt(idx_, tag_, tree);
  }
};

const removeAt = (idx, tree) => {
  let idx_ = idx < 0 ? getSize(tree) + idx : idx;

  let firstTag = parseTag(getAt(0, tree));

  if (firstTag && firstTag.type === OpenNodeTag) {
    let newTags = [...getValues(tree)];
    if (idx_ === 0) {
      newTags.splice(0, 1);
    } else if (idx_ === getSize(tree - 1)) {
      newTags.splice(2, 1);
    } else {
      let children = getValues(tree)[1];

      children = module_.removeAt(idx_ - 1, children);

      newTags[1] = children;
    }
    return module_.fromValues(newTags);
  } else {
    return module_.removeAt(idx_, tree);
  }
};

function* traverseInner(tree) {
  for (let tag of traverse(tree)) {
    if (isObject(tag) && tag.type === Property) {
      yield* traverse(tag.value.tags);
    } else {
      yield tag;
    }
  }
}

export {
  from,
  fromValues,
  create,
  push,
  addAt,
  isValidNode,
  isNode,
  isLeaf,
  assertValidNode,
  getSize,
  getValues,
  getSums,
  traverse,
  traverseInner,
  findPath,
  getAt,
  replaceAt,
  removeAt,
};
