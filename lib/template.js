import * as t from './builders.js';
import { getTags, isMultiFragment, Path } from './path.js';
import { OpenNodeTag, CloseNodeTag, DoctypeTag, Property, GapNode } from './symbols.js';
import * as Tags from './tags.js';
import { getOpenTag, isNull } from './tree.js';

const { freeze } = Object;

export const buildFilledGapFunction = (expressions) => (value) => {
  expressions.push(value);
  return t.buildGapTag();
};

export const interpolate = (node, expressions) => {
  let path = Path.from(node);

  outer: for (let expression of expressions) {
    let i = 0;
    do {
      path = path.atDepth(0);
      let tag;
      while ((tag = Tags.getAt(i, getTags(path.node)))) {
        if (path.node.type === GapNode) {
          path = path.replaceWith(expression);
          continue outer;
        } else if (tag.type === Property && tag.value.tags[2]) {
          let tags = getTags(tag.value.tags[2]);
          if (tags[2].gaps) {
            path = path.push(i);
            i = 0;
            continue;
          }
        }
        i++;
      }
      i = path.parent?.tagsIndex + 1;
      path = path.parent;
    } while (path.depth);
  }

  return path.atDepth(0).node;
};

export const interpolateFragment = (node, ref, expressions) => {
  return __interpolateFragment(node, ref, expressions);
};

function* __interpolateFragment(node, ref, expressions) {
  if (isNull(node)) return;

  const open = getOpenTag(node);

  const gap = buildFilledGapFunction(expressions);

  if (!open.value.name) {
    let isMultiFragment_ = isMultiFragment(node);
    for (let tag of Tags.traverse(getTags(node))) {
      switch (tag.type) {
        case DoctypeTag: {
          break;
        }
        case OpenNodeTag:
        case CloseNodeTag: {
          if (!isMultiFragment_) {
            yield tag;
          }
          break;
        }

        case Property: {
          let { reference, node, tags } = tag.value;
          const { type } = reference;

          if (type === '_') {
            // TODO check/combine flags
            yield ref;
          } else {
            yield tags[0];
          }

          yield* tags[1];

          yield gap(node);

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
