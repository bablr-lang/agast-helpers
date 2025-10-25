import {
  buildDoctypeTag,
  buildGapTag,
  buildOpenNodeTag,
  buildCloseNodeTag,
  buildLiteralTag,
} from './builders.js';
import { buildReferenceTag, treeFromStreamSync } from './tree.js';

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

export const parseReference = (str) => {
  let {
    1: type,
    2: name,
    3: isArray,
    4: index,
    5: expressionToken,
    6: intrinsicToken,
  } = /^\s*(?:([.#@_])|#?([a-zA-Z\u{80}-\u{10ffff}][a-zA-Z0-9_\u{80}-\u{10ffff}-]*))\s*(\[\s*(\d+\s*)?\])?\s*(\+)?(%)?\s*$/u.exec(
    str,
  );

  let flags = {
    expression: !!expressionToken,
    intrinsic: !!intrinsicToken,
  };

  index = index ? parseInt(index, 10) : null;
  isArray = !!isArray;
  type = type || null;
  name = name || null;

  return buildReferenceTag(type, name, isArray, flags, index);
};

export const ref = (path) => {
  return parseReference(isArray(path) ? path[0] : path);
};

export const lit = (str) => buildLiteralTag(stripArray(str));

export const doctype = buildDoctypeTag;
export const gap = buildGapTag;
export const nodeOpen = buildOpenNodeTag;
export const nodeClose = buildCloseNodeTag;
export const tree = (...tags) => treeFromStreamSync(tags);
