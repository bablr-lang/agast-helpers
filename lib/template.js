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
import * as sumtree from './sumtree.js';
import { getOpenTag, get, isFragmentNode } from './tree.js';

const { freeze } = Object;

export const buildFilledGapFunction = (expressions) => (value) => {
  expressions.push(value);
  return t.buildGapTag();
};

export function* interpolateFragment(node, ref, expressions) {
  const open = getOpenTag(node);

  if (node.type !== null) throw new Error();

  const gap = buildFilledGapFunction(expressions);

  if (!open.value.type) {
    let currentRef = null;
    let currentBinding = null;
    let isFragment = isFragmentNode(node);
    for (let tag of sumtree.traverse(node.children)) {
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
            yield freeze(ref);
            yield currentBinding;
          } else {
            yield currentRef;
            yield currentBinding;
          }

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
    yield gap(get(ref, node));
  } else {
    throw new Error();
  }
}
