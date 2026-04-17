import { deepFreeze, isDeepFrozen, isImmutable } from '@bablr/deep-freeze';

export const { hasOwn, freeze, isFrozen, seal, isSealed, getPrototypeOf, getOwnPropertySymbols } =
  Object;
export const { isArray } = Array;

export const immutable = (obj) => {
  if (!isImmutable(deepFreeze(obj))) throw new Error();
  return obj;
};

export { deepFreeze, isDeepFrozen, isImmutable };

export const freezeClass = (constructor) => {
  freeze(constructor);
  freeze(constructor.prototype);
  return constructor;
};

export const has = (obj, path) => {
  let value = obj;
  for (const part of path) {
    if (!hasOwn(value, part)) return false;
    value = value[part];
  }
  return true;
};

export const get = (obj, path) => {
  let value = obj;
  for (const part of path) {
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
    freeze(obj_);
    newValue = obj_;
  }

  return obj_;
};

export const isObject = (obj) => obj !== null && typeof obj === 'object';
export const isPlainObject = (val) => val && [Object.prototype, null].includes(getPrototypeOf(val));
export const isFunction = (obj) => typeof obj === 'function';
export const isSymbol = (obj) => typeof obj === 'symbol';
export const isString = (obj) => typeof obj === 'string';
export const isType = (obj) => isSymbol(obj) || isString(obj);
export const isRegex = (obj) => obj instanceof RegExp;
export const isPattern = (obj) => isString(obj) || isRegex(obj);
