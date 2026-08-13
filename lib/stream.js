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
import { printHashTag, printSums, printTag } from './print.js';
import {
  buildChild,
  buildGapTag,
  buildNullTag,
  buildReference,
  buildFullOpenNodeTag,
  buildLiteralTag,
  buildOpenNodeTag,
  buildReferenceTag,
  buildBindingTag,
  buildHashTag,
  buildSumsTag,
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
  Property,
  EscapeTag,
  BinaryTag,
  HashTag,
  SumsTag,
  EmptyTag,
} from './symbols.js';
import { buildNode, buildProperty, getRoot, isGapNode, isNode, Path, TagPath } from './path.js';
import {
  arrayLast,
  freeze,
  freezeRecord,
  isPlainObject,
  arrayValues,
  isRecord,
  isArray,
} from './object.js';
import { evaluateReturn, stringFromStream } from './iterable.js';
import { buildParser, inRange } from './parse.js';
import {
  canStartIdentifier,
  canContinueIdentifier,
  parseStreamTag,
  parseTag,
  parseTagType,
} from './parsers.js';

function* ___treeFromStream(tags, options) {
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
      path = Path.fromTag(tag);

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
          ? buildNode('<//>')
          : path == null || expressionsStep.value == null
          ? buildNode('null ')
          : expressionsStep.value;

        path = path.advance(node);
      }
    } else {
      path = path.advance(tag);
    }
  }

  if (path.depth) {
    throw new Error('imbalanced tag stack');
  }

  return path?.node;
}

export const __treeFromStream = (tags, options = freeze({})) => {
  return new StreamIterable(___treeFromStream(tags, options));
};

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

        break;

      case CloseNodeTag:
        --depth;
        break;

      case LiteralTag:
      case GapTag:
      case EscapeTag:
      case BinaryTag:
        return false;
    }
  }

  return true;
}

export const isEmpty = (tags) =>
  new StreamIterable(__isEmpty(tags))[Symbol.iterator]().next().value;

export function* streamFromString(input, options = {}) {
  let porcelain = { porcelain: !!options.porcelain };
  let p = buildParser(input);
  let { str } = p;
  let chr = str[p.idx];

  while (' \t\r\n'.includes(chr)) chr = str[++p.idx];

  while (p.idx < str.length) {
    let tag = parseTag(p);
    yield printTag(tag, porcelain);
    chr = str[p.idx];

    while (' \t\r\n'.includes(chr)) chr = str[++p.idx];
  }
}

function* __emptyStreamIterator() {}

export const emptyStreamIterator = () => new StreamIterable(__emptyStreamIterator());

const isToken = (tag) => {
  return tag.value.flags.token;
};

export const groupTags = (tags, options = {}) => new StreamIterable(__groupTags(tags, options));

function* __groupTags(tags, options) {
  let { porcelain } = options;
  let states = emptyStack.push({ holding: [], broken: false, open: null });
  let state = states.value;
  let iter = getStreamIterator(tags);
  let step;
  let ref = null;

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
        HashTag,
        SumsTag,
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
    } else if (tag.type === LiteralTag || tag.type === EscapeTag) {
      let heldType = parseTagType(arrayLast(state.holding));
      if (
        (heldType && [LiteralTag, EscapeTag].includes(heldType) && heldType !== tag.type) ||
        heldType === EscapeTag
      ) {
        state.broken = true;

        if (state.holding.length) {
          yield* state.holding;
          state.holding = [];
        }
      } else {
        state.holding.push(tag_);
      }
    }

    if (!state.holding.length && !isOpenClose) {
      yield step.value;
    }

    if (tag.type === CloseNodeTag) {
      if (!state.broken && (isToken(state.open) || state.holding.length === 1)) {
        let { flags, type, name, attributes } = parseTag(state.holding[0]).value;

        let literal =
          state.holding.length === 2 && parseTagType(state.holding[1]) === EscapeTag
            ? parseTag(state.holding[1])
            : state.holding.length > 1
            ? buildLiteralTag(
                state.holding
                  .slice(1)
                  .map((lit) => parseTag(lit).value)
                  .join(''),
              )
            : null;

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

    if (tag.type === ReferenceTag) {
      ref = tag;
    }

    if (tag.type === OpenNodeTag) {
      if (tag.value.selfClosing) {
        yield step.value;
      } else {
        states = states.push({ holding: [tag_], broken: false, open: tag });

        state = states.value;
      }

      if (porcelain && (!ref || !ref.value.flags.intrinsic)) {
        state.broken = true;
      }
      ref = null;
    }

    if (tag.type === NullTag || tag.type === GapTag) {
      ref = null;
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
  let streamTag = '<0-1>';
  let alreadyAdvanced = false;
  let strategyStep;
  let streams = new Map();
  let continueHandled = true;

  function* __streamTags(streamTag_) {
    for (;;) {
      while (step === null || step instanceof Promise) {
        if (step === null) yield continue_(), (step = iter.next());
        if (step instanceof Promise) step = yield wait(step);
      }
      if (step.done) break;

      let tag = parseStreamTag(step.value);

      if (tag.type === MuxerTag) {
        if (printTag(streamTag_) !== printTag(tag)) {
          continueHandled = false;
          yield continue_();
          if (!continueHandled) throw new Error('stream transform swallowed yield continue');
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

    continueHandled = true;

    while (strategyStep !== null) {
      if (strategyStep instanceof Promise) strategyStep = yield wait(strategyStep);
      if (strategyStep) {
        if (strategyStep.done) break;
        yield strategyStep.value;

        strategyStep = streams[streamTag].next();
        continueHandled = true;
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
    hash: null,
    sums: null,
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

export const streamFromTree = (tree, options = {}) => {
  if (tree && !isPlainObject(tree)) throw new Error();

  return __streamFromTree(null, tree, options);
};

function* __streamFromTree(doctypeTag, rootNode, options) {
  let { unshift = false, getGapNode = false, checkBalance = true, sums = false } = options;
  if (!rootNode || !Tags.getSize(Tags.getTags(rootNode))) return;

  let rootIsFragment = rootNode.value.type === Symbol.for('__');

  let tagPath = TagPath.fromNode(rootNode);
  let count = 0;
  let stack = [{ tagPath, count }];

  if (!tagPath) return;

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
        tagPath = TagPath.fromNode(gapNode);
        count = 0;
      }

      if (tagPath.type !== AttributeDefinition && (sums || tagPath.type !== SumsTag)) {
        yield tagPath.tag;
      }
    } while ((tagPath = unshift ? tagPath.nextUnshifted : tagPath.next));
  } while (stack.length);

  if (checkBalance && count !== 0) throw new Error();
}

function* emitHeld(frame, nextTag) {
  if (frame.ref?.flags.expression && nextTag?.type === ShiftTag) return;

  for (let tags of frame.heldProperties) {
    let { 0: refTag, 1: bindings, 2: hash, 3: sums, 4: node } = tags[1];

    if (refTag !== '.:') yield refTag;

    if (bindings) {
      yield* BList.traverse(bindings);
    }
    if (hash) {
      yield hash;
    }
    if (sums) {
      yield sums;
    }
    yield* streamFromTree(node);
  }
  frame.heldProperties = [];
}

export const hoist = (tags) => {
  const co = new Coroutine(getStreamIterator(tags));

  return new StreamIterable(__hoistOuter(co));
};

function* __hoistOuter(co) {
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

  yield* ___hoist(co, firstTag);
}

function* ___hoist(co, firstTag) {
  let frame = null;
  let lastFrame = null;
  let alreadyAdvanced = true;
  let tag = firstTag;

  let nextTag;

  nextTag = parseTag(co.value);

  for (;;) {
    if (co.done && !nextTag) break;
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

          if (heldProperty[1][4]) {
            throw new Error();
          }

          let node = yield* ___treeFromStream(new StreamIterable(___hoist(co, tag)), freeze({}));

          if (node instanceof Promise) {
            node = yield wait(node);
          }

          if (node.value.type === Symbol.for('_')) {
            let leading = true;
            for (let property of Tags.traverse(node.value.children)) {
              if (property.value.reference.type === '_') {
                leading = false;
                frame.heldProperties[heldProperties.length - 1] = BList.fromValues(
                  [
                    heldProperty[1][0],
                    heldProperty[1][1] || '',
                    heldProperty[1][2] || '',
                    heldProperty[1][3] || '',
                    getRoot(node),
                  ],
                  1,
                );
              } else {
                if (leading) {
                  let top = frame.heldProperties.pop();
                  frame.heldProperties.push(property.tags);
                  frame.heldProperties.push(top);
                } else {
                  frame.heldProperties.push(property.tags);
                }
              }
            }
          } else {
            frame.heldProperties[heldProperties.length - 1] = BList.fromValues(
              [
                heldProperty[1][0],
                heldProperty[1][1] || '',
                heldProperty[1][2] || '',
                heldProperty[1][3] || '',
                node,
              ],
              1,
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
          let refTag = printTag(buildChild(ReferenceTag, frame.ref));
          if (refTag !== '.:') yield refTag;
          let isAnonymous = tag.value.flags.token && !tag.value.name;
          if (!isAnonymous) {
            for (let binding of frame.bindings) {
              yield printTag(buildChild(BindingTag, binding));
            }
            if (frame.hash) {
              yield printTag(buildChild(HashTag, frame.hash));
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
            frame.ref = parentFrame ? buildReference() : buildReference('_');
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
        frame.heldProperties.push(BList.fromValues([printTag(tag)]));
      } else {
        if (!parentFrame.shifting) {
          yield* emitHeld(frame, nextTag);
        }
      }

      frame.coverDepth = parentFrame?.coverDepth ?? 0;
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
      frame.heldProperties = [...doneFrame.heldProperties];

      yield printTag(tag);
    } else if (tag.type === BindingTag) {
      if (frame.open) {
        frame = pushFrame(frame);
        frame.ref = buildReference();
      }

      let { heldProperties } = frame;
      if (heldProperties.length) {
        let tags = heldProperties[heldProperties.length - 1];

        if (!tags[1][4]) {
          heldProperties[heldProperties.length - 1] = BList.fromValues(
            [tags[1][0] || '', BList.push(printTag(tag), tags[1][1] || BList.create())],
            1,
          );
          frame.bindings.push(tag.value);
        }
      }

      if (!heldProperties.length) {
        frame.bindings.push(tag.value);
      }
    } else if (tag.type === HashTag) {
      if (frame.open) {
        frame = pushFrame(frame);
        frame.ref = buildReference();
      }
      let { heldProperties } = frame;
      if (heldProperties.length) {
        let property = heldProperties[heldProperties.length - 1];
        let { tags, node } = property;
        if (!node) {
          heldProperties[heldProperties.length - 1] = BList.fromValues(
            [tags[1][0] || '', tags[1][1] || '', printTag(tag)],
            1,
          );
          frame.hash = tag.value;
        }
      }

      if (!heldProperties.length) {
        frame.hash = tag.value;
      }
    } else if (tag.type === SumsTag) {
      if (frame.open) {
        frame = pushFrame(frame);
        frame.ref = buildReference();
      }
      let { heldProperties } = frame;
      if (heldProperties.length) {
        let tags = heldProperties[heldProperties.length - 1];

        if (!tags[1][4]) {
          heldProperties[heldProperties.length - 1] = BList.fromValues(
            [tags[1][0] || '', tags[1][1] || '', tags[1][2] || '', printTag(tag)],
            1,
          );

          frame.sums = tag.value;
        }
      }

      if (!heldProperties.length) {
        frame.sums = tag.value;
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
      if (frame.open) {
        frame = pushFrame(frame);
        frame.ref = buildReference();
      }

      if (frame.ref) {
        let refTag = printTag(buildChild(ReferenceTag, frame.ref));
        if (refTag !== '.:') yield refTag;
      }
      if (frame.hash) {
        yield printTag(buildChild(HashTag, frame.hash));
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
    } else if (tag.type === Property) {
      throw new Error();
    } else {
      yield printTag(tag);
    }

    tag = nextTag;
  }

  if (frame) throw new Error();
}

function* __generateCSTML(tags, options) {
  let pcl = options.porcelain;
  let { indent = '  ', inline: inlineOption = true } = options;

  if (!tags) {
    yield* pcl ? '<__/>' : '<__ />';
    return;
  }

  let tags_ = tags;

  if (options.hoist !== false) {
    tags_ = hoist(tags_);
  }

  if (options.group !== false) {
    tags_ = groupTags(tags_, { porcelain: pcl });
  }

  let prevTag = null;
  let iter = getStreamIterator(tags_);
  let step;
  let indentLevel = 0;
  let inline = false;
  let ref = null;
  let printOptions = pcl ? { porcelain: true } : {};

  for (;;) {
    step = iter.next();
    while (step === null || step instanceof Promise) {
      if (step === null) yield continue_(), (step = iter.next());
      if (step instanceof Promise) step = yield wait(step);
    }
    if (step.done) break;

    let tag = parseTag(step.value);

    if (tag.type === EmptyTag) {
      continue;
    }

    if (pcl && !ref && (tag.type === BindingTag || tag.type === HashTag || Tags.startsNode(tag))) {
      yield '.:';
    }

    inline =
      inlineOption &&
      inline &&
      ref &&
      (tag.type === NullTag ||
        tag.type === GapTag ||
        tag.type === BindingTag ||
        tag.type === HashTag ||
        tag.type === SumsTag ||
        (tag.type === OpenNodeTag && tag.value.selfClosing));

    if (!inline && !pcl) {
      yield* '\n';
    }

    if ([CloseNodeTag, NullTag, GapTag].includes(tag.type)) {
      ref = null;
    }

    if (tag.type === CloseNodeTag) {
      indentLevel--;
    }

    if (!pcl) {
      if (!inline) {
        yield* indent.repeat(Math.max(0, indentLevel));
      } else {
        yield* ' ';
      }
    }

    yield* pcl ? printTag(tag, printOptions) : printTag(tag);

    if (tag.type === ReferenceTag) {
      inline = true;
      ref = tag;
    }

    if (tag.type === OpenNodeTag) {
      indentLevel += tag.value.selfClosing ? 0 : 1;
    }

    prevTag = tag;
  }

  if (indentLevel !== 0 && options.checkBalance) {
    throw new Error('imbalanced tags');
  }

  if (!pcl) {
    yield* '\n';
  }
}

export const generateCSTML = (tags, options = freezeRecord({})) => {
  if (!isRecord(options)) throw new Error();

  return new StreamIterable(__generateCSTML(tags, options));
};

export const printCSTML = (tags, options = freezeRecord({})) => {
  return stringFromStream(generateCSTML(tags, options));
};

let getPatternForSpan = (span) => {
  switch (span) {
    case 'GapTag':
      return '<//>';
    case 'NullTag':
      return 'null ';
    case 'CloseNodeTag':
      return '</>';
    case 'True':
      return 'true';
    case 'False':
      return 'false';
    case 'Null':
      return 'null';
    case 'Undefined':
      return 'undefined';
    case 'NaN':
      return 'NaN';
    default:
      throw new Error();
  }
};

let getValueForSpan = (span) => {
  switch (span) {
    case 'True':
      return true;
    case 'False':
      return false;
    case 'Null':
      return null;
    case 'Undefined':
      return undefined;
    case 'NaN':
      return NaN;
    default:
      throw new Error();
  }
};

export const parseCSTML = (text) => {
  return new StreamIterable(__parseCSTML(text));
};

let done_ = Symbol('done');

function* __parseCSTML(text) {
  let co = new Coroutine(getStreamIterator(text));

  co.advance();

  while (co.current === null || co.current instanceof Promise) {
    if (co.current === null) yield continue_(), co.advance();
    if (co.current instanceof Promise) co.current = yield wait(co.current);
  }

  let stack = [];
  let span = 'Bare';
  let refName = null;
  let state = {};
  let chr = null;
  let nextChr = co.value;
  let literal = '';
  let take = 1;
  let poppedState = null;

  let push = (newStateName, newRefName) => {
    stack.push({ span, refName, state });
    span = newStateName;
    refName = newRefName;
    state = null;
  };

  let pop = (value) => {
    poppedState = state;
    let parentState = arrayLast(stack).state;
    if (refName) {
      if (isArray(parentState[refName])) {
        parentState[refName].push(value);
      } else {
        parentState[refName] = value;
      }
    }
    ({ span, refName, state } = stack.pop());
    return value;
  };

  for (;;) {
    if (chr === done_) break;

    for (let i = 0; i < take; i++) {
      co.advance();

      while (co.current === null || co.current instanceof Promise) {
        if (co.current === null) yield continue_(), co.advance();
        if (co.current instanceof Promise) co.current = yield wait(co.current);
      }

      chr = nextChr;
      nextChr = co.done ? done_ : co.value;
    }
    take = 1;

    if (chr === done_) break;

    switch (span) {
      case 'Bare': {
        if (chr === '<') {
          push('BracedTag');
          literal += chr;
        } else if (chr === ':') {
          push('BindingTag');
          take = 0;
        } else if (chr === '#' && nextChr === '#') {
          push('HashTag');
          take = 0;
        } else if (chr === '#' && nextChr === '[') {
          push('SumsTag');
          take = 0;
        } else if (canStartIdentifier(chr) || '#._'.includes(chr)) {
          push('ReferenceTag');
          take = 0;
        } else {
          throw new Error();
        }

        break;
      }

      case 'BracedTag': {
        if (chr === '/') {
          literal += chr;
          if (nextChr === '/') {
            span = 'GapTag';
          } else if (nextChr === '>') {
            span = 'CloseNodeTag';
          }
        } else if ('*_`>'.includes(nextChr) || canStartIdentifier(nextChr)) {
          span = 'OpenNodeTag';
          take = 0;
        } else {
          throw new Error('unknown tag type');
        }
        break;
      }

      case 'LiteralTag': {
        if (!state) {
          state = {};
          push('String', 'value');
        } else {
          pop(buildLiteralTag(state.value));
        }
        take = 0;
        break;
      }

      case 'ReferenceTag': {
        if (!state) {
          state = {};
        }
        if (state.type === undefined) {
          if (chr === '.' || chr === '#' || chr === '_') {
            state.type = chr;
            if (nextChr === '_') {
              state.type = '__';
              take = 2;
            }
          } else {
            state.type = null;
            take = 0;
          }
        } else if (state.name === undefined) {
          if (canStartIdentifier(chr)) {
            push('Identifier', 'name');
            take = 0;
          } else {
            if (!state.type) {
              throw new Error();
            }
            state.name = null;
            take = 0;
          }
        } else if (state.flags === undefined) {
          push('ReferenceFlags', 'flags');
          take = 0;
        } else if (state.sigilToken === undefined) {
          if (chr !== ':') throw new Error();
          state.sigilToken = chr;
        } else {
          let { type, name, flags } = state;
          yield printTag(buildReferenceTag(type, name, flags));
          pop();
          take = 0;
        }
        break;
      }

      case 'ReferenceFlags': {
        state ||= {
          array: undefined,
          expression: undefined,
          intrinsic: undefined,
          hasGap: undefined,
        };

        if (state.array === undefined) {
          if (chr === '[') {
            state.array = true;
            if (nextChr !== ']') throw new Error();
            take = 2;
          } else {
            state.array = false;
            take = 0;
          }
        } else if (state.expression === undefined) {
          if (chr === '+') {
            state.expression = true;
          } else {
            state.expression = false;
            take = 0;
          }
        } else if (state.intrinsic === undefined) {
          if (chr === '*') {
            state.intrinsic = true;
          } else {
            state.intrinsic = false;
            take = 0;
          }
        } else if (state.hasGap === undefined) {
          if (chr === '$') {
            state.hasGap = true;
          } else {
            state.hasGap = false;
            take = 0;
          }
        } else {
          if (state.intrinsic && state.hasGap) throw new Error();

          pop(freezeRecord(state));
          take = 0;
        }
        break;
      }

      case 'BindingTag': {
        if (!state) {
          state = { openToken: undefined, name: undefined, type: undefined, closeToken: undefined };
          literal = '';
        }

        if (!state.openToken) {
          if (chr !== ':') throw new Error();
          state.openToken = chr;
        } else if (state.type === undefined) {
          if (chr === '.' && nextChr == '.') {
            state.type = '..';
            take = 2;
          } else {
            state.type = null;
            take = 0;
          }
        } else if (state.name === undefined) {
          take = 0;
          if (canStartIdentifier(chr)) {
            push('Identifier', 'name');
          } else {
            state.name = null;
          }
        } else if (chr === ':') {
          state.closeToken = chr;
          let { type, name } = state;
          yield printTag(buildBindingTag(type, name));
          pop();
        }

        break;
      }

      case 'HashTag': {
        if (!state) {
          state = { openToken: undefined, hash: undefined, closeToken: undefined };
          literal = '';
        }

        if (!state.openToken) {
          if (chr !== '#' || nextChr !== '#') throw new Error();
          state.openToken = '##';
          take = 2;
        } else if (state.hash === undefined) {
          take = 0;
          if (canStartIdentifier(chr)) {
            push('Base64', 'hash');
          } else {
            state.hash = null;
          }
        } else if (chr === '#' && nextChr === '#') {
          state.closeToken = '##';
          let { hash } = state;
          yield printTag(buildHashTag(hash));
          pop();
          take = 2;
        }

        break;
      }

      case 'Base64': {
        if (!state) {
          state = '';
        }
        if (
          inRange(chr, 'a', 'z') ||
          inRange(chr, 'A', 'Z') ||
          inRange(chr, '0', '9') ||
          chr === '+' ||
          chr === '/'
        ) {
          state += chr;
        } else {
          pop(state);
          take = 0;
        }
        break;
      }

      case 'SumsTag': {
        if (!state) {
          state = { sums: [], separators: 0 };
          literal = '';
        }

        if (!state.openToken) {
          if (chr !== '#' || nextChr !== '[') throw new Error();
          state.openToken = '#[';
          take = 2;
        } else {
          if (chr === ']' && nextChr === '#') {
            state.closeToken = ']#';
            let { sums } = state;
            yield printTag(buildSumsTag(sums));
            pop();
            take = 2;
          } else {
            if (chr === ',' && state.sums.length >= state.separators) {
              ++state.separators;
            } else {
              push('JSONExpression', 'sums');
              take = 0;
            }
          }
        }

        break;
      }

      case 'NullTag':
      case 'CloseNodeTag':
      case 'GapTag': {
        if (state === null) {
          state = literal;
          literal = '';
        }
        let pattern = getPatternForSpan(span);

        if (chr !== pattern[state.length]) throw new Error();
        state += chr;

        if (state.length === pattern.length) {
          yield state;
          pop();
        }

        break;
      }

      case 'OpenNodeTag': {
        state ||= {};
        if (state.flags === undefined) {
          push('NodeFlags', 'flags');
          literal = '';
          take = 0;
        } else if (state.type === undefined) {
          if (chr === '_') {
            push('NodeType', 'type');
            literal = '';
          } else {
            state.type = null;
          }
          take = 0;
        } else if (state.name === undefined) {
          if (canStartIdentifier(chr)) {
            push('Identifier', 'name');
            literal = '';
          } else {
            state.name = null;
          }
          take = 0;
        } else if (state.literalValue === undefined) {
          if (chr === "'" || chr === '"') {
            push('LiteralTag', 'literalValue');
            literal = '';
          } else {
            state.literalValue = null;
          }
          take = 0;
        } else if (state.attributes === undefined) {
          if (chr === '{') {
            push('Object', 'attributes');
            literal = '';
          } else {
            state.attributes = freezeRecord({});
          }
          take = 0;
        } else if (state.selfClosing === undefined) {
          state.selfClosing = chr === '/';
          if (!state.selfClosing) {
            take = 0;
          }
        } else {
          if (chr !== '>') throw new Error();

          let { flags, type, name, literalValue, attributes, selfClosing } = state;

          yield printTag(
            buildFullOpenNodeTag(flags, type, name, literalValue, attributes, selfClosing),
          );

          pop();
          literal = '';
        }

        break;
      }

      case 'NodeType': {
        if (chr === '_') {
          literal += chr;

          if (literal === '__') {
            pop(Symbol.for(literal));
          }
        } else {
          pop(literal ? Symbol.for(literal) : null);

          take = 0;
        }
        break;
      }

      case 'Array': {
        if (!state) {
          state = { elements: [], separators: 0 };
        }

        if (!state.openToken) {
          if (chr !== '[') throw new Error();
          state.openToken = chr;
        } else if (chr === ']') {
          state.closeToken = chr;
          pop(freezeRecord(state.elements));
        } else {
          if (chr === ',' && state.elements.length >= state.separators) {
            ++state.separators;
          } else {
            push('JSONExpression', 'elements');
          }
        }

        break;
      }

      case 'Object': {
        if (!state) {
          state = { properties: [], separators: 0 };
        }

        if (!state.openToken) {
          if (chr !== '{') throw new Error();
          state.openToken = chr;
        } else if (chr === '}') {
          state.closeToken = chr;
          pop(freezeRecord(Object.fromEntries(state.properties)));
        } else {
          if (chr === ',' && state.properties.length >= state.separators) {
            ++state.separators;
          } else {
            push('ObjectProperty', 'properties');
            take = 0;
          }
        }

        break;
      }

      case 'ObjectProperty': {
        if (!state) {
          state = { key: undefined, sigilToken: undefined, value: undefined };
        }

        if (state.key === undefined) {
          if (chr === '"' || chr === "'") {
            push('String', 'key');
            literal = '';
            take = 0;
          } else if (chr === '`' || canStartIdentifier(chr)) {
            push('Identifier', 'key');
            literal = '';
            take = 0;
          } else {
            throw new Error();
          }
        } else if (state.sigilToken === undefined) {
          if (chr !== ':') throw new Error();
          state.sigilToken = chr;
        } else if (state.value === undefined) {
          push('JSONExpression', 'value');
          literal = '';
          take = 0;
        } else {
          pop([state.key, state.value]);
          take = 0;
        }
        break;
      }

      case 'String': {
        if (!state) {
          state = {};
        }

        if (!state.openToken) {
          if (chr === "'" || chr === '"') {
            state.openToken = chr;
            state.content = '';
          } else {
            throw new Error();
          }
        } else {
          if (chr === '\\') {
            push('Escape');
            take = 0;
          } else if (chr === state.openToken) {
            state.closeToken = chr;
            pop(state.content);
          } else {
            state.content += chr;
          }
        }
        break;
      }

      case 'JSONExpression': {
        take = 0;
        if (chr === '"' || chr === "'") {
          span = 'String';
        } else if (chr === 'n') {
          span = 'Null';
        } else if (chr === 'u') {
          span = 'Undefined';
        } else if (chr === 't') {
          span = 'True';
        } else if (chr === 'f') {
          span = 'False';
        } else if (chr === 'N') {
          span = 'NaN';
        } else if (inRange(chr, '0', '9')) {
          span = 'Number';
        } else if (chr === '[') {
          span = 'Array';
        } else if (chr === '{') {
          span = 'Object';
        } else {
          throw new Error();
        }
        break;
      }

      case 'Number': {
        if (!state) {
          state = {
            wholePart: undefined,
            decimalSeparator: undefined,
            decimalPart: undefined,
            exponentSeparator: undefined,
            exponentPart: undefined,
          };
        }

        if (state.wholePart === undefined) {
          push('UnsignedInteger', 'wholePart');
          state = { noDoubleZero: true };
          take = 0;
        } else if (state.decimalSeparator === undefined) {
          state.decimalSeparator = chr === '.' ? chr : '';
          if (chr !== '.') {
            take = 0;
          }
        } else if (state.decimalPart === undefined) {
          if (state.decimalSeparator && inRange(chr, '0', '9')) {
            push('UnsignedInteger', 'decimalPart');
            take = 0;
          } else {
            state.decimalPart = '';
            take = 0;
          }
        } else if (state.exponentSeparator === undefined) {
          state.exponentSeparator = chr === 'e' ? chr : '';
          if (chr !== 'e') {
            take = 0;
          }
        } else if (state.exponentPart === undefined) {
          if (inRange(chr, '0', '9')) {
            push('UnsignedInteger', 'exponentPart');
            take = 0;
          } else {
            state.exponentPart = '';
            take = 0;
          }
        } else {
          let str =
            state.wholePart +
            state.decimalSeparator +
            state.decimalPart +
            state.exponentSeparator +
            state.exponentPart;

          pop(parseFloat(str));
          take = 0;
        }
        break;
      }

      case 'UnsignedInteger': {
        state ||= {};
        state.digits ||= [];

        if (inRange(chr, '0', '9')) {
          state.digits[0] = chr;
          if (state.digits.length === 1 && chr === '0' && state.noDoubleZero) {
            pop(parseInt(state.digits.join(''), 10));
          }
        } else {
          pop(parseInt(state.digits.join(''), 10));
          take = 0;
        }

        break;
      }

      case 'True':
      case 'False':
      case 'Null':
      case 'Undefined':
      case 'NaN': {
        if (!state) {
          state = literal;
          literal = '';
        }
        let pattern = getPatternForSpan(span);

        if (chr !== pattern[state.length]) throw new Error();
        state += chr;

        if (state.length === pattern.length) {
          pop(getValueForSpan(span));
        }

        break;
      }

      case 'Infinity': {
        break;
      }

      case 'Identifier': {
        if (!state) {
          state = {};
        }
        if (chr === '\\') {
          span = 'Escape';
          push(span, refName, state);
          state = null;
        } else if (chr === '`') {
          if (state.quoted) {
            pop(literal);
          } else {
            state.quoted = true;
          }
        } else {
          if (state.quoted) {
            literal += chr;
          } else {
            if (canContinueIdentifier(chr)) {
              literal += chr;
            } else {
              pop(literal);
              take = 0;
            }
          }
        }

        break;
      }

      case 'NodeFlags': {
        state ||= { token: false, object: false, array: false };
        if (chr === '*') {
          state.token = true;
        } else if (chr === '{') {
          state.object = true;
        } else if (chr === '[') {
          state.array = true;
        } else {
          let flags = freezeRecord(state);
          pop(flags);
          take = 0;
        }
        break;
      }

      default:
        throw new Error('unknown span');
    }
  }
}

function* __printSource(tags) {
  let printed = '';
  let held = false;
  let iter = getStreamIterator(tags);
  let step = iter.next();

  if (!tags) return printed;

  for (;;) {
    while (step === null || step instanceof Promise) {
      if (step === null) yield continue_(), (step = iter.next());
      if (step instanceof Promise) step = yield wait(step);
    }
    if (step.done) break;
    let tag = step.value;

    let tagType = parseTagType(tag);
    if (tagType === OpenNodeTag) {
      let { literalValue } = parseTag(tag).value;
      if (literalValue) {
        if (literalValue.type !== LiteralTag) throw new Error('not implemented');
        printed += literalValue.value;
      }
    } else if (tagType === LiteralTag) {
      printed += parseTag(tag).value;
    } else if (tagType === EscapeTag) {
      printed += parseTag(tag).value.value;
    } else if (tagType === ShiftTag) {
      held = true;
    } else if (tagType === GapTag) {
      if (held) {
        held = false;
      } else {
        throw new Error('use generateSourceTextFor');
      }
    }

    step = iter.next();
  }

  return printed;
}

export const printSource = (tags) => {
  return evaluateReturn(new StreamGenerator(__printSource(tags)));
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
