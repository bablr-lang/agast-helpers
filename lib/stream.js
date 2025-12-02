import { Coroutine } from '@bablr/coroutine';
import emptyStack from '@iter-tools/imm-stack';
import { getStreamIterator, StreamIterable, StreamGenerator, wait } from '@bablr/stream-iterator';
import { printTag } from './print.js';
import { buildOpenNodeTag, buildReferenceTag } from './builders.js';
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

export { getStreamIterator, StreamIterable, StreamGenerator, wait };

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
      co.current = yield wait(co.current);
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
      co.current = yield wait(co.current);
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
      co.current = yield wait(co.current);
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

  for (;;) {
    co.advance();

    if (co.done) break;

    if (co.current instanceof Promise) {
      co.current = yield wait(co.current);
    }

    const tag = co.value;
    const isOpenClose = tag.type === CloseNodeTag || tag.type === OpenNodeTag;

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

let buildFrame = (parent = null) => ({
  parent,
  ref: null,
  bindings: [],
  open: null,
  coverDepth: 0,
  trailingTrivias: [],
  expanded: false,
  shifting: false,
});

export const hoistTrivia = (tags) => new StreamIterable(__hoistTrivia(tags));

function* __hoistTrivia(tags) {
  const co = new Coroutine(getStreamIterator(tags));

  let frame = null;
  let nodeStack = [];
  let depth = 0;

  for (;;) {
    co.advance();

    if (co.done) break;

    if (co.current instanceof Promise) {
      co.current = yield wait(co.current);
    }

    const tag = co.value;

    // console.log(printTag(tag));

    if (tag.type === OpenNodeTag) {
      let isCover = tag.value.flags.cover;
      let parentFrame = frame;

      if (
        frame?.ref.value.type === '#' &&
        (frame.parent.open ? frame.parent.coverDepth > 1 : frame.parent.shifting)
      ) {
        frame.trailingTrivias.push(frame.ref);
        frame.trailingTrivias.push(...frame.bindings);
        frame.trailingTrivias.push(...frame.bindings);
      } else if (frame && !isCover) {
        if (frame.ref && frame.ref.value.type !== '_') {
          yield frame.ref;
          let isAnonymous = tag.value.flags.token && !tag.value.type;
          if (!isAnonymous) {
            yield* frame.bindings;
          }
        }
      }

      if (!frame?.ref) {
        if (frame) {
          nodeStack.push(frame);
        }
        frame = buildFrame(frame);
        if (isCover) {
          frame.ref = parentFrame?.ref || buildReferenceTag('_');
          frame.bindings = parentFrame && tag.value.type === '_' ? [...parentFrame.bindings] : [];
          frame.shifting = parentFrame && tag.value.type === '_' ? parentFrame.shifting : false;
        }
      }

      depth++;

      frame.coverDepth = isCover ? (parentFrame?.coverDepth ?? 0) + 1 : 0;

      if (!isCover) {
        frame.open = tag;
      }

      if (!tag.value.selfClosing) {
        if (isCover) {
          continue;
        }
      } else {
        frame = nodeStack.pop();
        depth--;
      }
    } else if (tag.type === ReferenceTag) {
      let parentFrame = frame;

      if (tag.value.type === '#') {
        if (depth === 1 && !frame.expanded) {
          yield parentFrame.open;
          frame.expanded = true;
        }
      }

      nodeStack.push(parentFrame);
      frame = buildFrame(frame);
      frame.coverDepth = parentFrame.coverDepth;
      frame.ref = tag.value.type === '_' ? parentFrame.ref : tag;
      frame.bindings = parentFrame && tag.value.type === '_' ? [...parentFrame.bindings] : [];
      frame.shifting = parentFrame && tag.value.type === '_' ? parentFrame.shifting : false;
      if (tag.value.type === '_' && parentFrame.expanded) {
        yield tag;
      }
      continue;
    } else if (tag.type === ShiftTag) {
      let parentFrame = frame;

      nodeStack.push(parentFrame);
      frame = buildFrame(frame);
      frame.coverDepth = parentFrame.coverDepth;
      frame.ref = tag;
      frame.bindings = parentFrame && tag.value.type === '_' ? [...parentFrame.bindings] : [];
      frame.shifting = true;
      continue;
    } else if (tag.type === BindingTag) {
      if (!frame.ref) {
        nodeStack.push(frame);
        frame = buildFrame(frame);
      }

      frame.bindings.push(tag);
      continue;
    } else if (tag.type === CloseNodeTag) {
      let doneFrame = frame;
      frame = nodeStack.pop();
      depth--;
      if (depth === 0 && doneFrame?.expanded) {
      } else if (doneFrame?.coverDepth) {
        continue;
      }
    } else if (tag.type === GapTag || tag.type === NullTag) {
      if (frame.ref) yield frame.ref;
      frame = nodeStack.pop();
    }
    yield tag;
  }

  if (nodeStack.length) throw new Error();
}

function* __generatePrettyCSTML(tags, options) {
  let { indent = '  ', inline: inlineOption = true } = options;

  if (!tags) {
    yield* '<//>';
    return;
  }

  const co = new Coroutine(getStreamIterator(prettyGroupTags(hoistTrivia(tags))));
  // const co = new Coroutine(getStreamIterator(prettyGroupTags(tags)));
  let indentLevel = 0;
  let first = true;
  let inline = false;
  let ref = null;

  for (;;) {
    co.advance();

    if (co.done) break;

    if (co.current instanceof Promise) {
      co.current = yield wait(co.current);
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
    // throw new Error('imbalanced tags');
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
