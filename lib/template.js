import * as t from './builders.js';

const { isArray } = Array;
const { freeze } = Object;

export const interpolateArray = (value) => {
  if (isArray(value)) {
    return value;
  } else {
    return [value];
  }
};

export const interpolateArrayChildren = (value, ref, sep) => {
  if (isArray(value)) {
    const values = value;
    const children = [];
    let first = true;
    for (const _ of values) {
      if (!first) children.push(freeze({ ...sep }));
      children.push(freeze({ ...ref }));
      first = false;
    }
    return children;
  } else {
    return [freeze({ ...ref })];
  }
};

const validateTerminal = (term) => {
  if (!term || (term.type !== 'Literal' && term.type !== 'Embedded')) {
    throw new Error('Invalid terminal');
  }
  if (term.type === 'Embedded' && !term.value.flags.escape) {
    throw new Error();
  }
};

export const interpolateString = (value) => {
  const children = [];
  if (isArray(value)) {
    for (const element of value) {
      validateTerminal(element);

      children.push(element);
    }
  } else {
    // we can't safely interpolate strings here, though I wish we could
    validateTerminal(value);
    children.push(value);
  }

  return t.buildNode('String', 'Content', children);
};
