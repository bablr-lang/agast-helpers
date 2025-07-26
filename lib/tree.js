import { Coroutine } from '@bablr/coroutine';
import {
  nodeFlags,
  buildReferenceTag,
  buildNullTag,
  buildOpenNodeTag,
  buildLiteralTag,
  buildCloseNodeTag,
  tokenFlags,
  buildInitializerTag,
  buildBindingTag,
  buildProperty,
  buildChild,
  buildShiftTag,
  buildGapTag,
  buildBinding,
  buildReference,
  multiFragmentFlags,
  buildPropertyWrapper,
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
  AttributeDefinition,
  BindingTag,
  Property,
  ShiftTag,
  PropertyWrapper,
} from './symbols.js';
import * as BTree from './btree.js';
import * as Tags from './tags.js';
export * from './builders.js';
export * from './print.js';
import {
  get,
  getOr,
  has,
  list,
  TagPath,
  Path,
  isFragmentNode,
  isNullNode,
  isGapNode,
  getOpenTag,
  getCloseTag,
  getRoot,
  getRootArray,
  isStubTag,
} from './path.js';
import { isPlainObject } from './object.js';

export {
  get,
  getOr,
  has,
  list,
  isFragmentNode,
  isNullNode,
  isGapNode,
  getOpenTag,
  getCloseTag,
  getRoot,
  getRootArray,
};

export const buildToken = (type, value, attributes = {}) => {
  return treeFromStreamSync([
    buildOpenNodeTag(tokenFlags, type, attributes),
    buildLiteralTag(value),
    buildCloseNodeTag(),
  ]);
};

const isString = (str) => typeof str === 'string';

const { isArray } = Array;
const { freeze, hasOwn } = Object;

export const mergeReferences = (outer, inner) => {
  let { type, name, isArray, index, flags: { expression, hasGap } = {} } = outer;

  if (
    (name != null && inner.name != null && name !== inner.name) ||
    (type != null && inner.type != null && type !== inner.type && inner.type !== '.')
  ) {
    return inner;
  }

  isArray = isArray || inner.isArray;
  expression = !!(expression || inner.flags.expression);
  hasGap = !!(hasGap || inner.flags.hasGap);
  name = type === '.' ? inner.name : name;
  type = type === '.' ? inner.type : type;

  return buildReferenceTag(type, name, isArray, { expression, hasGap }, index).value;
};

export const mergeReferenceTags = (outer, inner) => {
  let value = mergeReferences(outer.value, inner.value);

  return buildChild(ReferenceTag, value);
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
  let referenceTag = null;
  let bindingTag = null;

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
        break;

      case CloseNodeTag: {
        let { node } = path;
        if (!node.tags[1]) throw new Error();
        break;
      }

      case ReferenceTag: {
        referenceTag = tag;
        suppressTag = true;
        break;
      }

      case BindingTag: {
        bindingTag = tag;
        suppressTag = true;
        break;
      }

      case InitializerTag: {
        add(path.node, referenceTag, []);
        suppressTag = true;
        referenceTag = null;
        break;
      }

      case NullTag:
      case GapTag: {
        if (!path) {
          return buildStubNode(tag);
        }

        const isGap = tag.type === GapTag;

        if (path.parent && referenceTag.type !== ReferenceTag) throw new Error();

        let node = createNode(tag);

        suppressTag = true;

        if (isGap) {
          if (held) {
            node = held;
            add(path.node, referenceTag, node, bindingTag);
          } else if (!expressionsCo.done) {
            expressionsCo.advance();

            let outerReference = referenceTag;

            if (!expressionsCo.done) {
              node =
                node == null
                  ? buildStubNode(buildNullTag())
                  : expressionsCo.value == null
                  ? buildStubNode(buildNullTag())
                  : expressionsCo.value;

              if (isFragmentNode(node)) {
                const parentNode = path.node;

                let referenceTag;
                let bindingTag;

                for (const tag of Tags.traverse(node.tags)) {
                  switch (tag.type) {
                    case DoctypeTag: {
                      break;
                    }

                    case OpenNodeTag: {
                      referenceTag = bindingTag = null;
                      if (!tag.value.type) {
                        break;
                      } else {
                        throw new Error();
                      }
                    }

                    case ReferenceTag:
                      referenceTag = tag;
                      break;

                    case InitializerTag: {
                      add(parentNode, mergeReferenceTags(outerReference, referenceTag), []);
                      break;
                    }

                    case BindingTag: {
                      bindingTag = tag;
                      break;
                    }

                    case GapTag:
                    case NullTag: {
                      add(
                        parentNode,
                        mergeReferenceTags(outerReference, referenceTag),
                        buildStubNode(tag),
                        bindingTag,
                      );
                      referenceTag = bindingTag = null;
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
                add(path.node, referenceTag, node, bindingTag ?? buildBindingTag());
              }
            } else {
              if (!path.node.flags.token) {
                add(path.node, referenceTag, node, bindingTag ?? buildBindingTag());
              }
            }
          }
        }

        referenceTag = null;
        held = isGap ? null : held;

        if (!path.node.flags.token) {
          path = { parent: path, node, depth: (path.depth ?? -1) + 1, arrays: new Set() };
        }

        break;
      }

      // case ShiftTag: {
      //   const { tags, properties } = path.node;

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
        const node = createNode(tag);
        if (path) {
          if (path) {
            add(path.node, referenceTag, node, bindingTag ?? buildBindingTag());
            referenceTag = null;
          }

          path = { parent: path, node, depth: (path ? path.depth : -1) + 1, arrays: new Set() };
        } else {
          path = { parent: null, node, depth: 0, arrays: new Set() };

          rootPath = path;
        }

        suppressTag = true;
        break;
      }

      default: {
        throw new Error();
      }
    }

    if (!suppressTag) {
      path.node.tags = Tags.push(path.node.tags, tag);
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

export const isEmpty = (node) => {
  for (const tag of Tags.traverseInner(node.tags)) {
    switch (tag.type) {
      case Property: {
        if (tag.value.reference.type === '@') {
          return false;
        } else {
          const property = tag.value;

          if (!isNullNode(property.node)) {
            return false;
          }
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

let buildGapProperty = () =>
  buildProperty(buildReference('.'), buildBinding(), buildStubNode(buildGapTag()));

export const buildBounds = (
  openBoundary = BTree.fromValues([buildGapProperty()]),
  closeBoundary = openBoundary,
) => {
  return freeze([openBoundary, closeBoundary]);
};

export const buildStubNode = (tag) => {
  if (!isStubTag(tag)) throw new Error();
  return freeze({
    flags: nodeFlags,
    type: null,
    bounds: buildBounds(null, null),
    tags: Tags.from(tag),
    attributes: freeze({}),
  });
};

export const streamFromTree = (tree, options = {}) => {
  let rootNode = isPlainObject(tree) ? tree : tree.node;

  return __streamFromTree(null, rootNode, options);
};

function* __streamFromTree(doctypeTag, rootNode, options) {
  const { unshift = false } = options;
  if (!rootNode || !Tags.getSize(rootNode.tags)) return;

  let tagPath = TagPath.fromNode(rootNode, 0);

  let count = 0;

  if (doctypeTag) {
    yield doctypeTag;
  }

  do {
    if (tagPath.tag.type === OpenNodeTag) count++;
    if (tagPath.tag.type === CloseNodeTag) count--;

    if (
      !(
        tagPath.tag.type === AttributeDefinition ||
        (tagPath.tag.type === BindingTag && !tagPath.tag.value.languagePath?.length)
      )
    ) {
      yield tagPath.tag;
    }
  } while ((tagPath = unshift ? tagPath.nextUnshifted : tagPath.next));

  // if (count !== 0) throw new Error();
}

export const vcsStreamFromTree = (rootNode) => {
  let rootNode_ = isPlainObject(rootNode) ? rootNode : rootNode.node;

  return __vcsStreamFromTree(rootNode_);
};

function* __vcsStreamFromTree(rootNode) {
  let stack = null;
  let agastNode = rootNode;
  let depth = 0;
  let shiftTag = false;
  let nodeShifted = false;
  let i = 0;
  let seenFirstProperty = false;
  let node = Tags.getValues(rootNode.tags);

  while (node) {
    while (i >= node.length) {
      if (stack) {
        let oldAgastNode = agastNode;
        let hadSeenFirst = seenFirstProperty;
        ({ stack, agastNode, node, depth, i, nodeShifted, seenFirstProperty } = stack);
        if (oldAgastNode === agastNode) {
          seenFirstProperty = hadSeenFirst;
          yield buildCloseNodeTag();
        }

        i++;
      } else {
        return;
      }
    }

    let child = node[i];

    if (isArray(child)) {
      stack = { stack, agastNode, node, depth, i, nodeShifted, seenFirstProperty };

      yield buildOpenNodeTag(multiFragmentFlags);

      node = Tags.getValues(child);
      depth++;
      i = 0;
    } else {
      let tag = child;

      switch (tag.type) {
        case PropertyWrapper: {
          let shifted = !!shiftTag;

          shiftTag = false;

          let replaceWithGap = nodeShifted && !seenFirstProperty;

          if (replaceWithGap) {
            yield buildGapTag();

            seenFirstProperty = true;

            i++;
            break;
          } else {
            stack = { stack, agastNode, node, depth, i, nodeShifted, seenFirstProperty: true };
            node = Tags.getValues(child.value.property.node.tags);

            depth++;
            i = 0;
            agastNode = child.value.property.node;
            nodeShifted = shifted;
            seenFirstProperty = false;
            continue;
          }
        }

        case ShiftTag: {
          shiftTag = tag;
          yield tag;

          i++;
          break;
        }

        default: {
          yield tag;

          i++;
          break;
        }
      }
    }
  }
}

export const getCooked = (cookable) => {
  if (!cookable || isGapNode(cookable.type)) {
    return '';
  }

  const tags = cookable.tags || cookable;

  let cooked = '';

  // const openTag = getOpenTag(cookable);
  // const closeTag = getCloseTag(cookable);

  let referenceTag = null;

  for (let tag of Tags.traverse(tags)) {
    switch (tag.type) {
      case ReferenceTag: {
        let { type } = tag.value;

        if (!(type === '#' || type === '@')) {
          throw new Error('cookable nodes must not contain other nodes');
        }

        referenceTag = tag;
        break;
      }

      case BindingTag:
        break;

      case PropertyWrapper: {
        let { node, reference } = tag.value.property;
        let { attributes } = node;

        if (reference.type === '@') {
          let { cooked: cookedValue } = attributes;

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

export const printCSTML = (tree) => {
  return printCSTMLFromStream(streamFromTree(tree));
};

export const printPrettyCSTML = (tree, options = {}) => {
  return printPrettyCSTMLFromStream(streamFromTree(tree), options);
};

export const printSource = (tree) => {
  return printSourceFromStream(streamFromTree(tree, { unshift: true }));
};

export const sourceTextFor = printSource;

export const getRange = (node) => {
  const { tags } = node;
  let path = Path.from(node);
  return Tags.getSize(tags) ? [TagPath.from(path, 0), TagPath.from(path, -1)] : null;
};

export const createNode = (openTag) => {
  if (!openTag || openTag.type === GapTag || openTag.type === NullTag) {
    return {
      flags: nodeFlags,
      type: openTag && ([NullTag, GapTag].includes(openTag.type) ? null : openTag.type),
      bounds: buildBounds(),
      tags: openTag ? Tags.from(openTag) : Tags.fromValues([]),
      attributes: openTag?.attributes || {},
    };
  } else {
    const { flags, type, attributes = {} } = openTag.value || {};
    return {
      flags,
      type,
      bounds: buildBounds(),
      tags: openTag ? Tags.from(openTag) : Tags.fromValues([]),
      attributes,
    };
  }
};

export const finalizeNode = (node) => {
  freeze(node);
  freeze(node.attributes);
  return node;
};

export const notNull = (node) => {
  return node != null && !isNullNode(node);
};

export const isNull = (node) => {
  return node == null || isNullNode(node);
};

export const addProperty = (node, property) => {
  if (!node || !property) throw new Error();
  if (!Object.isFrozen(property)) throw new Error();

  if (property.node === null) {
    throw new Error();
  }

  let { node: value, binding, reference } = property;

  let isArrayInitializer = reference.type !== '_' && isArray(value);
  let isInitializer = value === undefined || isArrayInitializer;

  if (isArrayInitializer && value.length) throw new Error();

  if (!isInitializer && property.node.type && !property.binding) {
    throw new Error();
  }

  if (reference.type === '_') {
    node.tags = Tags.push(node.tags, value);
    return node;
  }

  let referenceTag = buildChild(ReferenceTag, reference);
  let propertyWrapper;

  if (isInitializer) {
    let tags = freeze([referenceTag, buildInitializerTag(isArrayInitializer)]);

    propertyWrapper = buildPropertyWrapper(
      tags,
      buildProperty(reference, null, isArrayInitializer ? [] : null),
    );
  } else {
    let tags = freeze([referenceTag, binding && buildChild(BindingTag, binding)]);

    propertyWrapper = buildPropertyWrapper(tags, property);
  }

  let lastTag = Tags.getAt(-1, node.tags);
  let unboundProperty =
    lastTag.type === PropertyWrapper && lastTag.value.property.node === undefined;

  if (unboundProperty) {
    node.tags = Tags.replaceAt(-1, node.tags, buildChild(PropertyWrapper, propertyWrapper));
  } else {
    node.tags = Tags.push(node.tags, buildChild(PropertyWrapper, propertyWrapper));
  }

  return node;
};

export const shiftProperty = (node, property) => {
  if (!node || !property) throw new Error();
  if (!property.reference) throw new Error();
  if (!Object.isFrozen(property)) throw new Error();

  if (property.node === null) {
    property.node = buildNullNode();
  }

  let { node: value } = property;

  let isArrayInitializer = isArray(value);
  let isInitializer = value === undefined || isArrayInitializer;

  if (isInitializer || !property.binding) {
    throw new Error();
  }

  let existingProperty = Tags.getAt(-1, node.tags);
  let existingRef = existingProperty?.value.tags[0];

  let bindingTag = buildChild(BindingTag, property.binding);

  let shiftStack = get(property.reference.name, node).bounds[0] || BTree.fromValues([]);
  let stackSize = shiftStack && property.reference.flags.expression ? BTree.getSize(shiftStack) : 0;

  let index = existingRef.type === ReferenceTag ? 1 : existingRef.value.index + 1;
  let height = BTree.getSize(shiftStack) + 1;

  let shiftTag = stackSize ? buildShiftTag(index, height) : existingRef;

  let tags = freeze([shiftTag, bindingTag]);
  node.tags = Tags.push(
    node.tags,
    buildChild(PropertyWrapper, buildPropertyWrapper(tags, property)),
  );

  return node;
};

export const add = (node, referenceTag, value, bindingTag) => {
  let lastChild = Tags.getAt(-1, node.tags);
  let reference = referenceTag.value;
  let binding = bindingTag
    ? bindingTag.value
    : lastChild?.type === BindingTag
    ? lastChild.value
    : buildBinding();
  return addProperty(node, buildProperty(reference, binding, value));
};

export const shift = (node, referenceTag, value, bindingTag) => {
  let lastChild = Tags.getAt(-1, node.tags);
  let reference = referenceTag.value;
  let binding = bindingTag
    ? bindingTag.value
    : lastChild.type === BindingTag
    ? lastChild.value
    : buildBinding();
  return shiftProperty(node, buildProperty(reference, binding, value));
};
