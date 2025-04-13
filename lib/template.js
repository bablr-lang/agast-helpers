import * as t from './builders.js';
import {
  ReferenceTag,
  InitializerTag,
  OpenNodeTag,
  CloseNodeTag,
  DoctypeTag,
  EmbeddedNode,
  GapTag,
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

  const counters = new Map();

  if (!open.value.type) {
    let currentRef = null;
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

        case InitializerTag: {
          const { type, name } = currentRef.value;
          counters.set(name, -1);
          if (type === '.') {
            yield freeze({ ...ref });
          } else {
            yield currentRef;
          }
          yield tag;
          break;
        }

        case GapTag: {
          const { type, name, isArray, flags } = currentRef.value;

          if (type === '.') {
            // TODO check/combine flags
            yield freeze({ ...ref });
          } else {
            yield currentRef;
          }

          const count = counters.get(name) + 1;

          counters.set(name, count);

          let pathDesc = name;

          if (isArray) {
            pathDesc = [name, count];
          }

          yield gap(get(pathDesc, node));

          break;
        }

        case EmbeddedNode: {
          const { type } = currentRef.value;
          if (type === '.') {
            yield ref;
          } else {
            yield currentRef;
          }
          yield gap(tag.value);
          break;
        }

        default: {
          yield tag;
          break;
        }
      }
    }
  } else if (open.type === OpenNodeTag) {
    yield freeze({ ...ref });
    yield gap(get(ref, node));
  } else {
    throw new Error();
  }
}
