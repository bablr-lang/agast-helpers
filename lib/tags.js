import { buildModule, defaultNodeSize } from '@bablr/btree/enhanceable';
import {
  AttributeDefinition,
  CloseNodeTag,
  GapTag,
  LiteralTag,
  OpenNodeTag,
  PropertyWrapper,
  ReferenceTag,
} from './symbols.js';
import { isObject } from './object.js';

const { isArray } = Array;
const { freeze } = Object;

export { defaultNodeSize };

const __getAtName = (name, sortedArray, startIdx = 0, endIdx = sortedArray.length - 1) => {
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
      return __getAtName(name, sortedArray, idx + 1, endIdx);
    } else {
      return __getAtName(name, sortedArray, startIdx, idx - 1);
    }
  }
};

export const getAtName = (name, sortedArray, startIdx = 0, endIdx = sortedArray.length - 1) => {
  return __getAtName(name, sortedArray, startIdx, endIdx);
};

export const compareNames = (a, b) => (a > b ? 1 : b > a ? -1 : 0);

export const sumValues = (values) => {
  let mapStats = values.reduce(
    (acc, val) => {
      const { references, specialTypes } = acc;
      if (isArray(val)) {
        acc.lineBreaks += getSums(val).lineBreaks;

        for (const { 0: key, 1: value } of getSums(val).references) {
          references.set(key, (references.get(key) ?? 0) + value);
        }

        for (const { 0: key, 1: value } of getSums(val).specialTypes) {
          specialTypes.set(key, (specialTypes.get(key) ?? 0) + value);
        }
      } else if (val) {
        if (val.type === LiteralTag) {
          let text = val.value;
          let idx = 0;
          while ((idx = text.indexOf('\n', idx + 1)) >= 0) {
            acc.lineBreaks++;
          }
        } else if (val.type === PropertyWrapper) {
          let { tags } = val.value;
          let refOrShiftTag = tags[0];

          if (refOrShiftTag.type === ReferenceTag) {
            const { type, name } = refOrShiftTag.value;
            if (name) {
              references.set(name, (references.get(name) ?? 0) + 1);
            } else {
              specialTypes.set(type, (specialTypes.get(type) ?? 0) + 1);
            }
          }
        }
      }
      return acc;
    },
    {
      lineBreaks: 0,
      references: new Map(),
      specialTypes: new Map(),
    },
  );

  let { lineBreaks } = mapStats;
  let stats = {
    lineBreaks,
    references: [...mapStats.references].sort((a, b) => compareNames(a[0], b[0])),
    specialTypes: [...mapStats.specialTypes].sort((a, b) => compareNames(a[0], b[0])),
  };
  freeze(stats);
  freeze(stats.references);
  freeze(stats.specialTypes);
  return stats;
};

const module_ = buildModule(defaultNodeSize, sumValues);

const {
  from,
  fromValues,
  addAt,
  isValidNode,
  assertValidNode,
  getValues,
  getSums,
  setValues,
  traverse,
  getSize,
  findPath,
} = module_;

const getAt = (idx, tags, wrapperIndex) => {
  let result = module_.getAt(idx, tags);
  if (!result || result.type !== PropertyWrapper) return result;
  let wrapperIndex_ = wrapperIndex < 0 ? result.value.tags.length + wrapperIndex : wrapperIndex;
  return wrapperIndex == null ? result : result.value.tags[wrapperIndex_];
};

const push = (tags, tag) => {
  let firstTag = getAt(0, tags);

  if (
    !Array.isArray(tag) &&
    ![OpenNodeTag, PropertyWrapper, CloseNodeTag, AttributeDefinition, LiteralTag, GapTag].includes(
      tag.type,
    )
  )
    throw new Error();

  if (isArray(tag)) {
    if (!firstTag || firstTag.type !== OpenNodeTag) {
      return module_.concat(tags, tag);
    }
    let children = getValues(tags)[1] ?? module_.fromValues([]);

    let { 0: open } = getValues(tags);

    children = module_.concat(children, tag);

    return module_.fromValues([open, children]);
  } else {
    if (tag.type === OpenNodeTag) {
      if (getSize(tags) !== 0) throw new Error();
      return module_.push(tags, tag);
    } else {
      if (!firstTag || firstTag.type !== OpenNodeTag) {
        return module_.push(tags, tag);
      }

      let children = getValues(tags)[1] ?? [];

      // sometimes this is the top level
      if (firstTag) {
        if (tag.type === CloseNodeTag) {
          let { 0: open, 1: children = module_.fromValues([]) } = getValues(tags);

          return module_.fromValues([open, children, tag]);
        } else {
          let { 0: open } = getValues(tags);

          children = module_.push(children, tag);

          return module_.fromValues([open, children]);
        }
      } else {
        return module_.push(tags, tag);
      }
    }
  }
};

const replaceAt = (idx, tree, value) => {
  let idx_ = idx < 0 ? getSize(tree) + idx : idx;

  if (value.type !== getAt(idx_, tree).type) throw new Error();
  let firstTag = getAt(0, tree);

  if (firstTag && firstTag.type === OpenNodeTag) {
    let newTags = [...getValues(tree)];
    if (idx_ === 0) {
      newTags[0] = value;
    } else if (isObject(value) && value.type === CloseNodeTag) {
      if (idx_ !== getSize(tree) - 1) throw new Error();
      newTags[2] = value;
    } else {
      let children = getValues(tree)[1];

      children = module_.replaceAt(idx_ - 1, children, value);

      newTags[1] = children;
    }
    return module_.fromValues(newTags);
  } else {
    return module_.replaceAt(idx_, tree, value);
  }
};

const removeAt = (idx, tree) => {
  let idx_ = idx < 0 ? getSize(tree) + idx : idx;

  let firstTag = getAt(0, tree);

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
  for (let tag of module_.traverse(tree)) {
    if (tag.type === PropertyWrapper) {
      yield* tag.value.tags;
    } else {
      yield tag;
    }
  }
}

export {
  from,
  fromValues,
  push,
  addAt,
  isValidNode,
  assertValidNode,
  getSize,
  getValues,
  getSums,
  setValues,
  traverse,
  traverseInner,
  findPath,
  getAt,
  replaceAt,
  removeAt,
};
