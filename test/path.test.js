import { Path, TagPath } from '@bablr/agast-helpers/path';
import { treeFromStream, printCSTML } from '@bablr/agast-helpers/tree';
import { transformStream } from '@bablr/agast-helpers/stream';
import { isObject } from '@bablr/agast-helpers/object';
import { dedent } from '@qnighy/dedent';

import { expect } from 'expect';

const { freeze } = Object;

let tags = [
  '<_>',
  '_:',
  ':a:',
  '<Node>',
  'inner:',
  ':b:',
  '<InnerNode>',
  '</>',
  // '##ab##',
  'gap:',
  ':c:',
  '<//>',
  '</>',
  '</>',
];
let node;

describe('Path', () => {
  before(() => {
    node = treeFromStream(tags);
  });

  describe('replaceAt', () => {
    it('works', () => {
      let doc = treeFromStream([
        '<!0:cstml>',
        '<_>',
        '_:',
        '<Foo>',
        'bar:',
        ':OK:',
        '<Bar>',
        'baz:',
        '<Baz>',
        '</>',
        '</>',
        '</>',
        '</>',
      ]);

      let newPath = Path.from(doc).replaceAt(['bar', 'baz'], treeFromStream(['<Fuzz>', '</>']), [
        ':MOO:',
      ]);

      expect(printCSTML(newPath.node)).toEqual(dedent`
        <_>
          _:
          <Foo>
            bar: :OK:
            <Bar>
              baz: :MOO: <Fuzz />
            </>
          </>
        </>
      `);
    });
  });

  describe('removeAt', () => {
    it('works', () => {
      let doc = treeFromStream([
        '<!0:cstml>',
        '<_>',
        '_:',
        '<Foo>',
        'bar:',
        ':OK:',
        '<Bar>',
        'baz:',
        '<Baz>',
        '</>',
        '</>',
        '</>',
        '</>',
      ]);

      let newPath = Path.from(doc).removeAt(['bar', 'baz']);

      expect(printCSTML(newPath.node)).toEqual(dedent`
        <_>
          _:
          <Foo>
            bar: :OK: <Bar />
          </>
        </>
      `);
    });
  });

  describe('advance', () => {
    it('forbids * and $ together as they are mutually exclusive', () => {
      expect(() => {
        Path.advance(null, '<Node>').advance('ref*$:');
      }).toThrowError();
    });

    it('forbids #[] as # is implicitly multiple', () => {
      expect(() => {
        Path.advance(null, '<Node>').advance('#[]:');
      }).toThrowError();
    });

    it('forbids _[] as _ is implicitly single', () => {
      expect(() => {
        Path.advance(null, '<Node>').advance('_[]:');
      }).toThrowError();
    });

    it('forbids .: in <_>', () => {
      expect(() => {
        Path.advance(null, '<_>').advance('.:');
      }).toThrowError();
    });

    it('forbids ref: in <_>', () => {
      expect(() => {
        Path.advance(null, '<_>').advance('ref:');
      }).toThrowError();
    });

    it('forbids shifting node into token', () => {
      expect(() => {
        Path.advance(null, '<_>')
          .advance('_:')
          .advance('<Node />')
          .advance('^^^')
          .advance('<*OuterToken>');
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

  describe('tagPath.next', () => {
    it('visits tags in order', () => {
      let tagPath;

      tagPath = TagPath.from(path, 0);

      let i = 0;
      while (tagPath) {
        expect([i, tagPath.tag]).toEqual([i, tags[i++]]);
        tagPath = tagPath.next;
      }
    });
  });
});

describe('treeFromStream', () => {
  it('shifts', () => {
    expect(
      printCSTML(
        treeFromStream([
          '<Statement>',
          'expression:',
          '<^>',
          "<Number '2' />",
          '^^^',
          '<BinaryEpxression>',
          'left: <//>',
          "op: <* '+' />",
          "right: <Number '2' />",
          '</>',
          '</>',
          '</>',
        ]),
      ),
    ).toBe('');
  });
});
