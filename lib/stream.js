import { Coroutine } from '@bablr/coroutine';
import emptyStack from '@iter-tools/imm-stack';
import { getStreamIterator, StreamIterable, StreamGenerator, wait } from '@bablr/stream-iterator';
import { printTag } from './print.js';
import {
  buildChild,
  buildGapTag,
  buildNodeTag,
  buildNullTag,
  buildOpenNodeTag,
  buildProperty,
  buildReference,
  buildStubNode,
} from './builders.js';
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
import { createNode, isGapNode, Path } from './path.js';
import { streamFromTree } from './tree.js';

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

export const evaluateReturnSync = (iterable) => {
  const co = new Coroutine(iterable[Symbol.iterator]());
  while (!co.done) co.advance();
  return co.value;
};

export const evaluateReturnAsync = async (iterable) => {
  const co = new Coroutine(getStreamIterator(iterable));
  while (!co.done) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = await co.current;
    }
  }
  return co.value;
};

function* __treeFromStream(tags, options) {
  let rootPath = null;
  let path = null;
  const co = new Coroutine(getStreamIterator(tags));
  const expressionsCo = new Coroutine(getStreamIterator(options.expressions || []));

  for (;;) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = yield wait(co.current);
    }

    if (co.done) break;

    let tag = co.value;

    if (tag.type === 'Effect' || tag.type === DoctypeTag) {
      continue;
    }

    if (!path) {
      rootPath = path = Path.create(createNode(tag));

      if (tag.value.selfClosing) {
        path = null;
      }

      continue;
    }

    if (tag.type === GapTag && !path.held) {
      if (!expressionsCo.current || !expressionsCo.done) {
        expressionsCo.advance();
      }

      if (path.node.flags.token) {
        if (expressionsCo.done || expressionsCo.value != null) {
          let node = expressionsCo.value;
          if (isGapNode(node)) {
            throw new Error('not implemented');
          } else {
            path = path.advance(tag);
          }
        }
      } else {
        let node = expressionsCo.done
          ? buildStubNode(buildGapTag())
          : path == null || expressionsCo.value == null
          ? buildStubNode(buildNullTag())
          : expressionsCo.value;

        path = path.advance(buildNodeTag(node));
      }
    } else {
      path = path.advance(tag);
    }
  }

  if (path) {
    throw new Error('imbalanced tag stack');
  }

  return rootPath?.node;
}

export const treeFromStream = (tags, options = {}) => __treeFromStream(tags, options);

export const treeFromStreamSync = (tokens, options = {}) => {
  return evaluateReturnSync(treeFromStream(tokens, options));
};

export const treeFromStreamAsync = async (tokens, options = {}) => {
  return evaluateReturnAsync(treeFromStream(tokens, options));
};

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

        if (depth === 0 && ref.type === '@') {
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

        yield buildOpenNodeTag(flags, type, literal, attributes, true);
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
  depth: !parent ? 0 : parent.depth + 1,
  ref: null,
  bindings: [],
  open: null,
  coverDepth: 0,
  heldProperties: [],
  expanded: false,
});

export const hoistTrivia = (tags) => {
  const co = new Coroutine(getStreamIterator(tags));

  co.advance();

  return new StreamIterable(__hoistTrivia(co));
};

function* __hoistTrivia(co) {
  let frame = null;
  let primed = true;

  for (;;) {
    if (!primed) {
      co.advance();
    }
    primed = false;

    if (co.done) break;

    if (co.current instanceof Promise) {
      co.current = yield wait(co.current);
    }

    const tag = co.value;

    if (tag.type === OpenNodeTag) {
      let isCover = tag.value.flags.cover;
      let parentFrame = frame?.ref && !frame.open ? frame.parent : frame;

      if (
        frame?.ref.type === '#'
        // (frame.parent.open ? frame.parent.coverDepth : frame.parent.shifting)
      ) {
        let { heldProperties } = frame;
        if (heldProperties.length) {
          let property = heldProperties[heldProperties.length - 1];

          if (property.node) throw new Error();

          let node = yield* treeFromStream(__hoistTrivia(co));

          heldProperties[heldProperties.length - 1] = buildProperty(
            property.reference,
            property.bindings,
            node,
          );

          frame = frame.parent;
          frame.heldProperties = [...heldProperties];

          if (frame.expanded) {
            for (let property of frame.heldProperties) {
              yield buildChild(ReferenceTag, property.reference);
              for (let binding of property.bindings) {
                yield buildChild(BindingTag, binding);
              }
              yield* streamFromTree(property.node);
            }
            frame.heldProperties = [];
          }

          primed = true;
          continue;
        }
      } else if (frame && !isCover) {
        if (!frame.shifting && frame.ref && frame.ref.type !== '_') {
          yield buildChild(ReferenceTag, frame.ref);
          let isAnonymous = tag.value.flags.token && !tag.value.type;
          if (!isAnonymous) {
            for (let binding of frame.bindings) {
              yield buildChild(BindingTag, binding);
            }
          }
        }
      }

      if (!frame?.ref || frame.open) {
        frame = buildFrame(parentFrame);
        frame.heldProperties = parentFrame?.heldProperties ? [...parentFrame.heldProperties] : [];

        if (isCover) {
          frame.ref = parentFrame?.ref || buildReference('_');
          frame.bindings = parentFrame && tag.value.type === '_' ? [...parentFrame.bindings] : [];
          frame.shifting = parentFrame && tag.value.type === '_' ? parentFrame.shifting : false;
        } else {
          frame.ref = buildReference();
        }
      }

      frame.coverDepth = isCover ? (parentFrame?.coverDepth ?? 0) + 1 : 0;

      frame.open = tag;

      if (tag.value.selfClosing) {
        frame = parentFrame;

        if (!frame) {
          yield tag;

          break;
        }
      } else {
        if (isCover) {
          continue;
        }
      }
    } else if (tag.type === ReferenceTag) {
      let parentFrame = frame;

      frame = buildFrame(parentFrame);

      if (tag.value.type === '#') {
        if (frame.depth <= frame.coverDepth && !parentFrame.expanded) {
          yield parentFrame.open;

          parentFrame.expanded = true;
        }

        frame.heldProperties.push(buildProperty(tag.value));
      } else {
        frame.heldProperties = parentFrame?.heldProperties ? [...parentFrame.heldProperties] : [];

        for (let property of frame.heldProperties) {
          yield buildChild(ReferenceTag, property.reference);
          for (let binding of property.bindings) {
            yield buildChild(BindingTag, binding);
          }
          yield* streamFromTree(property.node);
        }
        frame.heldProperties = [];
        if (parentFrame) {
          parentFrame.heldProperties = [];
        }
      }

      frame.coverDepth = parentFrame.coverDepth;
      frame.ref = tag.value.type === '_' ? parentFrame.ref : tag.value;
      frame.bindings = parentFrame && tag.value.type === '_' ? [...parentFrame.bindings] : [];
      frame.shifting = parentFrame && tag.value.type === '_' ? parentFrame.shifting : false;

      if (tag.value.type === '_' && parentFrame.expanded) {
        yield tag;
      }
      continue;
    } else if (tag.type === ShiftTag) {
      let doneFrame = frame;

      frame = buildFrame(doneFrame);
      frame.coverDepth = doneFrame?.coverDepth || 0;
      frame.ref = tag.value;
      frame.bindings = doneFrame && tag.value.type === '_' ? [...doneFrame.bindings] : [];
      frame.shifting = true;
      frame.heldProperties = [...doneFrame.heldProperties];
      // continue;
    } else if (tag.type === BindingTag) {
      let { heldProperties } = frame;
      if (heldProperties.length) {
        let property = heldProperties[heldProperties.length - 1];
        if (!property.node) {
          heldProperties[heldProperties.length - 1] = buildProperty(property.reference, [
            ...property.bindings,
            tag.value,
          ]);
          frame.bindings.push(tag.value);
          continue;
        }
      }
      if (!frame.ref) {
        frame = buildFrame(frame);
        frame.ref = buildReference();
      }

      frame.bindings.push(tag.value);
      continue;
    } else if (tag.type === CloseNodeTag) {
      let doneFrame = frame;
      frame = frame.parent;

      if (!doneFrame.open.value.flags.fragment) {
        for (let property of doneFrame.heldProperties) {
          yield buildChild(ReferenceTag, property.reference);
          for (let binding of property.bindings) {
            yield buildChild(BindingTag, binding);
          }
          yield* streamFromTree(property.node);
        }
        doneFrame.heldProperties = [];
      }

      if (frame) {
        frame.heldProperties = [...doneFrame.heldProperties];
        if (doneFrame?.coverDepth) {
          continue;
        }
      } else {
        if (doneFrame.expanded || !doneFrame.open.value.flags.fragment) {
          yield tag;
        }
        break;
      }
    } else if (tag.type === GapTag || tag.type === NullTag) {
      if (frame.ref) {
        yield buildChild(ReferenceTag, frame.ref);
      }
      frame = frame.parent;

      if (tag.type === GapTag && frame.heldProperties.length) {
        yield tag;

        for (let property of frame.heldProperties) {
          yield buildChild(ReferenceTag, property.reference);
          for (let binding of property.bindings) {
            yield buildChild(BindingTag, binding);
          }
          yield* streamFromTree(property.node);
        }
        frame.heldProperties = [];

        continue;
      }
    }

    yield tag;
  }

  if (!co.done) {
    co.advance();
  }

  if (frame) throw new Error();
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

        if (!(ref.type === '#' || (ref.type === '@' && attributes.cooked))) {
          throw new Error('cookable nodes must not contain other nodes');
        }

        if (ref.type === '@') {
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
