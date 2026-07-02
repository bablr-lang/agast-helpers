import * as Tags from '@bablr/agast-helpers/tags';
import { printTree } from '@bablr/agast-helpers/debug';
import { dedent } from '@qnighy/dedent';

import { expect } from 'expect';

describe('Tags', () => {
  describe('__splice', () => {
    it('works', () => {
      let tree = Tags.fromValues([Tags.empty()]);

      tree = Tags.push('"fadd"', tree);
      tree = Tags.push('"boof"', tree); // brew
      tree = Tags.push('"neftdli"', tree);
      tree = Tags.push('"grg"', tree);

      // Tags.__splice();
    });
  });
});
