import { Coroutine } from '@bablr/coroutine';
import {
  buildReferenceTag,
  buildOpenNodeTag,
  buildLiteralTag,
  buildCloseNodeTag,
  tokenFlags,
  buildChild,
  buildGapTag,
  multiFragmentFlags,
  buildStubNode,
  buildNodeTag,
  buildNullTag,
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
  LiteralTag,
  AttributeDefinition,
  BindingTag,
  Property,
  ShiftTag,
  PropertyWrapper,
} from './symbols.js';
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
  createNode,
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
  let rootPath = null;
  let path = null;
  let doctype = null;
  const co = new Coroutine(getStreamIterator(tags));
  const expressionsCo = new Coroutine(getStreamIterator(options.expressions || []));

  for (;;) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }

    if (co.done) break;

    let tag = co.value;

    if (tag.type === 'Effect') {
      continue;
    }

    if (tag.type === DoctypeTag) {
      doctype = tag;
      continue;
    }

    if (!path) {
      rootPath = path = Path.create(createNode(tag));
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

        if (isFragmentNode(node)) {
          throw new Error('not implemented');
        } else {
          path = path.advance(buildNodeTag(node));
        }
      }
    } else {
      path = path.advance(tag);
    }
  }

  if (path && path.node.type) {
    throw new Error('imbalanced tag stack');
  }

  return rootPath.node;
}

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
    if (tagPath.tag.type === OpenNodeTag && !tagPath.tag.value.literalValue) count++;
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

  if (count !== 0) throw new Error();
}

export const vcsStreamFromTree = (rootNode) => {
  let rootNode_ = isPlainObject(rootNode) ? rootNode : rootNode.node;

  return __vcsStreamFromTree(rootNode_);
};

function* __vcsStreamFromTree(rootNode) {
  let stack = null;
  let agastNode = rootNode;
  let depth = 0;
  let nodeShifted = false;
  let i = 0;
  let seenFirstProperty = false;
  let node = Tags.getValues(rootNode.tags);

  outer: while (node) {
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
      let wrappedTag = child;

      if (wrappedTag.type === PropertyWrapper) {
        for (let tag of wrappedTag.value.tags) {
          switch (tag.type) {
            case Property: {
              let replaceWithGap = nodeShifted && !seenFirstProperty;

              if (replaceWithGap) {
                yield buildGapTag();

                seenFirstProperty = true;

                break;
              } else {
                stack = { stack, agastNode, node, depth, i, nodeShifted, seenFirstProperty: true };
                node = Tags.getValues(tag.value.node.tags);

                depth++;
                i = 0;
                agastNode = tag.value.node;
                nodeShifted = wrappedTag.value.tags[0].type === ShiftTag;
                seenFirstProperty = false;
                continue outer;
              }
            }

            default: {
              yield tag;

              if (tag.type === OpenNodeTag && tag.value.literalValue) {
                ({ stack, agastNode, node, depth, i, nodeShifted } = stack);
                seenFirstProperty = true;
              }

              break;
            }
          }
        }
      } else {
        yield wrappedTag;

        if (wrappedTag.type === OpenNodeTag && wrappedTag.value.literalValue) {
          ({ stack, agastNode, node, depth, i, nodeShifted } = stack);
          seenFirstProperty = true;
        }
      }
      i++;
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

      case GapTag: {
        return null;
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

export const notNull = (node) => {
  return node != null && !isNullNode(node);
};

export const isNull = (node) => {
  return node == null || isNullNode(node);
};

// export const addProperty = (node, property) => {
//   if (!node || !property) throw new Error();
//   if (!Object.isFrozen(property)) throw new Error();

//   if (property.node === null) {
//     throw new Error();
//   }

//   let { node: value, binding, reference } = property;

//   let isArrayInitializer = reference.type !== '_' && isArray(value);
//   let isInitializer = value === undefined || isArrayInitializer;

//   if (isArrayInitializer && value.length) throw new Error();

//   if (!isInitializer && property.node.type && !property.binding) {
//     throw new Error();
//   }

//   if (reference.type === '_') {
//     node.tags = Tags.push(node.tags, value);
//     node.children = node.tags[1][1];
//     return node;
//   }

//   let referenceTag = buildChild(ReferenceTag, reference);
//   let propertyWrapper;

//   if (isInitializer) {
//     let tags = freeze([referenceTag, buildInitializerTag(isArrayInitializer)]);

//     propertyWrapper = buildPropertyWrapper(
//       tags,
//       buildProperty(reference, null, isArrayInitializer ? [] : null),
//     );
//   } else {
//     let tags = freeze([
//       referenceTag,
//       buildChild(BindingTag, binding),
//       buildChild(Property, property),
//     ]);

//     if (referenceTag.value.flags.expression) {
//       let openStack = node.bounds[0];
//       let path = Path.from(node);
//       let lastTagPath = TagPath.from(path, -1, 0);

//       let lastRefPath = [ReferenceTag, ShiftTag].includes(lastTagPath?.tag.type)
//         ? lastTagPath.tag.type === ReferenceTag
//           ? lastTagPath
//           : TagPath.from(path, -1, 0)
//         : null;
//       let { firstPropertyTagPath } = path;
//       let isFirstProperty =
//         !lastRefPath ||
//         (!!firstPropertyTagPath && lastRefPath.propertyWrapper.equalTo(firstPropertyTagPath));
//       if (isFirstProperty) {
//         openStack = BTree.replaceAt(-1, openStack, property);
//         openStack = BTree.push(
//           openStack,
//           buildProperty(buildReference('.'), buildBinding(), buildStubNode(buildGapTag())),
//         );
//         node.bounds = buildBounds(openStack, node.bounds[1]);

//         if (
//           lastTagPath?.tag.type == ShiftTag &&
//           BTree.getSize(node.bounds[0]) !== lastTagPath.tag.value.height
//         ) {
//           throw new Error('bad height or shift stack');
//         }
//       }
//     }

//     propertyWrapper = buildPropertyWrapper(tags, property);
//   }

//   let lastTag = Tags.getAt(-1, node.tags);
//   let unboundProperty = lastTag.type === PropertyWrapper && lastTag.value.tags.length < 3;

//   if (unboundProperty) {
//     node.tags = Tags.replaceAt(-1, node.tags, buildChild(PropertyWrapper, propertyWrapper));
//   } else {
//     node.tags = Tags.push(node.tags, buildChild(PropertyWrapper, propertyWrapper));
//   }
//   node.children = node.tags[1][1];

//   return node;
// };

// export const shiftProperty = (node, property) => {
//   if (!node || !property) throw new Error();
//   if (!property.reference) throw new Error();
//   if (!Object.isFrozen(property)) throw new Error();

//   if (property.node === null) {
//     property.node = buildNullNode();
//   }

//   let { node: value } = property;

//   let isArrayInitializer = isArray(value);
//   let isInitializer = value === undefined || isArrayInitializer;

//   if (isInitializer || !property.binding) {
//     throw new Error();
//   }

//   let existingProperty = Tags.getAt(-1, node.tags);

//   if (!wrapperIsFull(existingProperty)) {
//     existingProperty = Tags.getAt(-2, node.tags);
//   }

//   let existingRef = existingProperty?.value.tags[0];

//   let bindingTag = buildChild(BindingTag, property.binding);

//   let shiftStack = existingProperty?.value.property.node.bounds[0] || BTree.fromValues([]);
//   let stackSize = shiftStack && property.reference.flags.expression ? BTree.getSize(shiftStack) : 0;

//   let index = existingRef.type === ReferenceTag ? 1 : existingRef.value.index + 1;
//   let height = existingRef.type === ReferenceTag ? 3 : existingRef.value.height + 1;

//   let shiftTag = stackSize ? buildShiftTag(index, height) : existingRef;

//   let tags = freeze([shiftTag, bindingTag, buildChild(Property, property)]);

//   let lastTag = Tags.getAt(-1, node.tags);
//   let unboundProperty = lastTag.type === PropertyWrapper && lastTag.value.tags.length < 3;

//   let propertyWrapper = buildPropertyWrapper(tags, property);

//   if (unboundProperty) {
//     node.tags = Tags.replaceAt(-1, node.tags, buildChild(PropertyWrapper, propertyWrapper));
//   } else {
//     node.tags = Tags.push(node.tags, buildChild(PropertyWrapper, propertyWrapper));
//   }
//   node.children = node.tags[1][1];

//   if (existingProperty.value.property.reference.flags.expression) {
//     let openStack = node.bounds[0];
//     let path = Path.from(node);
//     let lastTagPath = TagPath.from(path, -1, 0);
//     if ([ReferenceTag, ShiftTag].includes(lastTagPath?.tag.type)) {
//       let lastRefPath =
//         lastTagPath.tag.type === ReferenceTag
//           ? lastTagPath
//           : TagPath.from(path, -1 - lastTagPath.tag.value.index, 0);
//       let { firstPropertyTagPath } = path;
//       let isFirstProperty =
//         !!firstPropertyTagPath && lastRefPath.propertyWrapper.equalTo(firstPropertyTagPath);
//       if (isFirstProperty) {
//         openStack = BTree.replaceAt(-1, openStack, property);
//         openStack = BTree.push(
//           openStack,
//           buildProperty(buildReference('.'), buildBinding(), buildStubNode(buildGapTag())),
//         );
//         node.bounds = buildBounds(openStack, node.bounds[1]);

//         if (BTree.getSize(node.bounds[0]) !== lastTagPath.tag.value.height) {
//           throw new Error('bad height or shift stack');
//         }
//       }
//     }
//   }

//   return node;
// };

// export const add = (node, referenceTag, value, bindingTag) => {
//   let lastChild = Tags.getAt(-1, node.tags);
//   let reference = referenceTag.value;
//   let binding = bindingTag
//     ? bindingTag.value
//     : lastChild?.type === BindingTag
//     ? lastChild.value
//     : buildBinding();
//   return addProperty(node, buildProperty(reference, binding, value));
// };

// export const shift = (node, referenceTag, value, bindingTag) => {
//   let lastChild = Tags.getAt(-1, node.tags);
//   let reference = referenceTag.value;
//   let binding = bindingTag
//     ? bindingTag.value
//     : lastChild.type === BindingTag
//     ? lastChild.value
//     : buildBinding();
//   return shiftProperty(node, buildProperty(reference, binding, value));
// };
