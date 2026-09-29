import { buildReference } from 'agast';
import { isString, freezeRecord } from './object.js';

export const symbolName = (name) => {
  return isString(name) ? Symbol.for(name) : name;
};

export const buildSpan = (name, guard = null, props = '{}') => {
  if (!name) throw new Error();
  if (!isString(props)) throw new Error();

  return freezeRecord({ name, guard, props });
};

export const buildSpanEntry = (name, guard = null, props = '{}') => {
  return freezeRecord([name, buildSpan(name, guard, props)]);
};

export const buildPathFrame = (property, parentIndex = null, isGap = false) => {
  return freezeRecord({ property, parentIndex, isGap });
};

export const referenceFromMatcher = (matcher) => {
  if (!matcher) return buildReference();
  let { type, name, flags } = matcher;

  return buildReference(type, name, flags);
};

export const buildBounds = (leading, trailing) => {
  return freezeRecord({ leading, trailing });
};
