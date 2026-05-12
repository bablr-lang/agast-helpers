import {
  continue_,
  getStreamIterator,
  StreamGenerator,
  StreamIterable,
  wait,
} from '@bablr/stream-iterator';

let { getPrototypeOf } = Object;
let { isArray } = Array;

export const maybeWait = (maybePromise, callback) => {
  if (maybePromise instanceof Promise) {
    return maybePromise.then(callback);
  } else {
    return callback(maybePromise);
  }
};

function* __concat(iterables) {
  for (const iterable of iterables) {
    let iter = getStreamIterator(iterable);
    let step;

    for (;;) {
      step = iter.next();
      while (step === null || step instanceof Promise) {
        if (step === null) yield continue_(), (step = iter.next());
        if (step instanceof Promise) step = yield wait(step);
      }
      if (step.done) break;

      yield step.value;
    }
  }
}

export const concat = (...iterables) => {
  return new StreamIterable(__concat(iterables));
};

function* __reduce(reducer, values, initial) {
  let acc = initial;
  let iter = getStreamIterator(values);
  let step;

  for (;;) {
    step = iter.next();
    while (step === null || step instanceof Promise) {
      if (step === null) yield continue_(), (step = iter.next());
      if (step instanceof Promise) step = yield wait(step);
    }
    if (step.done) break;

    let { value } = step;

    acc = reducer(acc, value);
  }

  return acc;
}

export const reduce = (reducer, value, initial) => {
  let iter = new StreamGenerator(__reduce(reducer, value, initial));

  return maybeWait(iter.next(), (step) => step.value);
};

function* __isEmpty(iterable) {
  let iter = getStreamIterator(iterable);
  let step;

  for (;;) {
    step = iter.next();
    while (step === null || step instanceof Promise) {
      if (step === null) yield continue_(), (step = iter.next());
      if (step instanceof Promise) step = yield wait(step);
    }
    if (step.done) break;

    return false;
  }

  return true;
}

export const isEmpty = (iterable) => {
  if (iterable == null) return true;
  let iter = new StreamGenerator(__isEmpty(iterable));

  return maybeWait(iter.next(), (step) => step.value);
};

function* __map(fn, iterable) {
  let iter = getStreamIterator(iterable);
  let step;

  for (;;) {
    step = iter.next();
    while (step === null || step instanceof Promise) {
      if (step === null) yield continue_(), (step = iter.next());
      if (step instanceof Promise) step = yield wait(step);
    }
    if (step.done) break;

    let value = fn(step.value);

    if (value instanceof Promise) {
      value = yield wait(value);
    }

    yield value;
  }
}

export const map = (fn, iterable) => {
  return new StreamIterable(__map(fn, iterable));
};

function* __flatMap(fn, tags) {
  let iter = getStreamIterator(tags);
  let step;

  for (;;) {
    step = iter.next();
    while (step === null || step instanceof Promise) {
      if (step === null) yield continue_(), (step = iter.next());
      if (step instanceof Promise) step = yield wait(step);
    }
    if (step.done) break;

    let { value } = step;

    yield* fn(value);
  }

  return true;
}

export const flatMap = (fn, tags) => new StreamIterable(__flatMap(fn, tags));

function* __arrayValues(arr) {
  let { length } = arr;
  for (let i = 0; i < length; i++) yield arr[i];
}

export const arrayValues = (arr) => {
  let proto = getPrototypeOf(arr);
  return proto === Array.prototype ? arr[Symbol.iterator]() : __arrayValues(arr);
};

function* __wrap(iterable) {
  let iter = getStreamIterator(iterable);
  let step;

  for (;;) {
    step = iter.next();
    while (step === null || step instanceof Promise) {
      if (step === null) yield continue_(), (step = iter.next());
      if (step instanceof Promise) step = yield wait(step);
    }
    if (step.done) break;

    yield step.value;
  }
}

export const wrap = (iterable) => {
  return isArray(iterable) ? arrayValues(iterable) : new StreamIterable(__wrap(iterable));
};
