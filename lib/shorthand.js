import {
  buildDoctypeTag,
  buildGapTag,
  buildOpenNodeTag,
  buildCloseNodeTag,
  buildLiteralTag,
  buildInitializerTag,
} from './builders.js';
import { parseReference, treeFromStreamSync } from './tree.js';

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
  return parseReference(isArray(path) ? path[0] : path);
};

export const lit = (str) => buildLiteralTag(stripArray(str));

export const doctype = buildDoctypeTag;
export const gap = buildGapTag;
export const arr = () => buildInitializerTag(true);
export const nodeOpen = buildOpenNodeTag;
export const nodeClose = buildCloseNodeTag;
export const tree = (...tags) => treeFromStreamSync(tags);
