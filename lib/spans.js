import { buildModule, defaultNodeSize } from '@bablr/btree/enhanceable';

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
      const { names } = acc;
      if (isArray(val)) {
        let arr = getSums(val).names;
        let map = names;

        for (const { 0: key, 1: value } of arr) {
          let count = map.get(key)?.[1] ?? 0;

          map.set(key, freeze([key, count + value]));
        }
      } else if (val) {
        let span = val;

        const { name } = span;

        if (name) {
          let count = names.get(name)?.[1] ?? 0;

          names.set(name, freeze([name, count + 1]));
        }
      }
      return acc;
    },
    {
      names: new Map(),
    },
  );

  let stats = {
    names: [...mapStats.names.values()].sort((a, b) => compareNames(a[0], b[0])),
  };
  freeze(stats);
  freeze(stats.names);
  return stats;
};

const module_ = buildModule(defaultNodeSize, sumValues);

const {
  from,
  fromValues,
  push,
  pop,
  addAt,
  isValidNode,
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
} = module_;

const getSpan = (name, spans) => {
  let nameCount = 0;
  let node = spans;
  let idx = -1;
  let index = getAtName(name, getSums(spans).names);

  // drill into subtrees, passing over subtrees with too few references of the desired name
  outer: while (node) {
    let sums = getSums(node);

    if (!sums) return null;

    let valueNameCount = getAtName(name, sums.names);

    if (nameCount + valueNameCount < index) {
      return null;
    }

    for (const value of getValues(node)) {
      if (!isArray(value)) {
        idx++;
        let span = value;

        if (name != null && span.name === name) {
          nameCount += 1;
          if (nameCount === index) {
            return getAt(idx, spans);
          }
        }
      } else {
        let valueSums = getSums(value);
        if (nameCount + getAtName(name, valueSums.names) > index) {
          node = value;
          continue outer;
        } else {
          nameCount += getAtName(name, valueSums.names) ?? 0;
          idx += getSize(value);
        }
      }
    }

    return null;
  }

  return null;
};

export {
  from,
  fromValues,
  push,
  pop,
  addAt,
  isValidNode,
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
  getSpan,
};
