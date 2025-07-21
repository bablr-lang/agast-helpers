import { buildModule, defaultNodeSize } from '@bablr/btree/enhanceable';
import {
  BindingTag,
  CloseNodeTag,
  InitializerTag,
  LiteralTag,
  OpenNodeTag,
  Property,
  ReferenceTag,
} from './symbols.js';

const { isArray } = Array;
const { freeze } = Object;

export { defaultNodeSize };

const module_ = buildModule(
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
    } else if (val) {
      if (val.type === LiteralTag) {
        let text = val.value;
        let idx = 0;
        while ((idx = text.indexOf('\n', idx + 1)) >= 0) {
          acc.lineBreaks++;
        }
      } else if (val.type === ReferenceTag) {
        const { type, name } = val.value;
        if (name) {
          references[name] = (references[name] ?? 0) + 1;
        } else {
          specialTypes[type] = (specialTypes[type] ?? 0) + 1;
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
  getAt,
} = module_;

const push = (tags, tag) => {
  if (tag.type === OpenNodeTag) {
    if (getSize(tags) !== 0) throw new Error();
    return module_.push(tags, tag);
  } else {
    let firstTag = getAt(0, tags);

    if (!firstTag || firstTag.type !== OpenNodeTag) {
      return module_.push(tags, tag);
    }

    let children = getValues(tags)[1] ?? [];
    let lastChild = getAt(-1, children);

    if (tag.type === Property && lastChild?.type !== BindingTag) {
      throw new Error();
    }

    if (lastChild?.type === ReferenceTag && ![BindingTag, InitializerTag].includes(tag.type)) {
      throw new Error();
    }

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
};

const replaceAt = (idx, tree, value) => {
  if (value.type !== getAt(idx, tree).type) throw new Error();

  return module_.replaceAt(idx, tree, value);
};

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
  findPath,
  getAt,
  replaceAt,
};
