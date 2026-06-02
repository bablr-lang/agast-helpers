import { TagPath } from '@bablr/agast-helpers/path';
import { printTag } from '@bablr/agast-helpers/print';
import { CloseNodeTag, LiteralTag, OpenNodeTag } from '@bablr/agast-helpers/symbols';

export { printTag };

export const printTree = (tree) => {
  let printed = '';
  let unshift = false;
  let tagPath = TagPath.fromNode(tree);

  let count = 0;

  do {
    if (tagPath.type === CloseNodeTag) count--;

    printed += '\n' + '  '.repeat(count) + printTag(tagPath.tag);

    if (tagPath.type === OpenNodeTag && !tagPath.value.selfClosing) count++;
  } while ((tagPath = unshift ? tagPath.nextUnshifted : tagPath.next));

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
