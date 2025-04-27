import { Coroutine } from '@bablr/coroutine';
import {
  nodeFlags,
  buildReferenceTag,
  buildNullTag,
  buildOpenNodeTag,
  buildLiteralTag,
  buildCloseNodeTag,
  tokenFlags,
} from './builders.js';
import {
  printPrettyCSTML as printPrettyCSTMLFromStream,
  printCSTML as printCSTMLFromStream,
  printSource as printSourceFromStream,
  getStreamIterator,
} from './stream.js';
import {
  DoctypeTag,
  OpenNodeTag,
  CloseNodeTag,
  ReferenceTag,
  GapTag,
  NullTag,
  InitializerTag,
  LiteralTag,
  EmbeddedNode,
  ShiftTag,
} from './symbols.js';
import * as btree from './btree.js';
import * as sumtree from './sumtree.js';
export * from './builders.js';
export * from './print.js';
import {
  add,
  get,
  TagPath,
  Path,
  isFragmentNode,
  isNullNode,
  isGapNode,
  getOpenTag,
  getCloseTag,
  getShifted,
  getRoot,
  getRootArray,
} from './path.js';

export {
  add,
  get,
  isFragmentNode,
  isNullNode,
  isGapNode,
  getOpenTag,
  getCloseTag,
  getRoot,
  getRootArray,
};

export const buildToken = (language, type, value, attributes = {}) => {
  return treeFromStreamSync([
    buildOpenNodeTag(tokenFlags, language, type, attributes),
    buildLiteralTag(value),
    buildCloseNodeTag(),
  ]);
};

const isString = (str) => typeof str === 'string';

const { isArray } = Array;
const { freeze } = Object;

export const mergeReferences = (outer, inner) => {
  let {
    type,
    name,
    isArray,
    index,
    flags: { expression, hasGap },
  } = outer.value;

  if (
    (name != null && inner.value.name != null && name !== inner.value.name) ||
    (type != null && inner.value.type != null && type !== inner.value.type)
  ) {
    return inner;
  }

  isArray = isArray || inner.value.isArray;
  expression = !!(expression || inner.value.flags.expression);
  hasGap = !!(hasGap || inner.value.flags.hasGap);
  name = type === '.' ? inner.value.name : name;
  type = type === '.' ? inner.value.type : type;

  return buildReferenceTag(type, name, isArray, { expression, hasGap }, index);
};

export const isEmptyReference = (ref) => {
  let { type, isArray, flags } = ref.value;
  return type === '.' && !isArray && !(flags.expression || flags.hasGap);
};

function* __treeFromStream(tags, options) {
  let path = null;
  let rootPath = null;
  let held = null;
  let doctype = null;
  const co = new Coroutine(getStreamIterator(tags));
  const expressionsCo = new Coroutine(getStreamIterator(options.expressions || []));
  let reference = null;

  for (;;) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }

    if (co.done) break;

    const tag = co.value;

    if (tag.type === 'Effect') {
      continue;
    }

    if (tag.type === DoctypeTag) {
      doctype = tag;
      continue;
    }

    if (held && tag.type !== OpenNodeTag && tag.type !== GapTag) {
      throw new Error('cannot eat this type of tag while holding');
    }

    let suppressTag = false;

    switch (tag.type) {
      case LiteralTag:
      case CloseNodeTag: {
        break;
      }

      case ReferenceTag: {
        reference = tag;
        suppressTag = true;
        break;
      }

      case InitializerTag: {
        add(path.node, reference, []);
        suppressTag = true;
        reference = null;
        break;
      }

      case NullTag:
      case GapTag: {
        if (!path) {
          return buildStubNode(tag);
        }

        const isGap = tag.type === GapTag;

        if (path.parent && reference.type !== ReferenceTag) throw new Error();

        let node = createNode(tag);

        if (isGap) {
          if (held) {
            node = held;
            add(path.node, reference, node);
            suppressTag = true;
          } else if (!expressionsCo.done) {
            expressionsCo.advance();

            let outerReference = reference;

            if (!expressionsCo.done) {
              node =
                node == null
                  ? buildStubNode(buildNullTag())
                  : expressionsCo.value == null
                  ? buildStubNode(buildNullTag())
                  : expressionsCo.value;
              suppressTag = true;

              if (isFragmentNode(node)) {
                const parentNode = path.node;

                let reference;
                let shift = null;

                for (const tag of sumtree.traverse(node.children)) {
                  switch (tag.type) {
                    case DoctypeTag: {
                      break;
                    }
                    case OpenNodeTag:
                    case CloseNodeTag: {
                      if (!tag.value.type) {
                        break;
                      } else {
                        throw new Error();
                      }
                    }

                    case ReferenceTag:
                      reference = tag;
                      shift = null;
                      break;

                    case ShiftTag:
                      shift = tag;
                      break;

                    case InitializerTag: {
                      add(parentNode, mergeReferences(outerReference, reference), []);
                      break;
                    }

                    case EmbeddedNode: {
                      add(parentNode, mergeReferences(outerReference, reference), tag.value);
                      break;
                    }

                    case GapTag: {
                      const resolvedNode = getShifted(shift?.value.index, reference, node);
                      add(parentNode, mergeReferences(outerReference, reference), resolvedNode);
                      break;
                    }

                    case NullTag: {
                      add(parentNode, mergeReferences(outerReference, reference), null);
                      break;
                    }

                    default:
                      throw new Error();
                  }
                }
              } else {
                if (path.node.flags.token) {
                  throw new Error('not implemented');
                }
                add(path.node, reference, node);
              }
            } else {
              if (!path.node.flags.token) {
                add(path.node, reference, node);
              }
            }
          }
        }

        reference = null;
        held = isGap ? null : held;

        if (!path.node.flags.token) {
          path = { parent: path, node, depth: (path.depth ?? -1) + 1, arrays: new Set() };
        }

        break;
      }

      // case ShiftTag: {
      //   const { children, properties } = path.node;

      //   let property = properties[ref.value.name];
      //   let node;

      //   if (ref.value.isArray) {
      //     ({ node } = btree.getAt(-1, property));
      //     properties[ref.value.name].pop();
      //   } else {
      //     ({ node } = property);
      //     properties[ref.value.name] = null;
      //   }

      //   held = node;
      //   break;
      // }

      case OpenNodeTag: {
        if (path) {
          const node = createNode(tag);

          if (path) {
            add(path.node, reference, node);
            reference = null;
          }

          path = { parent: path, node, depth: (path ? path.depth : -1) + 1, arrays: new Set() };
        } else {
          const { language, type, flags, attributes } = tag.value;

          const attributes_ = doctype?.value.attributes ?? attributes;
          const language_ = attributes?.['bablrLanguage'] ?? language;

          const node = {
            flags,
            language: language_,
            type,
            children: [],
            properties: {},
            attributes: attributes_,
          };

          path = { parent: null, node, depth: 0, arrays: new Set() };

          rootPath = path;
        }

        break;
      }

      default: {
        throw new Error();
      }
    }

    if (!suppressTag) {
      path.node.children = sumtree.push(path.node.children, tag);
    }

    switch (tag.type) {
      case NullTag:
      case GapTag:
      case CloseNodeTag: {
        const completedNode = path.node;

        if (!(tag.type === GapTag && completedNode.flags.token)) {
          finalizeNode(completedNode);
        }

        if (tag.type === GapTag) {
          if (path && completedNode.type === null && completedNode.flags.token) {
            break;
          }
        }

        path = path.parent;
        break;
      }
    }
  }

  if (path && path.node.type) {
    throw new Error('imbalanced tag stack');
  }

  return rootPath.node;
}

export const buildNullNode = () => {
  return treeFromStreamSync([buildNullTag()]);
};

export const treeFromStream = (tags, options = {}) => __treeFromStream(tags, options);

export const treeFromStreamSync = (tokens, options = {}) => {
  return evaluateReturnSync(treeFromStream(tokens, options));
};

export const treeFromStreamAsync = async (tokens, options = {}) => {
  return evaluateReturnAsync(treeFromStream(tokens, options));
};

export const evaluateReturnSync = (generator) => {
  const co = new Coroutine(generator[Symbol.iterator]());
  while (!co.done) co.advance();
  return co.value;
};

export const evaluateReturnAsync = async (generator) => {
  const co = new Coroutine(getStreamIterator(generator));
  while (!co.done) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = await co.current;
    }
  }
  return co.value;
};

export const streamFromTree = (rootNode, options = {}) => __streamFromTree(rootNode, options);

export const isEmpty = (node) => {
  const { properties } = node;

  let ref = null;

  for (const tag of sumtree.traverse(node.children)) {
    switch (tag.type) {
      case ReferenceTag: {
        const { name } = tag.value;

        ref = tag;

        if (properties[name]) {
          const property = properties[name];

          if (
            property != null ||
            (isArray(property) && property.length) ||
            !isNullNode(property.node)
          ) {
            return false;
          }
        }
        break;
      }

      case EmbeddedNode: {
        if (ref.value.type === '@') {
          return false;
        }
        break;
      }

      case LiteralTag:
      case GapTag:
        return false;
    }
  }
  return true;
};

export const buildStubNode = (tag) => {
  return freeze({
    flags: nodeFlags,
    language: null,
    type: null,
    children: freeze([tag]),
    properties: freeze({}),
    attributes: freeze({}),
  });
};

function* __streamFromTree(rootNode, options) {
  const { unshift = false } = options;
  if (!rootNode || !sumtree.getSize(rootNode.children)) return;

  let tagPath = TagPath.fromNode(rootNode, 0);

  let count = 0;

  do {
    if (tagPath.tag.type === OpenNodeTag) count++;
    if (tagPath.tag.type === CloseNodeTag) count--;

    yield tagPath.tag;
  } while ((tagPath = unshift ? tagPath.nextUnshifted : tagPath.next));

  if (count !== 0) throw new Error();
}

export const getCooked = (cookable) => {
  if (!cookable || isGapNode(cookable.type)) {
    return '';
  }

  const children = cookable.children || cookable;

  let cooked = '';

  // const openTag = getOpenTag(cookable);
  // const closeTag = getCloseTag(cookable);

  let reference = null;

  for (const tag of sumtree.traverse(children)) {
    switch (tag.type) {
      case ReferenceTag: {
        const { type } = tag.value;

        if (!(type === '#' || type === '@')) {
          throw new Error('cookable nodes must not contain other nodes');
        }

        reference = tag;
        break;
      }

      case EmbeddedNode: {
        const { attributes } = tag.value;

        if (reference.value.type === '@') {
          const { cooked: cookedValue } = attributes;

          if (!isString(cookedValue))
            throw new Error('cannot cook string: it contains uncooked escapes');

          cooked += cookedValue;
        }

        break;
      }

      case LiteralTag: {
        cooked += tag.value;
        break;
      }

      case OpenNodeTag: {
        break;
      }

      case CloseNodeTag: {
        break;
      }

      default: {
        throw new Error();
      }
    }
  }

  return cooked;
};

export const printCSTML = (rootNode) => {
  return printCSTMLFromStream(streamFromTree(rootNode));
};

export const printPrettyCSTML = (rootNode, options = {}) => {
  return printPrettyCSTMLFromStream(streamFromTree(rootNode), options);
};

export const printSource = (rootNode) => {
  return printSourceFromStream(streamFromTree(rootNode, { unshift: true }));
};

export const sourceTextFor = printSource;

export const getRange = (node) => {
  const { children } = node;
  let path = Path.from(node);
  return sumtree.getSize(children) ? [TagPath.from(path, 0), TagPath.from(path, -1)] : null;
};

export const createNode = (openTag) => {
  if (!openTag || openTag.type === GapTag || openTag.type === NullTag) {
    return {
      flags: nodeFlags,
      language: openTag?.language,
      type: openTag && ([NullTag, GapTag].includes(openTag.type) ? null : openTag.type),
      children: [],
      properties: {},
      attributes: openTag?.attributes || {},
    };
  } else {
    const { flags, language, type, attributes = {} } = openTag.value || {};
    return {
      flags,
      language,
      type,
      children: [],
      properties: {},
      attributes,
    };
  }
};

export const finalizeNode = (node) => {
  freeze(node);
  freeze(node.properties);
  freeze(node.attributes);
  return node;
};

export const notNull = (node) => {
  return node != null && !isNullNode(node);
};

export const isNull = (node) => {
  return node == null || isNullNode(node);
};

export const branchProperties = (properties) => {
  const copy = { ...properties };

  for (const { 0: key, 1: value } of Object.entries(copy)) {
    if (isArray(value)) {
      copy[key] = btree.treeFromValues(value);
    }
  }

  return copy;
};

export const branchNode = (node) => {
  const { flags, language, type, children, properties, attributes } = node;
  return {
    flags,
    language,
    type,
    children,
    properties: branchProperties(properties),
    attributes: { ...attributes },
  };
};

export const acceptNode = (node, accepted) => {
  const { children, properties, attributes } = accepted;
  node.children = children;
  node.properties = properties;
  node.attributes = attributes;
  return node;
};

export function* traverseProperties(properties) {
  for (const value of Object.values(properties)) {
    if (isArray(value)) {
      for (let item of btree.traverse(value)) {
        if (isArray(item.node)) {
          yield btree.getAt(-1, item.node);
        } else {
          yield item.node;
        }
      }
    } else {
      yield value.node;
    }
  }
}
