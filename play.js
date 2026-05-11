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
import { getStreamIterator, transformStream, wait } from '@bablr/agast-helpers/stream';
import { isObject } from '@bablr/agast-helpers/object';
import { continue_, StreamGenerator } from '@bablr/stream-iterator';

// let doc = treeFromStream([
//   '<!0:cstml>',
//   '<_>',
//   '_:',
//   '<Foo>',
//   'bar:',
//   ':OK:',
//   '<Bar>',
//   'baz:',
//   '<Baz>',
//   '</>',
//   '</>',
//   '</>',
//   '</>',
// ]);

// let newPath = Path.from(doc).removeAt(['bar', 'baz']);

[
  ...transformStream(
    (function* () {
      yield `<One>`;
      yield `</>`;
      yield `<-2>`;
      yield `<Two>`;
      yield `</>`;
      // yield `<-2>`;
      // yield `<Two>`;
      // yield `</>`;
      // yield `<-1>`;
      // yield `<One>`;
      // yield `</>`;
      // yield `<-2>`;
      // yield `<OK />`;
    })(),
    1,
    (tags) =>
      new StreamGenerator(
        (function* (tags) {
          let iter = getStreamIterator(tags);
          let step;
          for (;;) {
            step = iter.next();
            while (step === null) yield continue_(), (step = iter.next());
            if (step instanceof Promise) step = yield wait(step);
            if (step.done) break;

            let tag = step.value;

            if (isObject(tag)) {
              yield* tag;
              continue;
            }
          }
        })(tags),
      ),
  ),
];
