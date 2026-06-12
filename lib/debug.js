import { isNode, TagPath } from './path.js';
import { printTag } from './print.js';
import {
  AttributeDefinition,
  CloseNodeTag,
  GapTag,
  LiteralTag,
  NullTag,
  OpenNodeTag,
  Property,
  ReferenceTag,
  ShiftTag,
} from './symbols.js';
import { isArray, isString } from './object.js';
import * as Tags from './tags.js';
import { parseTag } from './builders.js';

export { printTag };

export const printTree = (tree, indent = 0, shifted_ = null) => {
  let printed = '<__>';
  let shifted = shifted_;
  let count = indent + 1;
  let lastProp = null;
  let lastRef = null;
  let node = isArray(tree) ? tree : Tags.getTags(tree);
  let i = -1;
  let stack = [{ node, i }];

  while (stack.length) {
    ({ node, i } = stack.pop());
    i++;

    while (node && i < Tags.getValues(node).length) {
      let value = Tags.getValues(node)[i];
      if (isArray(value)) {
        stack.push({ node, i });
        node = value;
        i = 0;
        continue;
      }

      let tag = !isString(value) ? value : parseTag(value);

      if (tag.type === Property) {
        let { shift, tags } = tag.value;

        if (lastProp && shift && !shifted) {
          shifted = shift;
        }

        lastProp = tag;

        let node_ = null;
        for (let propTag_ of Tags.traverse(tags)) {
          let propTag = !isString(propTag_) ? propTag_ : parseTag(propTag_);
          if (isNode(propTag)) {
            node_ = propTag;
            break;
          } else {
            if (propTag.type === ReferenceTag) {
              lastRef = propTag;
            }
            printed += '\n' + '  '.repeat(count) + propTag_;
          }
        }

        if (
          i === 0 &&
          shifted &&
          tag.value.shift?.index !== shifted.index &&
          lastRef.value.flags.hasGap
        ) {
          shifted = false;
          printed += '\n' + '  '.repeat(count) + '<//>';
        } else {
          stack.push({ node, i });
          node = Tags.getTags(node_);
          i = 0;
          continue;
        }
      }
      if (tag.type === CloseNodeTag) {
        count--;
        printed += '\n' + '  '.repeat(count) + value;
      }

      if (tag.type === OpenNodeTag) {
        printed += '\n' + '  '.repeat(count) + value;
        if (!tag.value.selfClosing) count++;
      }

      if ([LiteralTag, AttributeDefinition, NullTag, GapTag].includes(tag.type)) {
        printed += '\n' + '  '.repeat(count) + value;
      }

      i++;
    }
  }

  printed += '\n' + '</>';

  return printed;
};

export const printTreeSource = (tree) => {
  let printed = '';
  let unshift = false;
  let tagPath = TagPath.fromNode(tree);

  do {
    if (tagPath.type === LiteralTag) {
      printed += tagPath.value;
    } else if (tagPath.type === OpenNodeTag && tagPath.value.literalValue) {
      printed += tagPath.value.literalValue;
    }
  } while ((tagPath = unshift ? tagPath.nextUnshifted : tagPath.next));

  return printed;
};
