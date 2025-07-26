import { buildModule, defaultNodeSize } from '@bablr/btree/enhanceable';
import {
  BindingTag,
  CloseNodeTag,
  LiteralTag,
  OpenNodeTag,
  PropertyWrapper,
  ReferenceTag,
} from './symbols.js';
import { isObject } from './object.js';

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
      } else if (val.type === PropertyWrapper) {
        let { property } = val.value;
        let { reference } = property;

        const { type, name } = reference;
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
} = module_;

const getAt = (idx, tags, offsetIndex) => {
  let result = module_.getAt(idx, tags);
  return offsetIndex == null ? result : result.value.tags[offsetIndex];
};

const push = (tags, tag) => {
  let firstTag = getAt(0, tags);
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
};
