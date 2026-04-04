import { buildModule, defaultNodeSize } from '@bablr/btree/enhanceable';
import {
  ReferenceTag,
  AttributeDefinition,
  CloseNodeTag,
  GapTag,
  LiteralTag,
  NullTag,
  OpenNodeTag,
  Property,
  ShiftTag,
  DoctypeTag,
  TreeNode,
  GapNode,
  NullNode,
  BindingTag,
  Document,
} from './symbols.js';
import { isObject, isString } from './object.js';
import { buildReference } from './builders.js';

const { isArray } = Array;
const { freeze, isFrozen, isDeepFrozen, hasOwn } = Object;

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

export const isValidLiteral = (value) => {
  if (!isString(value)) return false;

  return true;
};

export const isValidReference = (value) => {
  if (!value || !isFrozen(value)) return false;
  if (!hasOwn(value, 'type') || !hasOwn(value, 'name') || !hasOwn(value, 'flags')) return false;

  if (!isValidReferenceFlags(value.flags)) return false;

  return true;
};

export const isValidBinding = (value) => {
  if (!value || !isFrozen(value)) return false;
  if (!hasOwn(value, 'segments')) return false;

  if (!isArray(value.segments)) return false;
  if (!isFrozen(value.segments)) return false;
  for (let segment of value.segments) {
    if (!isFrozen(segment)) return false;
  }

  return true;
};

export const isValidDoctype = (value) => {
  if (!value || !isFrozen(value)) return false;
  if (!hasOwn(value, 'doctype') || !hasOwn(value, 'version') || !hasOwn(value, 'attributes'))
    return false;

  if (!isDeepFrozen(value.attributes)) return false;

  if (value.doctype !== 'cstml') return false;

  return true;
};

export const isValidAttributeDefinition = (value) => {
  if (!value || !isFrozen(value)) return false;
  if (!hasOwn(value, 'path') || !hasOwn(value, 'value')) return false;

  if (!isDeepFrozen(value.value)) return false;

  return true;
};

export const isValidReferenceFlags = (value) => {
  if (!value || !isFrozen(value)) return false;
  if (
    !hasOwn(value, 'array') ||
    !hasOwn(value, 'expression') ||
    !hasOwn(value, 'intrinsic') ||
    !hasOwn(value, 'hasGap')
  )
    return false;

  return true;
};

export const isValidNodeFlags = (value) => {
  if (!value || !isFrozen(value)) return false;
  if (!hasOwn(value, 'token') || !hasOwn(value, 'hasGap')) return false;
  return true;
};

export const isValidOpenNode = (value) => {
  if (!value || !isFrozen(value)) return false;
  if (
    !hasOwn(value, 'flags') ||
    !hasOwn(value, 'name') ||
    !hasOwn(value, 'type') ||
    !hasOwn(value, 'literalValue') ||
    !hasOwn(value, 'attributes') ||
    !hasOwn(value, 'selfClosing')
  )
    return false;

  if (!isValidNodeFlags(value.flags)) return false;

  if (!isDeepFrozen(value.attributes)) return false;

  return true;
};

export const isValidProperty = (value) => {
  if (!value || !isFrozen(value)) return false;
  if (
    !hasOwn(value, 'bindings') ||
    !hasOwn(value, 'node') ||
    !hasOwn(value, 'reference') ||
    !hasOwn(value, 'shift') ||
    !hasOwn(value, 'tags')
  )
    return false;

  for (let binding of value.bindings) if (!isValidBinding(binding)) throw new Error();
  if (value.reference && !isValidReference(value.reference)) throw new Error();
  // if (value.node && !isValidNodeTag(value.node)) throw new Error();
  return true;
};

export const isValidTag = (tag) => {
  if (!isFrozen(tag)) return false;
  if (!hasOwn(tag, 'type') || !hasOwn(tag, 'value')) return false;

  switch (tag.type) {
    case ReferenceTag:
      return isValidReference(tag.value);
    case OpenNodeTag:
      return isValidOpenNode(tag.value);
    case AttributeDefinition:
      return isValidAttributeDefinition(tag.value);
    case CloseNodeTag:
    case ShiftTag:
    case NullTag:
    case GapTag:
      return true;
    case LiteralTag:
      return isValidLiteral(tag.value);
    case BindingTag:
      return isValidBinding(tag.value);
    case Property:
      return isValidProperty(tag.value);
    case TreeNode:
    case GapNode:
    case NullNode:
      return false;
    case DoctypeTag:
      return isValidDoctype(tag.value);
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

export const getPropertyTagsIndex = (agAstNode, type, name, index, shiftIndex) => {
  let firstPropsIndex = __getPropertyTagsIndex(agAstNode, type, name, 0);
  let prop = firstPropsIndex == null ? null : getAt(firstPropsIndex, getTags(agAstNode));
  let ref = prop?.value.reference;
  let sums = getSums(agAstNode.value.tags);
  let counts = name ? sums.names : sums.types;

  if (ref?.flags.array) {
    if (index < 0) {
      index = findStats(type, counts) + index;
    } else if (index == null) {
      index = findStats(name, counts) - 1;

      if (index < 0) return null;
    }
  }

  let parentIndex = __getPropertyTagsIndex(agAstNode, type, name, index ?? 0);

  if (parentIndex != null && ref?.flags.expression) {
    let shiftIndex_ = shiftIndex == null ? -1 : shiftIndex;
    if (shiftIndex_ < 0) {
      let shifts = 0;
      // TODO speed this up for deeply nested shifts
      // algorithm: make big jump forward, then look at shift index to see if we overshot completely
      // works because we know the size of the thing and a bigger thing doesn't fit in a smaller one
      while (getAt(parentIndex + shifts, agAstNode.value.children)?.value.shift) {
        shifts++;
      }

      if (-shiftIndex_ > shifts + 1) return null;

      return parentIndex + shifts + shiftIndex_ + 1;
    } else {
      if (parentIndex + shiftIndex_ >= getSize(agAstNode.value.tags)) {
        return null;
      }

      return parentIndex + shiftIndex_;
    }
  }

  return parentIndex;
};

const __getPropertyTagsIndex = (agAstNode, type, name, index) => {
  let nameCount = 0;
  let node = getValues(agAstNode.value.tags)[1];
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
        if (tag.type === Property) {
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
        if (val.type === LiteralTag) {
          let text = val.value;
          let idx = 0;
          while ((idx = text.indexOf('\n', idx + 1)) >= 0) {
            acc.lineBreaks++;
          }
        } else if (val.type === GapTag) {
          acc.gaps++;
        } else if (val.type === Property) {
          let { tags } = val.value;
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
  let firstTag = getAt(0, tags);

  if (
    isLeaf(tag) &&
    ![
      OpenNodeTag,
      Property,
      CloseNodeTag,
      AttributeDefinition,
      BindingTag,
      LiteralTag,
      GapTag,
    ].includes(tag.type)
  )
    throw new Error();

  if (isNode(tag)) {
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
      return module_.push(tag, tags);
    } else {
      if (!firstTag || firstTag.type !== OpenNodeTag) {
        return module_.push(tag, tags);
      }

      let children = getValues(tags)[1] ?? module_.fromValues([]);

      // sometimes this is the top level
      if (firstTag) {
        if (tag.type === CloseNodeTag) {
          let { 0: open, 1: children = module_.fromValues([]) } = getValues(tags);

          return module_.fromValues([open, children, tag]);
        } else {
          let { 0: open } = getValues(tags);

          children = module_.push(tag, children);

          return module_.fromValues([open, children]);
        }
      } else {
        return module_.push(tag, tags);
      }
    }
  }
};

const replaceAt = (idx, value, tree) => {
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

      children = module_.replaceAt(idx_ - 1, value, children);

      newTags[1] = children;
    }
    return module_.fromValues(newTags);
  } else {
    return module_.replaceAt(idx_, value, tree);
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
    if (tag.type === Property) {
      yield* module_.traverse(tag.value.tags);
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
