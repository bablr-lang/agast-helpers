import { wrap } from './iterable.js';

export const { hasOwn, freeze, isFrozen, seal, isSealed, getPrototypeOf, getOwnPropertySymbols } =
  Object;
export const { isArray } = Array;

export { deepFreezeRecord, isDeepRecord, isRecord, recordValues } from '@bablr/record';

let { setPrototypeOf } = Object;

export const freezeRecord = (obj) => {
  setPrototypeOf(obj, null);
  freeze(obj);
  return obj;
};

export const freezeClass = (constructor) => {
  freeze(constructor);
  freeze(constructor.prototype);
  return constructor;
};

export const has = (obj, path) => {
  let value = obj;
  for (const part of wrap(path)) {
    if (!hasOwn(value, part)) return false;
    value = value[part];
  }
  return true;
};

export const get = (obj, path) => {
  let value = obj;
  for (const part of wrap(path)) {
    value = value[part];
  }
  return value;
};

export const set = (obj, path, value) => {
  let obj_ = obj;

  let lastKey;
  for (let i = 0; i < path.length; i++) {
    let key = path[i] < 0 ? obj_.length + path[i] : path[i];
    let deeper = obj_[key];

    if (path.length - 1 === i) {
      lastKey = key;
    } else if (deeper !== undefined) {
      obj_ = deeper;
    } else if (Number.isFinite(path[i + 1])) {
      obj_ = deeper = obj_[key] = [];
    } else {
      obj_ = deeper = obj_[key] = {};
    }
  }

  obj_[lastKey] = value;
};

export const immSet = (obj, path, value) => {
  let obj_ = obj;

  let objs = [];

  for (let i = 0; i < path.length; i++) {
    let key = path[i] < 0 ? obj_.length + path[i] : path[i];
    let deeper = obj_[key];

    if (obj_) {
      objs.push(obj_);
    }

    if (path.length - 1 === i || hasOwn(obj_, deeper)) {
      obj_ = deeper;
    } else if (Number.isFinite(path[i + 1])) {
      obj_ = [];
      objs.push(obj_);
    } else {
      obj_ = {};
    }
  }

  let newValue = value;
  for (let i = objs.length - 1; i >= 0; i--) {
    obj_ = objs[i];
    obj_ = isArray(obj_) ? [...obj_] : { ...obj_ };
    obj_[path[i]] = newValue;
    freezeRecord(obj_);
    newValue = obj_;
  }

  return obj_;
};

const emptyIterator = {
  next() {
    return { value: undefined, done: true };
  },
};

const emptySpreadable = Object.freeze(
  Object.create({
    [Symbol.iterator]() {
      return emptyIterator;
    },
  }),
);

export const when = (condition, value) => {
  const valueType = typeof value;
  if (
    !(value == null || value[Symbol.iterator] || valueType === 'object' || valueType === 'function')
  ) {
    throw new Error('Second argument to when must be an object, iterable, or function.');
  }

  return condition && value != null
    ? valueType === 'function'
      ? value()
      : value
    : emptySpreadable;
};

let arrayIncludes_ = Array.prototype.includes;
export const arrayIncludes = (arr, key) => {
  if (!isArray(arr)) throw new Error();

  return arrayIncludes_.call(arr, key);
};

let arraySlice_ = Array.prototype.slice;
export const arraySlice = (arr, start, end) => {
  if (!isArray(arr)) throw new Error();

  return freezeRecord(arraySlice_.call(arr, start, end));
};

let arrayJoin_ = Array.prototype.join;
export const arrayJoin = (arr, sep) => {
  if (!isArray(arr)) throw new Error();

  return freezeRecord(arrayJoin_.call(arr, sep));
};

let arrayFindIndex_ = Array.prototype.findIndex;
export const arrayFindIndex = (arr, value) => {
  if (!isArray(arr)) throw new Error();

  return arrayFindIndex_.call(arr, value);
};

let arrayMap_ = Array.prototype.map;
export const arrayMap = (arr, fn) => {
  if (!isArray(arr)) throw new Error();

  return freezeRecord(arrayMap_.call(arr, fn));
};

let arrayReduce_ = Array.prototype.reduce;
export const arrayReduce = (arr, fn, initial) => {
  if (!isArray(arr)) throw new Error();

  return arrayReduce_.call(arr, fn, initial);
};

export const isObject = (obj) => obj !== null && typeof obj === 'object';
export const isPlainObject = (val) => val && [Object.prototype, null].includes(getPrototypeOf(val));
export const isFunction = (obj) => typeof obj === 'function';
export const isSymbol = (obj) => typeof obj === 'symbol';
export const isString = (obj) => typeof obj === 'string';
export const isType = (obj) => isSymbol(obj) || isString(obj);
export const isRegex = (obj) => obj instanceof RegExp;
export const isPattern = (obj) => isString(obj) || isRegex(obj);

export const arrayLast = (arr) => arr[arr.length - 1];
