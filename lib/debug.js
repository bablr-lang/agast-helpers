import { isNode, TagPath } from './path.js';
import { printTag } from './print.js';
import {
  AttributeDefinition,
  CloseNodeTag,
  EmptyTag,
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
import { parseTag, parseTagType } from './parsers.js';

export { printTag };

export const printTree = (tree) => {
  let printed = '';
  let shifted = false;
  let indent = 0;
  let lastProp = null;
  let lastRef = null;
  let node = tree;
  let i = -1;
  let ni = -1;
  let stack = [{ node, i, ni }];

  while (stack.length) {
    ({ node, i, ni } = stack.pop());
    i++;
    ni++;

    while (node && i < Tags.getValues(isArray(node) ? node : node.value.tags).length) {
      let value = Tags.getValues(isArray(node) ? node : node.value.tags)[i];

      if (isArray(node) && i === 0) {
        printed +=
          '\n' +
          '  '.repeat(indent) +
          `##${Tags.getSums(node).gearHash.toString(16).padStart(4, '0')}##`;
        printed += '\n' + '  '.repeat(indent) + '<__>';
        indent++;
      }

      if (isArray(value)) {
        if (Tags.getSize(value)) {
          stack.push({ node, i, ni });
          node = value;
          i = 0;
        } else {
          i++;
        }
        continue;
      } else if (value === '') {
        i++;
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
            if (propTag.type !== EmptyTag) {
              printed += '\n' + '  '.repeat(indent) + propTag_;
            }
          }
        }

        if (
          i === 0 &&
          shifted &&
          tag.value.shift?.index !== shifted.index &&
          lastRef.value.flags.hasGap
        ) {
          shifted = false;
          printed += '\n' + '  '.repeat(indent) + '<//>';
        } else {
          stack.push({ node, i, ni });
          node = node_;
          i = 0;
          ni = 0;
          continue;
        }
      }
      if (tag.type === CloseNodeTag) {
        indent--;
        printed += '\n' + '  '.repeat(indent) + value;
      }

      if (tag.type === OpenNodeTag) {
        printed += '\n' + '  '.repeat(indent) + value;
        if (!tag.value.selfClosing) indent++;
      }

      if ([LiteralTag, AttributeDefinition, NullTag, GapTag].includes(tag.type)) {
        printed += '\n' + '  '.repeat(indent) + value;
      }

      i++;
      ni++;
    }

    if (isArray(node)) {
      indent--;
      printed += '\n' + '  '.repeat(Math.max(0, indent)) + '</>';
    }
  }

  return printed.slice(1);
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
