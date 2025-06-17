import { Path, TagPath } from '@bablr/agast-helpers/path';
import {
  buildOpenNodeTag,
  buildCloseNodeTag,
  buildReferenceTag,
  buildGapTag,
  buildBindingTag,
  nodeFlags,
  treeFromStreamSync,
  printTag,
  fragmentFlags,
} from '@bablr/agast-helpers/tree';
import { expect } from 'expect';

let tags = [
  buildOpenNodeTag(fragmentFlags),
  buildReferenceTag('.'),
  buildBindingTag(),
  buildOpenNodeTag(nodeFlags, 'Node'),
  buildReferenceTag(null, 'inner'),
  buildBindingTag(),
  buildOpenNodeTag(nodeFlags, 'InnerNode'),
  buildCloseNodeTag(),
  buildReferenceTag(null, 'gap'),
  buildBindingTag(),
  buildGapTag(),
  buildCloseNodeTag(),
  buildCloseNodeTag(),
];

let node = treeFromStreamSync(tags);

describe('Path', () => {});

describe('TagPath', () => {
  let path = Path.from(node);

  describe('tagPath.nextUnshifted', () => {
    it('visits tags in order', () => {
      let tagPath;

      tagPath = TagPath.from(path, 0);

      let i = 0;
      while (tagPath) {
        expect([i, printTag(tagPath.tag)]).toEqual([i, printTag(tags[i++])]);
        tagPath = tagPath.nextUnshifted;
      }
    });
  });

  describe('tagPath.next', () => {
    it('visits tags in shifted order', () => {
      let tagPath;

      tagPath = TagPath.from(path, 0);

      let i = 0;
      while (tagPath) {
        expect([i, printTag(tagPath.tag)]).toEqual([i, printTag(tags[i++])]);
        tagPath = tagPath.next;
      }
    });
  });
});
