/* global console printTree */

import '@bablr/agast-helpers/debug/register';
import * as Tags from '@bablr/agast-helpers/tags';

let result = Tags.fromValues([Tags.empty()]);

result = Tags.push('<__>', result);
result = Tags.push('"fad"', result);
// result = Tags.push('"borg"', result);
result = Tags.push('"neftli"', result);
result = Tags.push('"grong"', result);
result = Tags.push('</>', result);

result = Tags.removeAt([2, 0, 1], result);
// result = Tags.removeAt([2, 1], result);

debugger;

// path = path.advance('ref:');
