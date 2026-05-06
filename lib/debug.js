import { TagPath } from '@bablr/agast-helpers/path';
import { printTag } from '@bablr/agast-helpers/print';
import { CloseTag, LiteralTag, OpenNodeTag } from '@bablr/agast-helpers/symbols';

export { printTag };

export const printTree = (tree) => {
  let printed = '';
  let unshift = false;
  let tagPath = TagPath.fromNode(tree, 0);

  let count = 0;

  do {
    if (tagPath.type === CloseTag) count--;

    printed += '\n' + '  '.repeat(count) + printTag(tagPath.tag);

    if (tagPath.type === OpenNodeTag && !tagPath.value.selfClosing) count++;
  } while ((tagPath = unshift ? tagPath.nextUnshifted : tagPath.next));

  return printed;
};

export const printTreeSource = (tree) => {
  let printed = '';
  let unshift = false;
  let tagPath = TagPath.fromNode(tree, 0);

  do {
    if (tagPath.type === LiteralTag) {
      printed += tagPath.value;
    } else if (tagPath.type === OpenNodeTag && tagPath.value.literalValue) {
      printed += tagPath.value.literalValue;
    }
  } while ((tagPath = unshift ? tagPath.nextUnshifted : tagPath.next));

  return printed;
};
