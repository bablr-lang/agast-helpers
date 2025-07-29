import * as t from './builders.js';
import {
  ReferenceTag,
  InitializerTag,
  OpenNodeTag,
  CloseNodeTag,
  DoctypeTag,
  Property,
  BindingTag,
} from './symbols.js';
import * as Tags from './tags.js';
import { getOpenTag, isFragmentNode } from './tree.js';

const { freeze } = Object;

export const buildFilledGapFunction = (expressions) => (value) => {
  expressions.push(value);
  return t.buildGapTag();
};

export const interpolateFragment = (node, ref, expressions) => {
  return __interpolateFragment(node, ref, expressions);
};

function* __interpolateFragment(node, ref, expressions) {
  const open = getOpenTag(node);

  const gap = buildFilledGapFunction(expressions);

  if (!open.value.type) {
    let currentRef = null;
    let currentBinding = null;
    let isFragment = isFragmentNode(node);
    for (let tag of Tags.traverseInner(node.tags)) {
      switch (tag.type) {
        case DoctypeTag: {
          break;
        }
        case OpenNodeTag:
        case CloseNodeTag: {
          if (!isFragment) {
            yield tag;
          }
          break;
        }

        case ReferenceTag: {
          currentRef = tag;
          break;
        }

        case BindingTag: {
          currentBinding = tag;
          break;
        }

        case InitializerTag: {
          const { type } = currentRef.value;
          if (type === '.') {
            yield freeze(ref);
          } else {
            yield currentRef;
          }
          yield tag;
          break;
        }

        case Property: {
          let { reference } = tag.value;
          const { type } = reference;

          if (type === '.') {
            // TODO check/combine flags
            yield ref;
          } else {
            yield currentRef;
          }

          yield currentBinding;

          yield gap(tag.value.node);

          break;
        }

        default: {
          yield tag;
          break;
        }
      }
    }
  } else if (open.type === OpenNodeTag) {
    yield freeze(ref);
    yield gap(node);
  } else {
    throw new Error();
  }
}
