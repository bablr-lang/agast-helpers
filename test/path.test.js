import { Path, TagPath } from '@bablr/agast-helpers/path';
import {
  buildOpenNodeTag,
  buildCloseNodeTag,
  buildReferenceTag,
  buildGapTag,
  buildBindingTag,
  nodeFlags,
  treeFromStreamSync as treeFromStream,
  printTag,
  coverFlags,
  buildBinding,
  printPrettyCSTML,
  buildDoctypeTag,
} from '@bablr/agast-helpers/tree';
import { dedent } from '@qnighy/dedent';

import { expect } from 'expect';

let tags = [
  buildOpenNodeTag(coverFlags),
  buildReferenceTag('_'),
  buildBindingTag(['a']),
  buildOpenNodeTag(nodeFlags, 'Node'),
  buildReferenceTag(null, 'inner'),
  buildBindingTag(['b']),
  buildOpenNodeTag(nodeFlags, 'InnerNode'),
  buildCloseNodeTag(),
  buildReferenceTag(null, 'gap'),
  buildBindingTag(['c']),
  buildGapTag(),
  buildCloseNodeTag(),
  buildCloseNodeTag(),
];
let node;

describe('Path', () => {
  before(() => {
    node = treeFromStream(tags);
  });

  describe('replaceAt', () => {
    it('works', () => {
      let doc = treeFromStream([
        buildDoctypeTag(),
        buildOpenNodeTag(coverFlags),
        buildReferenceTag('_'),
        buildOpenNodeTag(nodeFlags, 'Foo'),
        buildReferenceTag(null, 'bar'),
        buildOpenNodeTag(nodeFlags, 'Bar'),
        buildReferenceTag(null, 'baz'),
        buildOpenNodeTag(nodeFlags, 'Baz'),
        buildCloseNodeTag(),
        buildCloseNodeTag(),
        buildCloseNodeTag(),
        buildCloseNodeTag(),
      ]);

      let newPath = Path.from(doc).replaceAt(
        ['bar', 'baz'],
        treeFromStream([buildOpenNodeTag(nodeFlags, 'Fuzz'), buildCloseNodeTag()]),
        buildBinding(['MOO']),
      );

      expect(printPrettyCSTML(newPath.node)).toEqual(dedent`\
        <Foo>
          bar:
          <Bar>
            baz: :MOO: <Fuzz />
          </>
        </>\n`);
    });
  });
});

describe('TagPath', () => {
  let path;
  before(() => {
    node = treeFromStream(tags);
    path = Path.from(node);
  });

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
