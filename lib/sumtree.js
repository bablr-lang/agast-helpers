import { buildModule, defaultNodeSize } from '@bablr/btree/enhanceable';
import { LiteralTag, ReferenceTag } from './symbols.js';

const { isArray } = Array;
const { freeze } = Object;

export { defaultNodeSize };

export const {
  btreeFrom: sumTreeFrom,
  from,
  btreeFromValues: sumTreeFromValues,
  fromValues,
  findBalancePoint,
  splitValues,
  collapses,
  nodeCollapses,
  nodeCanDonate,
  pop,
  push,
  addAt,
  isValidNode,
  assertValidNode,
  getValues,
  getSums,
  setValues,
  isLeafNode,
  traverse,
  getSize,
  findPath,
  getAt,
  replaceAt,
} = buildModule(
  defaultNodeSize,
  (acc, val) => {
    const { references, specialTypes } = acc;
    if (isArray(val)) {
      acc.lineBreaks += val[2].lineBreaks;
      for (const { 0: key, 1: value } of Object.entries(val[2].references)) {
        references[key] = (references[key] ?? 0) + value;
      }

      for (const { 0: key, 1: value } of Object.entries(val[2].specialTypes)) {
        specialTypes[key] = (specialTypes[key] ?? 0) + value;
      }
    } else {
      if (val.type === LiteralTag) {
        let text = val.value;
        let idx = 0;
        while ((idx = text.indexOf('\n', idx + 1)) >= 0) {
          acc.lineBreaks++;
        }
      } else if (val.type === ReferenceTag) {
        const { type, name } = val.value;
        if (type) {
          specialTypes[type] = (specialTypes[type] ?? 0) + 1;
        } else {
          references[name] = (references[name] ?? 0) + 1;
        }
      }
    }
    return acc;
  },
  () => ({
    lineBreaks: 0,
    references: {},
    specialTypes: {},
  }),
  (stats) => {
    freeze(stats);
    freeze(stats.references);
  },
);
