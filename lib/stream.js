import { Coroutine } from '@bablr/coroutine';
import emptyStack from '@iter-tools/imm-stack';
import { getStreamIterator, StreamIterable, StreamGenerator, wait } from '@bablr/stream-iterator';
import * as Tags from './tags.js';
import { printTag } from './print.js';
import {
  buildChild,
  buildGapTag,
  buildNullTag,
  buildOpenNodeTag,
  buildProperty,
  buildReference,
  parseTag,
  parseTagType,
} from './builders.js';
import {
  OpenNodeTag,
  CloseTag,
  ReferenceTag,
  GapTag,
  NullTag,
  LiteralTag,
  BindingTag,
  DoctypeTag,
  ShiftTag,
  AttributeDefinition,
} from './symbols.js';
import { buildNode, getRoot, isGapNode, Path } from './path.js';
import { streamFromTree } from './tree.js';
import { freeze } from './object.js';
import { maybeWait } from './iterable.js';
import { arrayValues } from '@bablr/record';
import { buildParser } from './parse.js';

export { getStreamIterator, StreamIterable, StreamGenerator, wait };

export * from './print.js';

function* __evaluateReturn(iterable) {
  let iter = getStreamIterator(iterable);
  let step;

  for (;;) {
    step = iter.next();
    if (step instanceof Promise) step = yield wait(step);
    if (step.done) break;
  }

  return step.value;
}

export const evaluateReturn = (iterable) => {
  let iter = new StreamGenerator(__evaluateReturn(iterable));

  return maybeWait(iter.next(), (step) => step.value);
};

function* __treeFromStream(tags, options) {
  let path = null;
  let iter = getStreamIterator(tags);
  let expressionsIter = getStreamIterator(options.expressions || []);
  let step;
  let expressionsStep;

  for (;;) {
    step = iter.next();
    if (step instanceof Promise) step = yield wait(step);
    if (step.done) break;

    let tag = step.value;
    let tagType = parseTagType(tag);

    if (tagType === 'Effect' || tagType === DoctypeTag) {
      continue;
    }

    if (!path) {
      path = Path.from(buildNode(Tags.fromValues([tag])));

      // if (tag.value.selfClosing) {
      //   path = null;
      // }

      continue;
    }

    if (tagType === GapTag && !path.held) {
      if (!expressionsStep || !expressionsStep.done) {
        expressionsStep = expressionsIter.next();
        if (expressionsStep instanceof Promise) {
          expressionsStep = yield wait(expressionsStep);
        }
      }

      if (path.node.value.flags.token) {
        if (expressionsStep.done || expressionsStep.value != null) {
          let node = expressionsStep.value;
          if (isGapNode(node)) {
            throw new Error('not implemented');
          } else {
            path = path.advance(tag);
          }
        }
      } else {
        let node = expressionsStep.done
          ? buildNode(buildGapTag())
          : path == null || expressionsStep.value == null
          ? buildNode(buildNullTag())
          : expressionsStep.value;

        path = path.advance(node);
      }
    } else {
      path = path.advance(tag);
    }
  }

  if (!path.done) {
    throw new Error('imbalanced tag stack');
  }

  return path?.node;
}

export const treeFromStream = (tags, options = freeze({})) => {
  let iter = new StreamGenerator(__treeFromStream(tags, options));
  return maybeWait(iter.next(), (step) => step.value);
};

function* __isEmpty(tags) {
  let iter = getStreamIterator(tags);
  let step;

  for (;;) {
    step = iter.next();
    if (step instanceof Promise) step = yield wait(step);
    if (step.done) break;

    let depth = 0;
    let ref = null;

    const tag = step.value;
    let tagType = parseTagType(tag);

    switch (tagType) {
      case ReferenceTag:
        ref = tag;
        break;

      case OpenNodeTag:
        ++depth;

        if (parseTag(tag).value.literalValue) return false;

        if (depth === 0 && ref.type === '@') {
          return false;
        }

        break;

      case CloseTag:
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

export function* streamFromString(input) {
  let p = buildParser(input);
  let { str } = p;
  let chr = str[p.idx];

  while (' \t\r\n'.includes(chr)) chr = str[++p.idx];

  while (p.idx < str.length) {
    yield parseTag(p);
    chr = str[p.idx];

    while (' \t\r\n'.includes(chr)) chr = str[++p.idx];
  }
}

function* __emptyStreamIterator() {}

export const emptyStreamIterator = () => new StreamIterable(__emptyStreamIterator());

function* __stringFromStream(stream) {
  let iter = getStreamIterator(stream);
  let step;
  let str = '';

  for (;;) {
    step = iter.next();
    if (step instanceof Promise) step = yield wait(step);
    if (step.done) break;

    let chr = step.value;

    str += chr;
  }

  return str;
}

export const stringFromStream = (stream) => {
  return evaluateReturn(__stringFromStream(stream));
};

function* __generateCSTML(tags, options) {
  if (!tags) {
    yield* '<//>';
    return;
  }

  let prevTag = null;
  let iter = getStreamIterator(prettyGroupTags(tags));
  let step;

  for (;;) {
    step = iter.next();
    if (step instanceof Promise) step = yield wait(step);
    if (step.done) break;

    const tag = step.value;
    let tagType = parseTagType(tag);

    if (tagType === ReferenceTag && prevTag.type === NullTag) {
      yield* ' ';
    }

    if (tagType === 'Effect') {
      continue;
    }

    yield* printTag(tag);

    prevTag = tag;
  }
}

export const generateCSTML = (tags, options = freeze({})) =>
  new StreamIterable(__generateCSTML(tags, options));

const isToken = (tag) => {
  return parseTag(tag).value.flags.token;
};

export const prettyGroupTags = (tags) => new StreamIterable(__prettyGroupTags(tags));

function* __prettyGroupTags(tags) {
  let states = emptyStack.push({ holding: [], broken: false, open: null });
  let state = states.value;
  let iter = getStreamIterator(tags);
  let step;

  for (;;) {
    step = iter.next();

    if (step instanceof Promise) {
      step = yield wait(step);
    }

    if (step.done) break;

    const tag = parseTag(step.value);
    const isOpenClose = tag.type === CloseTag || tag.type === OpenNodeTag;

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

    if (tag.type === CloseTag) {
      if (!state.broken && (isToken(state.open) || state.holding.length === 1)) {
        let { flags, name, attributes } = state.holding[0].value;

        let literal = state.holding
          .slice(1)
          .map((lit) => lit.value)
          .join('');

        yield buildOpenNodeTag(flags, name, literal, attributes, true);
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

let pushFrame = (parent = null) => {
  let heldProperties = parent ? [...parent.heldProperties] : [];
  if (parent) {
    parent.heldProperties = [];
  }
  return {
    parent,
    depth: !parent ? 0 : parent.depth + 1,
    ref: null,
    bindings: [],
    open: null,
    coverDepth: 0,
    heldProperties,
    expanded: !parent,
    shifting: parent?.shifting || false,
  };
};

let popFrame = (frame) => {
  let { heldProperties } = frame;

  if (frame.parent) {
    frame.parent.heldProperties = heldProperties;
    frame.parent.shifting = frame.shifting;
  } else if (heldProperties.length) {
    throw new Error();
  }

  return frame.parent;
};

function* emitHeld(frame, nextTag) {
  if (frame.ref?.flags.expression && nextTag?.type === ShiftTag) return;

  for (let property of frame.heldProperties) {
    let { reference, bindings, node } = property;
    yield buildChild(ReferenceTag, reference);
    let isAnonymous = node.value.flags.token && !node.value.name;
    if (!isAnonymous) {
      for (let binding of arrayValues(bindings)) {
        yield buildChild(BindingTag, binding);
      }
    }
    yield* streamFromTree(node);
  }
  frame.heldProperties = [];
}

export const hoistTrivia = (tags) => {
  const co = new Coroutine(getStreamIterator(tags));

  return new StreamIterable(__hoistTriviaOuter(co));
};

function* __hoistTriviaOuter(co) {
  co.advance();

  if (co.current instanceof Promise) {
    co.current = yield wait(co.current);
  }

  let firstTag = parseTag(co.value);

  co.advance();

  if (co.current instanceof Promise) {
    co.current = yield wait(co.current);
  }

  yield* __hoistTrivia(co, firstTag);
}

function* __hoistTrivia(co, firstTag) {
  let frame = null;
  let lastFrame = null;
  let alreadyAdvanced = true;
  let tag = firstTag;

  let nextTag;

  nextTag = parseTag(co.value);

  for (;;) {
    if (co.done || !nextTag) break;
    if (!alreadyAdvanced) {
      co.advance();

      if (co.current instanceof Promise) {
        co.current = yield wait(co.current);
      }
    }
    alreadyAdvanced = false;

    nextTag = parseTag(co.value);

    if (tag.type === OpenNodeTag) {
      let isCover = tag.value.type === Symbol.for('_');
      let parentFrame = frame?.ref && !frame.open ? frame.parent : frame;
      let done = false;

      if (frame?.ref.type === '#' && !frame.ref.name) {
        let { heldProperties } = frame;
        if (heldProperties.length) {
          let heldProperty = heldProperties[heldProperties.length - 1];

          if (heldProperty.node) {
            throw new Error();
          }

          let node = treeFromStream(new StreamIterable(__hoistTrivia(co, tag)));

          if (node instanceof Promise) {
            node = yield wait(node);
          }

          if (node.value.type === Symbol.for('_')) {
            let leading = true;
            for (let property of Tags.traverse(node.value.children)) {
              if (property.value.reference.type === '_') {
                leading = false;
                frame.heldProperties[heldProperties.length - 1] = buildProperty(
                  Tags.fromValues(
                    [
                      heldProperty.tags[1][0],
                      heldProperty.tags[1][1] || Tags.fromValues([]),
                      getRoot(node),
                    ],
                    1,
                  ),
                );
              } else {
                if (leading) {
                  let top = frame.heldProperties.pop();
                  frame.heldProperties.push(property);
                  frame.heldProperties.push(top);
                } else {
                  frame.heldProperties.push(property);
                }
              }
            }
          } else {
            frame.heldProperties[heldProperties.length - 1] = buildProperty(
              Tags.fromValues(
                [heldProperty.tags[1][0], heldProperty.tags[1][1] || Tags.fromValues([]), node],
                1,
              ),
            );
          }

          nextTag = parseTag(co.value);

          lastFrame = frame;

          frame = popFrame(frame);

          if (
            !frame.ref.flags.expression &&
            (frame.expanded || frame.parent?.open?.value.type !== Symbol.for('_'))
          ) {
            yield* emitHeld(frame, nextTag);
          }

          done = true;
        }
      } else if (frame && !isCover) {
        if (!frame.shifting && ((frame.ref && frame.ref.type !== '_') || frame.expanded)) {
          yield buildChild(ReferenceTag, frame.ref);
          let isAnonymous = tag.value.flags.token && !tag.value.name;
          if (!isAnonymous) {
            for (let binding of frame.bindings) {
              yield buildChild(BindingTag, binding);
            }
          }
        }
      }

      if (!done) {
        if (!frame?.ref || frame.open) {
          frame = pushFrame(parentFrame);

          frame.heldProperties = parentFrame?.heldProperties ? [...parentFrame.heldProperties] : [];

          if (tag.value.type === Symbol.for('__')) {
            frame.open = tag;
            frame.ref = buildReference();
          } else if (isCover) {
            frame.ref = parentFrame?.ref || buildReference('_');
            frame.bindings =
              parentFrame && tag.value.type === Symbol.for('_') ? [...parentFrame.bindings] : [];
            frame.shifting =
              parentFrame && tag.value.type === Symbol.for('_') ? parentFrame.shifting : false;
          } else {
            frame.ref = buildReference();
          }
        }

        frame.coverDepth = isCover ? (parentFrame?.coverDepth ?? 0) + 1 : 0;

        frame.open = tag;

        if (tag.value.selfClosing) {
          lastFrame = frame;

          frame = popFrame(frame);

          if (!frame) {
            yield tag;

            break;
          } else {
            yield tag;
          }
        } else {
          if (!isCover || !parentFrame) {
            yield tag;
          }
        }
      }
    } else if (tag.type === ReferenceTag) {
      let parentFrame = frame;

      frame = pushFrame(parentFrame);

      if (tag.value.type === '#' && !tag.value.name) {
        frame.heldProperties.push(buildProperty(Tags.fromValues([printTag(tag)])));
      } else {
        if (!parentFrame.shifting) {
          yield* emitHeld(frame, nextTag);
        }
      }

      frame.coverDepth = parentFrame.coverDepth;
      frame.ref = tag.value.type === '_' ? parentFrame.ref : tag.value;
      frame.bindings = parentFrame && tag.value.type === '_' ? [...parentFrame.bindings] : [];
      frame.shifting = parentFrame && tag.value.type === '_' ? parentFrame.shifting : false;
      frame.expanded = frame.depth === 1 && frame.coverDepth === 1;

      if (tag.value.type === '_' && parentFrame.expanded && parentFrame.depth) {
        yield tag;
      }
    } else if (tag.type === ShiftTag) {
      let doneFrame = frame;

      frame = pushFrame(doneFrame);

      frame.coverDepth = doneFrame?.coverDepth || 0;
      frame.ref = lastFrame.ref;
      frame.bindings = doneFrame && tag.value?.type === '_' ? [...doneFrame.bindings] : [];
      frame.shifting = true;
      // frame.heldProperties = [...doneFrame.heldProperties];

      yield tag;
    } else if (tag.type === BindingTag) {
      let { heldProperties } = frame;
      if (heldProperties.length) {
        let property = heldProperties[heldProperties.length - 1];
        let { tags, node } = property;
        if (!node) {
          heldProperties[heldProperties.length - 1] = buildProperty(
            Tags.fromValues(
              [
                tags[1][0] || Tags.fromValues([]),
                Tags.push(tag, tags[1][1] || Tags.fromValues([])),
              ],
              1,
            ),
          );
          frame.bindings.push(tag.value);
        }
      }
      if (!frame.ref) {
        frame = pushFrame(frame);
        frame.ref = buildReference();
      }

      if (!heldProperties.length) {
        frame.bindings.push(tag.value);
      }
    } else if (tag.type === CloseTag) {
      lastFrame = frame;

      if (!lastFrame.open?.value.type || !lastFrame.parent) {
        yield* emitHeld(lastFrame, nextTag);
      }

      frame = popFrame(frame);

      if (frame) {
        frame.heldProperties = [...lastFrame.heldProperties];
        if (!lastFrame?.coverDepth) {
          yield tag;
        }
      } else {
        if (lastFrame.expanded || lastFrame.open.value.type !== Symbol.for('_')) {
          yield tag;
        }
        break;
      }
    } else if (tag.type === GapTag || tag.type === NullTag) {
      if (frame.ref) {
        yield buildChild(ReferenceTag, frame.ref);
      }
      lastFrame = frame;

      frame = popFrame(frame);

      if (tag.type === GapTag && frame.heldProperties.length) {
        yield tag;

        frame.shifting = false;

        yield* emitHeld(frame, nextTag);
      } else {
        yield tag;
      }
    } else {
      yield tag;
    }

    tag = nextTag;
  }

  if (frame) throw new Error();
}

function* __generatePrettyCSTML(tags, options) {
  let { indent = '  ', inline: inlineOption = true } = options;

  if (!tags) {
    yield* '<//>';
    return;
  }

  let iter = getStreamIterator(prettyGroupTags(hoistTrivia(tags)));
  // let iter = getStreamIterator(prettyGroupTags(tags));
  let step;
  let indentLevel = 0;
  let first = true;
  let inline = false;
  let ref = null;

  for (;;) {
    step = iter.next();
    if (step instanceof Promise) step = yield wait(step);
    if (step.done) break;

    const tag = parseTag(step.value);

    if (tag.type === 'Effect') {
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

    if (tag.type === CloseTag) {
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

export const generatePrettyCSTML = (tags, options = freeze({})) => {
  return new StreamIterable(__generatePrettyCSTML(tags, options));
};

export const printPrettyCSTML = (tags, options = freeze({})) => {
  return stringFromStream(generatePrettyCSTML(tags, options));
};

export const getCooked = (tags) => {
  let cooked = '';

  let first = true;
  let foundLast = false;
  let depth = 0;
  let ref = null;

  for (const tag of tags) {
    let tagType = parseTagType(tag);
    if (foundLast) throw new Error();

    switch (tagType) {
      case ReferenceTag: {
        ref = parseTag(tag);
        if (depth === 1) {
          throw new Error('cookable nodes must not contain other nodes');
        }
        break;
      }

      case OpenNodeTag: {
        const { flags, attributes, literalValue, selfClosing } = parseTag(tag).value;

        depth += selfClosing ? 0 : 1;

        if (first) {
          if (flags.token) {
            break;
          } else {
            throw new Error(flags);
          }
        }

        if (!(ref.type === '#' || (ref.type === '@' && attributes.cooked))) {
          throw new Error('cookable nodes must not contain other nodes');
        }

        if (ref.type === '@') {
          const { cooked: cookedValue } = attributes;

          if (!cookedValue) throw new Error('cannot cook string: it contains uncooked escapes');

          cooked += cookedValue;
        } else if (literalValue) {
          cooked += literalValue;
        }

        break;
      }

      case CloseTag: {
        if (depth === 1) {
          foundLast = true;
        }
        depth--;
        break;
      }

      case LiteralTag: {
        if (depth === 1) {
          cooked += parseTag(tag).value;
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
  let held = false;

  if (!tags) return printed;

  for (const tag of tags) {
    let tagType = parseTagType(tag);
    if (tagType === OpenNodeTag) {
      let { literalValue } = parseTag(tag).value;
      if (literalValue) {
        printed += literalValue;
      }
    } else if (tagType === LiteralTag) {
      printed += parseTag(tag).value;
    } else if (tagType === ShiftTag) {
      held = true;
    } else if (tagType === GapTag) {
      if (held) {
        held = false;
      } else {
        throw new Error('use generateSourceTextFor');
      }
    }
  }

  return printed;
};

export function* generateSourceTextFor(tags) {
  for (const tag of tags) {
    let tagType = parseTagType(tag);
    if (tagType === LiteralTag) {
      yield* parseTag(tag).value;
    } else if (tagType === GapTag) {
      yield null;
    }
  }
}

export const sourceTextFor = printSource;
