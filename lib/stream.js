import { Coroutine } from '@bablr/coroutine';
import emptyStack from '@iter-tools/imm-stack';
import { printSelfClosingNodeTag, printTag } from './print.js';
import { buildOpenNodeTag, buildTokenGroup } from './builders.js';
import {
  DoctypeTag,
  OpenNodeTag,
  CloseNodeTag,
  ReferenceTag,
  ShiftTag,
  GapTag,
  NullTag,
  InitializerTag,
  LiteralTag,
  TokenGroup,
  BindingTag,
} from './symbols.js';

export * from './print.js';

export const getStreamIterator = (obj) => {
  return obj[Symbol.for('@@streamIterator')]?.() || obj[Symbol.iterator]?.();
};

export class SyncGenerator {
  constructor(embeddedGenerator) {
    if (!embeddedGenerator.next) throw new Error();

    this.generator = embeddedGenerator;
  }

  next(value) {
    const step = this.generator.next(value);

    if (step instanceof Promise) {
      throw new Error('invalid embedded generator');
    }

    if (step.done) {
      return step;
    } else if (step.value instanceof Promise) {
      throw new Error('sync generators cannot resolve promises');
    } else {
      return step;
    }
  }

  return(value) {
    const step = this.generator.return(value);
    if (step instanceof Promise) {
      throw new Error('invalid embedded generator');
    }

    if (step.value instanceof Promise) {
      throw new Error('sync generators cannot resolve promises');
    }
    return step;
  }

  [Symbol.iterator]() {
    return this;
  }
}

export class AsyncGenerator {
  constructor(embeddedGenerator) {
    this.generator = embeddedGenerator;
  }

  next(value) {
    const step = this.generator.next(value);

    if (step instanceof Promise) {
      throw new Error('invalid embedded generator');
    }

    if (step.done) {
      return Promise.resolve(step);
    } else if (step.value instanceof Promise) {
      return step.value.then((value) => {
        return this.next(value);
      });
    } else {
      return Promise.resolve(step);
    }
  }

  return(value) {
    const result = this.generator.return(value);
    if (result instanceof Promise) {
      throw new Error('sync generators cannot resolve promises');
    }
    return result;
  }

  [Symbol.asyncIterator]() {
    return this;
  }
}

export class StreamGenerator {
  constructor(embeddedGenerator) {
    this.generator = embeddedGenerator;
  }

  next(value) {
    const step = this.generator.next(value);

    if (step.done) {
      return step;
    } else if (step.value instanceof Promise) {
      return step.value.then((value) => {
        return this.next(value);
      });
    } else {
      return step;
    }
  }

  return(value) {
    return this.generator.return(value);
  }

  [Symbol.for('@@streamIterator')]() {
    return this;
  }
}

export class StreamIterable {
  constructor(embeddedStreamIterable) {
    this.iterable = embeddedStreamIterable;
  }

  [Symbol.iterator]() {
    return new SyncGenerator(this.iterable);
  }

  [Symbol.asyncIterator]() {
    return new AsyncGenerator(this.iterable);
  }

  [Symbol.for('@@streamIterator')]() {
    return new StreamGenerator(this.iterable);
  }
}

export const maybeWait = (maybePromise, callback) => {
  if (maybePromise instanceof Promise) {
    return maybePromise.then(callback);
  } else {
    return callback(maybePromise);
  }
};

function* __isEmpty(tags) {
  const co = new Coroutine(getStreamIterator(tags));

  for (;;) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }
    if (co.done) break;

    let depth = 0;
    let ref = null;

    const tag = co.value;

    switch (tag.type) {
      case ReferenceTag:
        ref = tag;
        break;

      case OpenNodeTag:
        ++depth;

        if (depth === 0 && ref.value.type === '@') {
          return false;
        }

        break;

      case CloseNodeTag:
        --depth;
        break;

      case LiteralTag:
      case GapTag:
        return false;
    }
  }

  return true;
}

export const isEmpty = (tags) =>
  new StreamIterable(__isEmpty(tags))[Symbol.iterator]().next().value;

export const printCSTML = (tags) => {
  return stringFromStream(generateCSTML(tags));
};

function* __emptyStreamIterator() {}

export const emptyStreamIterator = () => new StreamIterable(__emptyStreamIterator());

export const asyncStringFromStream = async (stream) => {
  const co = new Coroutine(getStreamIterator(stream));
  let str = '';

  for (;;) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = await co.current;
    }

    if (co.done) break;

    const tag = co.value;

    str += printTag(tag);
  }

  return str;
};

export const stringFromStream = (stream) => {
  const co = new Coroutine(stream[Symbol.iterator]());
  let str = '';

  for (;;) {
    co.advance();

    if (co.done) break;

    const chr = co.value;

    str += chr;
  }

  return str;
};

function* __generateCSTML(tags, options) {
  if (!tags) {
    yield* '<//>';
    return;
  }

  let prevTag = null;

  const co = new Coroutine(getStreamIterator(prettyGroupTags(tags)));

  for (;;) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }
    if (co.done) break;

    const tag = co.value;

    if (tag.type === ReferenceTag && prevTag.type === NullTag) {
      yield* ' ';
    }

    if (tag.type === 'Effect') {
      continue;
    }

    if (tag.type === TokenGroup) {
      const intrinsicValue = getCooked(tag.value);
      yield* printSelfClosingNodeTag(tag.value[0], intrinsicValue);
    } else {
      yield* printTag(tag);
    }

    prevTag = tag;
  }

  yield* '\n';
}

export const generateCSTML = (tags, options = {}) =>
  new StreamIterable(__generateCSTML(tags, options));

const isToken = (tag) => {
  return tag.value.flags.token;
};

export const prettyGroupTags = (tags) => new StreamIterable(__prettyGroupTags(tags));

function* __prettyGroupTags(tags) {
  let states = emptyStack.push({ holding: [], broken: false, open: null });
  let state = states.value;

  const co = new Coroutine(getStreamIterator(tags));

  let ref = null;

  for (;;) {
    co.advance();

    if (co.done) break;

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }

    const tag = co.value;
    const isOpenClose = tag.type === CloseNodeTag || tag.type === OpenNodeTag;

    if (tag.type === ReferenceTag) {
      ref = tag;
    }

    if (
      (tag.type === 'Effect' && tag.value.verb === 'write') ||
      [ReferenceTag, DoctypeTag, BindingTag, GapTag, NullTag, InitializerTag, ShiftTag].includes(
        tag.type,
      ) ||
      (tag.type === OpenNodeTag && (!tag.value.type || ref?.value.type === '@'))
    ) {
      state.broken = true;

      if (state.holding.length) {
        yield* state.holding;
        state.holding = [];
      }
    } else if (tag.type === LiteralTag) {
      state.holding.push(tag);
    }

    if (!state.holding.length && !isOpenClose) {
      yield tag;
    }

    if (tag.type === CloseNodeTag) {
      if (!state.broken && (isToken(state.open) || state.holding.length === 1)) {
        state.holding.push(tag);
        yield buildTokenGroup(state.holding);
      } else {
        if (state.holding.length) {
          yield* state.holding;
        }
        yield tag;
      }

      states = states.pop();
      state = states.value;
    }

    if (tag.type === OpenNodeTag) {
      states = states.push({ holding: [tag], broken: false, open: tag });

      state = states.value;
    }
  }
}

function* __generatePrettyCSTML(tags, options) {
  let { indent = '  ', inline: inlineOption = true } = options;

  if (!tags) {
    yield* '<//>';
    return;
  }

  const co = new Coroutine(getStreamIterator(prettyGroupTags(tags)));
  let indentLevel = 0;
  let first = true;
  let inline = false;
  let ref = null;

  for (;;) {
    co.advance();

    if (co.done) break;

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }

    const tag = co.value;

    if (tag.type === 'Effect') {
      continue;
    }

    if (tag.type === BindingTag && !tag.value.languagePath.length) {
      continue;
    }

    inline =
      inlineOption &&
      inline &&
      ref &&
      (tag.type === NullTag ||
        tag.type === GapTag ||
        tag.type === BindingTag ||
        tag.type === InitializerTag ||
        tag.type === TokenGroup);

    if (!first && !inline) {
      yield* '\n';
    }

    if (tag.type === CloseNodeTag) {
      ref = null;

      indentLevel--;
    }

    if (!inline) {
      yield* indent.repeat(indentLevel);
    } else {
      yield* ' ';
    }

    if (tag.type === TokenGroup) {
      ref = null;
      const intrinsicValue = tag.value[0].value.flags.token ? getCooked(tag.value) : null;
      let openTag = tag.value[0];
      let { flags, type, attributes } = openTag.value;
      yield* printSelfClosingNodeTag(
        buildOpenNodeTag(flags, null, type, attributes),
        intrinsicValue,
      );
    } else if (tag.type === OpenNodeTag) {
      let { flags, type, attributes } = tag.value;
      yield* printTag(buildOpenNodeTag(flags, null, type, attributes));
    } else {
      yield* printTag(tag);
    }

    if (tag.type === ReferenceTag) {
      inline = true;
      ref = tag;
    }

    if (tag.type === OpenNodeTag) {
      indentLevel++;
    }

    first = false;
  }

  if (indentLevel !== 0) {
    throw new Error('imbalanced tags');
  }

  yield* '\n';
}

export const generatePrettyCSTML = (tags, options = {}) => {
  return new StreamIterable(__generatePrettyCSTML(tags, options));
};

export const printPrettyCSTML = (tags, options = {}) => {
  return stringFromStream(generatePrettyCSTML(tags, options));
};

export const getCooked = (tags) => {
  let cooked = '';

  let first = true;
  let foundLast = false;
  let depth = 0;
  let ref = null;

  for (const tag of tags) {
    if (foundLast) throw new Error();

    switch (tag.type) {
      case ReferenceTag: {
        ref = tag;
        if (depth === 1) {
          throw new Error('cookable nodes must not contain other nodes');
        }
        break;
      }

      case OpenNodeTag: {
        const { flags, attributes } = tag.value;

        depth++;

        if (first) {
          if (flags.token) {
            break;
          } else {
            throw new Error(JSON.stringify(flags));
          }
        }

        if (!(ref.value.type === '#' || (ref.value.type === '@' && attributes.cooked))) {
          throw new Error('cookable nodes must not contain other nodes');
        }

        if (ref.value.type === '@') {
          const { cooked: cookedValue } = tag.value.attributes;

          if (!cookedValue) throw new Error('cannot cook string: it contains uncooked escapes');

          cooked += cookedValue;
        }

        break;
      }

      case CloseNodeTag: {
        if (depth === 1) {
          foundLast = true;
        }
        depth--;
        break;
      }

      case LiteralTag: {
        if (depth === 1) {
          cooked += tag.value;
        }
        break;
      }

      default: {
        throw new Error();
      }
    }

    first = false;
  }

  return cooked;
};

export const printSource = (tags) => {
  let printed = '';

  if (!tags) return printed;

  for (const tag of tags) {
    if (tag.type === LiteralTag) {
      printed += tag.value;
    } else if (tag.type === GapTag) {
      throw new Error('use generateSourceTextFor');
    }
  }

  return printed;
};

export function* generateSourceTextFor(tags) {
  for (const tag of tags) {
    if (tag.type === LiteralTag) {
      yield* tag.value;
    } else if (tag.type === GapTag) {
      yield null;
    }
  }
}

export const sourceTextFor = printSource;
