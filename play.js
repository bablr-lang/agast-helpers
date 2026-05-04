import '@bablr/agast-helpers/debug/register';
import { Path } from '@bablr/agast-helpers/path';
import {
  buildOpenNodeTag,
  buildReferenceTag,
  nodeFlags,
  buildOpenCoverTag,
  buildShiftTag,
  tokenFlags,
  treeFromStream,
  streamFromTree,
} from '@bablr/agast-helpers/tree';

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
