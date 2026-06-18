import * as Tags from '@bablr/agast-helpers/tags';
import { printTree } from '@bablr/agast-helpers/debug';
import { dedent } from '@qnighy/dedent';

import { expect } from 'expect';

describe('Tags', () => {
  describe('removeAt', () => {
    it('removes the only element from a node', () => {
      let tree = Tags.fromValues([Tags.empty()]);

      tree = Tags.push('<__>', tree);
      tree = Tags.push('"fad"', tree);
      tree = Tags.push('"neftli"', tree);
      tree = Tags.push('"abaddsz"', tree);
      tree = Tags.push('</>', tree);

      let expected = dedent`\
        ##7273##
        <__>
          <__>
            ##5201##
            <__>
              "fad"
              "abaddsz"
            </>
          </>
        </>`;

      expect(printTree(Tags.removeAt([2, 1, 0], tree))).toEqual(expected);
      expect(printTree(Tags.removeAt([2, 1], tree))).toEqual(expected);
    });

    describe('when a post-removal join is required', () => {
      it('removes an element that begins a node', () => {
        let tree = Tags.fromValues([Tags.empty()]);

        tree = Tags.push('<__>', tree);
        tree = Tags.push('"fad"', tree);
        tree = Tags.push('"neftli"', tree);
        tree = Tags.push('"grong"', tree);
        tree = Tags.push('</>', tree);

        let expected = dedent`\
        ##ea31##
        <__>
          <__>
            ##b2dc##
            <__>
              "fad"
              "grong"
            </>
          </>
        </>`;

        expect(printTree(Tags.removeAt([2, 1, 0], tree))).toEqual(expected);
      });

      it('removes an element that ends a node', () => {
        let tree = Tags.fromValues([Tags.empty()]);

        tree = Tags.push('<__>', tree);
        tree = Tags.push('"fad"', tree);
        tree = Tags.push('"borg"', tree);
        tree = Tags.push('"neftli"', tree);
        tree = Tags.push('"grong"', tree);
        tree = Tags.push('</>', tree);

        let expected = dedent`\
      `;

        expect(printTree(Tags.removeAt([2, 0, 1], tree))).toEqual(expected);
      });

      it('removes an element from the middle of a node', () => {
        let tree = Tags.fromValues([Tags.empty()]);

        tree = Tags.push('<__>', tree);
        tree = Tags.push('"fad"', tree);
        tree = Tags.push('"b"', tree);
        tree = Tags.push('"neftli"', tree);
        tree = Tags.push('"grong"', tree);
        tree = Tags.push('</>', tree);

        let expected = dedent`\
      `;

        expect(printTree(Tags.removeAt([2, 1], tree))).toEqual(expected);
      });
    });

    describe('when a post-removal join is not required', () => {
      it('removes an element that ends a node', () => {
        let expected = dedent`\
      `;

        expect(printTree(Tags.removeAt([2, 1, 0], tree))).toEqual(expected);
      });

      it('removes an element from the middle of a node', () => {
        let expected = dedent`\
      `;

        expect(printTree(Tags.removeAt([2, 1, 0], tree))).toEqual(expected);
      });
    });
  });
});
