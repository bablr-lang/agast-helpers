import * as t from './builders.js';
import { isObject } from './object.js';
import { parseTag, parseTagType } from './parsers.js';
import { buildNullNode, isMultiFragment, isNode, Path } from './path.js';
import { OpenNodeTag, CloseNodeTag, DoctypeTag, Property, GapNode, TreeNode } from './symbols.js';
import * as Tags from './tags.js';
import { getOpenTag, isNull } from './tree.js';

const { freeze } = Object;

export const buildFilledGapFunction = (expressions) => (value) => {
  expressions.push(value);
  return t.buildGapTag();
};

export const interpolate = (expressions, node) => {
  if (!isNode(node)) throw new Error();

  let path = Path.from(node);

  outer: for (let expression of expressions) {
    let i = 0;
    do {
      path = path.atDepth(0);
      let tag;
      while ((tag = Tags.getAt(i, Tags.getTags(path.node))) !== undefined) {
        if (path.node.type === GapNode) {
          path = path.replaceWith(expression ?? buildNullNode());
          continue outer;
        } else if (isObject(tag) && tag.type === Property && tag.value.tags[1][3]) {
          let node_ = tag.value.tags[1][3];
          if (node_.type === GapNode || (node_.type === TreeNode && node_.value.children[2][4])) {
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

export const interpolateFragment = (node, ref) => {
  return __interpolateFragment(node, ref);
};

function* __interpolateFragment(node, ref) {
  if (isNull(node)) return;

  const open = parseTag(getOpenTag(node));

  if (!open.value.name) {
    let isMultiFragment_ = isMultiFragment(node);
    for (let tag of Tags.traverse(Tags.getTags(node))) {
      switch (parseTagType(tag)) {
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

          // don't I elsewhere forbid this?
          if (type === '_') {
            // TODO check/combine flags
            yield ref;
          } else {
            yield tags[1][0];
          }

          yield* Tags.traverse(tags[1][1]);

          yield node;

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
    yield node;
  } else {
    throw new Error();
  }
}
