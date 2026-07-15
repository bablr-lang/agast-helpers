import {
  buildDoctypeTag,
  buildGapTag,
  buildOpenNodeTag,
  buildCloseNodeTag,
  buildLiteralTag,
  buildOpenFragmentTag,
  buildOpenCoverTag,
} from './builders.js';
import { parseReferenceTag } from './parsers.js';
import { treeFromStream } from './tree.js';

export * from './builders.js';

const { isArray } = Array;

const stripArray = (val) => {
  if (isArray(val)) {
    if (val.length > 1) {
      throw new Error();
    }
    return val[0];
  } else {
    return val;
  }
};

export const ref = (path) => {
  return parseReferenceTag(isArray(path) ? path[0] : path);
};

export const lit = (str) => buildLiteralTag(stripArray(str));

export const doctype = buildDoctypeTag;
export const gap = buildGapTag;
export const nodeOpen = buildOpenNodeTag;
export const fragOpen = buildOpenFragmentTag;
export const coverOpen = buildOpenCoverTag;
export const nodeClose = buildCloseNodeTag;
export const tree = (...tags) => treeFromStream(tags);
