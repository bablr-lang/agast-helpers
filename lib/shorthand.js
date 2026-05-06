import {
  buildDoctypeTag,
  buildGapTag,
  buildOpenNodeTag,
  buildCloseTag,
  buildLiteralTag,
  buildOpenFragmentTag,
  buildOpenCoverTag,
  parseReferenceTag,
} from './builders.js';
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
export const nodeClose = buildCloseTag;
export const tree = (...tags) => treeFromStream(tags);
