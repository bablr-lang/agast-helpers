import { Coroutine } from '@bablr/coroutine';
import emptyStack from '@iter-tools/imm-stack';
import { getStreamIterator, StreamIterable, StreamGenerator } from '@bablr/stream-iterator';
import { printTag } from './print.js';
import { buildOpenNodeTag, buildReference } from './builders.js';
import {
  OpenNodeTag,
  CloseNodeTag,
  ReferenceTag,
  GapTag,
  NullTag,
  LiteralTag,
  BindingTag,
  DoctypeTag,
  ShiftTag,
  AttributeDefinition,
} from './symbols.js';
import { referencesAreEqual } from './path.js';

export { getStreamIterator, StreamIterable, StreamGenerator };

export * from './print.js';

export const maybeWait = (maybePromise, callback) => {
  if (maybePromise instanceof Promise) {
    return maybePromise.then(callback);
  } else {
    return callback(maybePromise);
  }
};

function* __flatMap(fn, tags) {
  const co = new Coroutine(getStreamIterator(tags));

  for (;;) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }
    if (co.done) break;

    let { value } = co;

    yield* fn(value);
  }

  return true;
}

export const flatMap = (fn, tags) => new StreamIterable(__flatMap(fn, tags));

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

        if (tag.value.literalValue) return false;

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

    const chr = co.value;

    str += chr;
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

    yield* printTag(tag);

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
      [
        ReferenceTag,
        DoctypeTag,
        BindingTag,
        GapTag,
        NullTag,
        ShiftTag,
        AttributeDefinition,
        OpenNodeTag,
      ].includes(tag.type)
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
        let { flags, type, attributes } = state.holding[0].value;

        let literal = state.holding
          .slice(1)
          .map((lit) => lit.value)
          .join('');

        yield buildOpenNodeTag(flags, type, attributes, literal, true);
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
      if (tag.value.selfClosing) {
        yield tag;
      } else {
        states = states.push({ holding: [tag], broken: false, open: tag });

        state = states.value;
      }
    }
  }
}

export const flattenInternalFragments = (tags) =>
  new StreamIterable(__flattenInternalFragments(tags));

function* __flattenInternalFragments(tags) {
  const co = new Coroutine(getStreamIterator(tags));
  let ref = null;
  let open = null;
  let bind = null;
  let held = { opens: 0 };
  let stack = [];

  for (;;) {
    co.advance();

    if (co.done) break;

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }

    const tag = co.value;

    // `<__> ref: <_> #: <//> .: <_> #: <//> .: <Node /> </></></>`

    // becomes `<__> #: <//> #: <//> ref: <Node /> </>`

    if (tag.type === OpenNodeTag) {
      open = ref = bind = null;

      if (!tag.value.selfClosing) {
        if (tag.value.flags.cover) {
          stack.push(held);
          held = { opens: 0 };
          open = tag;
          continue;
        } else {
          held.opens++;
        }
      }
    } else if (tag.type === ReferenceTag) {
      if (referencesAreEqual(tag.value, buildReference('_'))) {
        ref = tag;
        continue;
      } else {
        if (open) {
          yield open;
          held = stack.pop();
          held.opens++;
        }
        open = null;
      }
    } else if (tag.type === BindingTag) {
      if (open && !tag.value.segments) {
        bind = tag;
        continue;
      } else {
        if (open) {
          yield open;
          held = stack.pop();
          held.opens++;
        }
        if (ref) yield ref;
        open = ref = null;
      }
    } else if (tag.type === CloseNodeTag) {
      if (held.opens > 0) {
        held.opens--;
      } else {
        if (open) yield open;
        open = null;
        held = stack.pop();
        continue;
      }
    } else if (tag.type === GapTag || tag.type === NullTag) {
      if (open) {
        yield open;
        held = stack.pop();
        held.opens++;
      }
      if (ref) yield ref;
      if (bind) yield bind;

      open = null;
      ref = null;
      bind = null;
    }
    yield tag;
  }
}

function* __generatePrettyCSTML(tags, options) {
  let { indent = '  ', inline: inlineOption = true } = options;

  if (!tags) {
    yield* '<//>';
    return;
  }

  const co = new Coroutine(getStreamIterator(prettyGroupTags(flattenInternalFragments(tags))));
  // const co = new Coroutine(getStreamIterator(prettyGroupTags(tags)));
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

    if (tag.type === BindingTag && !tag.value.segments?.length) {
      continue;
    }

    inline =
      inlineOption &&
      inline &&
      ref &&
      (tag.type === NullTag ||
        tag.type === GapTag ||
        tag.type === BindingTag ||
        (tag.type === OpenNodeTag && tag.value.selfClosing));

    if (!first && !inline) {
      yield* '\n';
    }

    if (tag.type === CloseNodeTag) {
      ref = null;

      indentLevel--;
    }

    if (!inline) {
      yield* indent.repeat(Math.max(0, indentLevel));
    } else {
      yield* ' ';
    }

    yield* printTag(tag);

    if (tag.type === ReferenceTag) {
      inline = true;
      ref = tag;
    }

    if (tag.type === OpenNodeTag) {
      indentLevel += tag.value.selfClosing ? 0 : 1;
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
        const { flags, attributes, literalValue, selfClosing } = tag.value;

        depth += selfClosing ? 0 : 1;

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
        } else if (literalValue) {
          cooked += literalValue;
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
    if (tag.type === OpenNodeTag && tag.value.literalValue) {
      printed += tag.value.literalValue;
    } else if (tag.type === LiteralTag) {
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
