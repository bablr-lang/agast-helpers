import '@bablr/deep-freeze/register';
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
  printPrettyCSTML,
  buildDoctypeTag,
  buildOpenCoverTag,
  buildShiftTag,
  tokenFlags,
} from '@bablr/agast-helpers/tree';
import { ReferenceTag } from '@bablr/agast-helpers/symbols';
import { dedent } from '@qnighy/dedent';

import { expect } from 'expect';

const { freeze } = Object;

let tags = [
  buildOpenCoverTag(nodeFlags),
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
        buildOpenCoverTag(),
        buildReferenceTag('_'),
        buildOpenNodeTag(nodeFlags, 'Foo'),
        buildReferenceTag(null, 'bar'),
        buildBindingTag(['OK']),
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
        [buildBindingTag(['MOO'])],
      );

      expect(printPrettyCSTML(newPath.node)).toEqual(dedent`\
        <_>
          _:
          <Foo>
            bar: :OK:
            <Bar>
              baz: :MOO: <Fuzz />
            </>
          </>
        </>\n`);
    });
  });

  describe('advance', () => {
    it('forbids $ and $ together as they are mutually exclusive', () => {
      expect(() => {
        Path.fromTag(buildOpenNodeTag(nodeFlags, 'Node')).advance({
          type: ReferenceTag,
          value: {
            type: null,
            name: 'ref',
            flags: freeze({ array: false, expression: false, intrinsic: true, hasGap: true }),
          },
        });
      }).toThrowError();
    });

    it('forbids #ref[] as # is implicitly multiple', () => {
      expect(() => {
        Path.fromTag(buildOpenNodeTag(nodeFlags, 'Node')).advance({
          type: ReferenceTag,
          value: {
            type: '#',
            flags: freeze({ array: true, expression: false, intrinsic: false, hasGap: false }),
          },
        });
      }).toThrowError();
    });

    it('forbids _ref[] as _ is implicitly single', () => {
      expect(() => {
        Path.fromTag(buildOpenNodeTag(nodeFlags, 'Node')).advance({
          type: ReferenceTag,
          value: {
            type: '_',
            name: null,
            flags: freeze({ array: true, expression: false, intrinsic: false, hasGap: false }),
          },
        });
      }).toThrowError();
    });

    it('forbids .: in <_>', () => {
      expect(() => {
        Path.fromTag(buildOpenCoverTag()).advance(buildReferenceTag('.'));
      }).toThrowError();
    });

    it('forbids ref: in <_>', () => {
      expect(() => {
        Path.fromTag(buildOpenCoverTag()).advance(buildReferenceTag(null, 'ref'));
      }).toThrowError();
    });

    it('forbids shifting node into token', () => {
      expect(() => {
        Path.fromTag(buildOpenCoverTag())
          .advance(buildReferenceTag('_'))
          .advance(buildOpenNodeTag(nodeFlags, 'Node', null, {}, true))
          .advance(buildShiftTag())
          .advance(buildOpenNodeTag(tokenFlags, 'OuterToken'));
      }).toThrowError();
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
