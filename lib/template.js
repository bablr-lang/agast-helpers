import { parseTag, parseTagType } from 'agast';
import { isObject } from './object.js';

import { isMultiFragment, isNode, Path } from './path.js';
import { OpenNodeTag, CloseNodeTag, DoctypeTag, Property, GapNode, TreeNode } from './symbols.js';
import * as Tags from './tags.js';
import { getOpenTag, isNull } from './tree.js';

const { freeze } = Object;

export const interpolate = (expressions, node) => {
  if (!isNode(node)) throw new Error();

  let path = Path.from(node);

  outer: for (let expression of expressions) {
    let i = 0;
    do {
      path = path.atDepth(0);
      let tag;
      while ((tag = Tags.getAt(i, path.node)) != null) {
        tag = parseTag(tag);
        if (path.node.type === GapNode) {
          path = path.replaceWith(expression ?? Tags.from('null '));
          continue outer;
        } else if (isObject(tag) && tag.type === Property && tag.value[4]) {
          let node_ = parseTag(tag.value[4]);
          if (node_.type === GapNode || (node_.type === TreeNode && Tags.countGaps(node_))) {
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

  let fragRef = ref;

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
          let { 0: ref, 1: bindings, 4: node } = tag.value;
          const { type } = parseTag(ref).value;

          // don't I elsewhere forbid this?
          if (type === '_') {
            // TODO check/combine flags
            yield fragRef;
          } else {
            yield ref;
          }

          yield* Tags.traverse(bindings);

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
