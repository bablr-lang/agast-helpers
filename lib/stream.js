import { Coroutine } from '@bablr/coroutine';
import emptyStack from '@iter-tools/imm-stack';
import {
  getStreamIterator,
  StreamIterable,
  StreamGenerator,
  wait,
  continue_,
} from '@bablr/stream-iterator';
import * as Tags from './tags.js';
import * as BList from './b-list.js';
import { printTag } from './print.js';
import {
  buildChild,
  buildGapTag,
  buildNullTag,
  buildProperty,
  buildReference,
  parseTag,
  parseStreamTag,
  parseTagType,
  buildFullOpenNodeTag,
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
  MuxerTag,
} from './symbols.js';
import { buildNode, getRoot, isGapNode, isNode, Path, TagPath } from './path.js';
import { freeze, isPlainObject } from './object.js';
import { maybeWait } from './iterable.js';
import { arrayValues } from '@bablr/record';
import { buildParser } from './parse.js';

export { getStreamIterator, StreamIterable, StreamGenerator, wait, continue_ };

export * from './print.js';

function* __evaluateReturn(iterable) {
  let iter = getStreamIterator(iterable);
  let step;

  for (;;) {
    step = iter.next();
    while (step === null || step instanceof Promise) {
      if (step === null) yield continue_(), (step = iter.next());
      if (step instanceof Promise) step = yield wait(step);
    }
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
    while (step === null || step instanceof Promise) {
      if (step === null) yield continue_(), (step = iter.next());
      if (step instanceof Promise) step = yield wait(step);
    }
    if (step.done) break;

    let tag = step.value;
    let tagType = parseTagType(tag);

    if (tagType === DoctypeTag) {
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
        while (expressionsStep === null || expressionsStep instanceof Promise) {
          if (expressionsStep === null) yield continue_(), (expressionsStep = iter.next());
          if (expressionsStep instanceof Promise) expressionsStep = yield wait(expressionsStep);
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
  return evaluateReturn(__treeFromStream(tags, options));
};

function* __isEmpty(tags) {
  let iter = getStreamIterator(tags);
  let step;

  for (;;) {
    step = iter.next();
    while (step === null || step instanceof Promise) {
      if (step === null) yield continue_(), (step = iter.next());
      if (step instanceof Promise) step = yield wait(step);
    }
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

export function* streamFromString(input) {
  let p = buildParser(input);
  let { str } = p;
  let chr = str[p.idx];

  while (' \t\r\n'.includes(chr)) chr = str[++p.idx];

  while (p.idx < str.length) {
    yield printTag(parseTag(p));
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
    while (step === null || step instanceof Promise) {
      if (step === null) yield continue_(), (step = iter.next());
      if (step instanceof Promise) step = yield wait(step);
    }
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
    yield* 'null';
    return;
  }

  let prevTagType = null;
  let iter = getStreamIterator(prettyGroupTags(tags));
  let step;

  for (;;) {
    step = iter.next();
    while (step === null || step instanceof Promise) {
      if (step === null) yield continue_(), (step = iter.next());
      if (step instanceof Promise) step = yield wait(step);
    }
    if (step.done) break;

    const tag = step.value;
    let tagType = parseTagType(tag);

    if (tagType === ReferenceTag && prevTagType === NullTag) {
      yield* ' ';
    }

    yield* printTag(tag);

    prevTagType = tagType;
  }
}

export const generateCSTML = (tags, options = freeze({})) =>
  new StreamIterable(__generateCSTML(tags, options));

const isToken = (tag) => {
  return tag.value.flags.token;
};

export const prettyGroupTags = (tags) => new StreamIterable(__prettyGroupTags(tags));

function* __prettyGroupTags(tags) {
  let states = emptyStack.push({ holding: [], broken: false, open: null });
  let state = states.value;
  let iter = getStreamIterator(tags);
  let step;

  for (;;) {
    step = iter.next();

    while (step === null || step instanceof Promise) {
      if (step === null) yield continue_(), (step = iter.next());
      if (step instanceof Promise) step = yield wait(step);
    }
    if (step.done) break;

    let tag_ = step.value;
    let tag = parseTag(tag_);
    let isOpenClose = tag.type === CloseNodeTag || tag.type === OpenNodeTag;

    if (
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
      state.holding.push(tag_);
    }

    if (!state.holding.length && !isOpenClose) {
      yield step.value;
    }

    if (tag.type === CloseNodeTag) {
      if (!state.broken && (isToken(state.open) || state.holding.length === 1)) {
        let { flags, type, name, attributes } = parseTag(state.holding[0]).value;

        let literal = state.holding
          .slice(1)
          .map((lit) => parseTag(lit).value)
          .join('');

        yield printTag(buildFullOpenNodeTag(flags, type, name, literal, attributes, true));
      } else {
        if (state.holding.length) {
          yield* state.holding;
        }
        yield step.value;
      }

      states = states.pop();
      state = states.value;
    }

    if (tag.type === OpenNodeTag) {
      if (tag.value.selfClosing) {
        yield step.value;
      } else {
        states = states.push({ holding: [tag_], broken: false, open: tag });

        state = states.value;
      }
    }
  }
}

function* __transformStream(tags, stream, strategy) {
  let iter = getStreamIterator(tags);
  let step;
  let str = '';
  let stream_ = 1;
  let transforming = stream === stream_;
  let alreadyAdvanced = false;

  function* __streamTags() {
    for (;;) {
      while (step === null || step instanceof Promise) {
        if (step === null) yield continue_(), (step = iter.next());
        if (step instanceof Promise) step = yield wait(step);
      }
      if (step.done) break;

      let tag = parseStreamTag(step.value);

      if (tag.type === MuxerTag) {
        if (tag.value.stream !== stream) {
          transforming = false;
          yield continue_();
        }

        stream_ = tag.value.stream;
      } else {
        yield step.value;
      }

      step = iter.next();
    }
  }

  let strategyIter = getStreamIterator(strategy(new StreamGenerator(__streamTags())));
  let strategyStep;

  for (;;) {
    if (!alreadyAdvanced) {
      step = iter.next();
    }
    alreadyAdvanced = false;
    while (step === null || step instanceof Promise) {
      if (step === null) yield continue_(), (step = iter.next());
      if (step instanceof Promise) step = yield wait(step);
    }
    if (step.done) break;

    let tag = parseStreamTag(step.value);

    if (transforming) {
      strategyStep = strategyIter.next();

      while (strategyStep !== null) {
        if (strategyStep instanceof Promise) strategyStep = yield wait(strategyStep);
        if (strategyStep) {
          if (strategyStep.done) break;
          yield strategyStep.value;

          strategyStep = strategyIter.next();
        }
      }
      if (step.done) break;
      tag = parseStreamTag(step.value);
      if (tag.type === MuxerTag) {
        stream_ = tag.value.stream;
      } else {
        throw new Error();
      }
      yield step.value;
      transforming = stream_ === stream;
    } else {
      if (tag.type === MuxerTag) {
        stream_ = tag.value.stream;

        yield step.value;

        if (stream_ === stream) {
          transforming = true;
          alreadyAdvanced = true;
        } else {
          transforming = false;
        }
      } else {
        yield step.value;
      }
    }
  }
}

export const transformStream = (tags, stream, strategy) => {
  return new StreamIterable(__transformStream(tags, stream, strategy));
};

function* __transformStreams(tags, strategy) {
  let iter = getStreamIterator(tags);
  let step;
  let str = '';
  let streamTag = '<-1>';
  let alreadyAdvanced = false;
  let strategyStep;
  let streams = new Map();

  function* __streamTags(streamTag) {
    for (;;) {
      while (step === null || step instanceof Promise) {
        if (step === null) yield continue_(), (step = iter.next());
        if (step instanceof Promise) step = yield wait(step);
      }
      if (step.done) break;

      let tag = parseStreamTag(step.value);

      if (tag.type === MuxerTag) {
        if (printTag(streamTag) !== printTag(tag)) {
          yield continue_();
        }

        streamTag = step.value;
      } else {
        yield step.value;
      }

      step = iter.next();
    }
  }

  for (;;) {
    if (!alreadyAdvanced) {
      step = iter.next();
    }
    alreadyAdvanced = false;
    while (step === null || step instanceof Promise) {
      if (step === null) yield continue_(), (step = iter.next());
      if (step instanceof Promise) step = yield wait(step);
    }
    if (step.done) break;

    let tag = parseStreamTag(step.value);

    streams[streamTag] ||= getStreamIterator(
      strategy(new StreamGenerator(__streamTags(parseStreamTag(streamTag)))),
    );

    strategyStep = streams[streamTag].next();

    while (strategyStep !== null) {
      if (strategyStep instanceof Promise) strategyStep = yield wait(strategyStep);
      if (strategyStep) {
        if (strategyStep.done) break;
        yield strategyStep.value;

        strategyStep = streams[streamTag].next();
      }
    }
    if (step.done) break;
    tag = parseStreamTag(step.value);
    if (tag.type === MuxerTag) {
      streamTag = step.value;

      yield step.value;

      alreadyAdvanced = true;
    } else {
      throw new Error();
    }
  }
}

export const transformStreams = (tags, strategy) => {
  return new StreamIterable(__transformStreams(tags, strategy));
};

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

export const streamFromTree = (tree, options = freeze({})) => {
  if (tree && !isPlainObject(tree)) throw new Error();

  return __streamFromTree(null, tree, options);
};

function* __streamFromTree(doctypeTag, rootNode, options) {
  const { unshift = false, getGapNode, checkBalance = true } = options;
  if (!rootNode || !Tags.getSize(Tags.getTags(rootNode))) return;

  let tagPath = TagPath.fromNode(rootNode, 0);
  let count = 0;
  let stack = [{ tagPath, count }];

  if (doctypeTag) {
    yield doctypeTag;
  }

  do {
    ({ tagPath, count } = stack.pop());
    do {
      if (tagPath.type === OpenNodeTag && !tagPath.value.selfClosing) count++;
      if (tagPath.type === CloseNodeTag) count--;

      let gapNode;
      if (
        getGapNode &&
        tagPath.type === GapTag &&
        (gapNode = getGapNode(tagPath.path.node)) &&
        gapNode !== tagPath.path.node
      ) {
        stack.push({ tagPath: unshift ? tagPath.nextUnshifted : tagPath.next, count });
        tagPath = TagPath.fromNode(gapNode, 0);
        count = 0;
      }

      if (!(tagPath.type === AttributeDefinition)) {
        yield tagPath.tag;
      }
    } while ((tagPath = unshift ? tagPath.nextUnshifted : tagPath.next));
  } while (stack.length);

  if (checkBalance && count !== 0) throw new Error();
}

function* emitHeld(frame, nextTag) {
  if (frame.ref?.flags.expression && nextTag?.type === ShiftTag) return;

  for (let property of frame.heldProperties) {
    let { reference, bindings, node } = property;
    yield printTag(buildChild(ReferenceTag, reference));
    let isAnonymous = node.value.flags.token && !node.value.name;
    if (!isAnonymous) {
      for (let binding of arrayValues(bindings)) {
        yield printTag(buildChild(BindingTag, binding));
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

  while (co.current === null || co.current instanceof Promise) {
    if (co.current === null) yield continue_(), co.advance();
    if (co.current instanceof Promise) co.current = yield wait(co.current);
  }

  let firstTag = parseTag(co.value);

  co.advance();

  while (co.current === null || co.current instanceof Promise) {
    if (co.current === null) yield continue_(), co.advance();
    if (co.current instanceof Promise) co.current = yield wait(co.current);
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

      while (co.current === null || co.current instanceof Promise) {
        if (co.current === null) yield continue_(), co.advance();
        if (co.current instanceof Promise) co.current = yield wait(co.current);
      }
    }
    alreadyAdvanced = false;

    nextTag = co.done ? nextTag : parseTag(co.value);

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
                  BList.fromValues(
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
              BList.fromValues(
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
          yield printTag(buildChild(ReferenceTag, frame.ref));
          let isAnonymous = tag.value.flags.token && !tag.value.name;
          if (!isAnonymous) {
            for (let binding of frame.bindings) {
              yield printTag(buildChild(BindingTag, binding));
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
            yield printTag(tag);

            break;
          } else {
            yield printTag(tag);
          }
        } else {
          if (!isCover || !parentFrame) {
            yield printTag(tag);
          }
        }
      }
    } else if (tag.type === ReferenceTag) {
      let parentFrame = frame;

      frame = pushFrame(parentFrame);

      if (tag.value.type === '#' && !tag.value.name) {
        frame.heldProperties.push(buildProperty(BList.fromValues([printTag(tag)])));
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
        yield printTag(tag);
      }
    } else if (tag.type === ShiftTag) {
      let doneFrame = frame;

      frame = pushFrame(doneFrame);

      frame.coverDepth = doneFrame?.coverDepth || 0;
      frame.ref = lastFrame.ref;
      frame.bindings = doneFrame && tag.value?.type === '_' ? [...doneFrame.bindings] : [];
      frame.shifting = true;
      // frame.heldProperties = [...doneFrame.heldProperties];

      yield printTag(tag);
    } else if (tag.type === BindingTag) {
      let { heldProperties } = frame;
      if (heldProperties.length) {
        let property = heldProperties[heldProperties.length - 1];
        let { tags, node } = property;
        if (!node) {
          heldProperties[heldProperties.length - 1] = buildProperty(
            BList.fromValues(
              [
                tags[1][0] || Tags.fromValues([]),
                Tags.push(printTag(tag), tags[1][1] || Tags.fromValues([])),
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
    } else if (tag.type === CloseNodeTag) {
      lastFrame = frame;

      if (!lastFrame.open?.value.type || !lastFrame.parent) {
        yield* emitHeld(lastFrame, nextTag);
      }

      frame = popFrame(frame);

      if (frame) {
        frame.heldProperties = [...lastFrame.heldProperties];
        if (!lastFrame?.coverDepth) {
          yield printTag(tag);
        }
      } else {
        if (lastFrame.expanded || lastFrame.open.value.type !== Symbol.for('_')) {
          yield printTag(tag);
        }
        break;
      }
    } else if (tag.type === GapTag || tag.type === NullTag) {
      if (frame.ref) {
        yield printTag(buildChild(ReferenceTag, frame.ref));
      }
      lastFrame = frame;

      frame = popFrame(frame);

      if (tag.type === GapTag && frame.heldProperties.length) {
        yield printTag(tag);

        frame.shifting = false;

        yield* emitHeld(frame, nextTag);
      } else {
        yield printTag(tag);
      }
    } else {
      yield printTag(tag);
    }

    tag = nextTag;
  }

  if (frame) throw new Error();
}

function* __generatePrettyCSTML(tags, options) {
  let { indent = '  ', inline: inlineOption = true } = options;

  if (!tags) {
    yield* 'null';
    return;
  }

  let iter = getStreamIterator(prettyGroupTags(hoistTrivia(tags)));
  let step;
  let indentLevel = 0;
  let inline = false;
  let ref = null;

  for (;;) {
    step = iter.next();
    while (step === null || step instanceof Promise) {
      if (step === null) yield continue_(), (step = iter.next());
      if (step instanceof Promise) step = yield wait(step);
    }
    if (step.done) break;

    const tag = parseTag(step.value);

    inline =
      inlineOption &&
      inline &&
      ref &&
      (tag.type === NullTag ||
        tag.type === GapTag ||
        tag.type === BindingTag ||
        (tag.type === OpenNodeTag && tag.value.selfClosing));

    if (!inline) {
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

      case CloseNodeTag: {
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

export function* interpolateFragment(tags) {
  let tags_ = isNode(tags) ? Tags.traverseInner(Tags.getTags(tags)) : tags;
  let lastTag = null;
  let first = true;
  let dropFirst = false;
  let depth = 0;
  for (let tag of tags_) {
    let tagType = parseTagType(tag);
    if (lastTag) yield lastTag;

    if (tagType === OpenNodeTag && !parseTag(tag).value.selfClosing) depth++;
    if (tagType === CloseNodeTag) depth--;

    dropFirst ||= first && tag === '<__>';
    lastTag = first && dropFirst ? null : tag;
    first = false;
  }
  if (dropFirst) {
    if (lastTag !== '</>') throw new Error();
  } else {
    yield lastTag;
  }

  if (depth !== 0) throw new Error();
}
