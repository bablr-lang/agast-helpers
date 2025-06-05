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
} from './symbols.js';
import * as btree from './btree.js';
import * as Children from './children.js';
export * from './builders.js';
export * from './print.js';
import {
  get,
  TagPath,
  Path,
  isFragmentNode,
  isNullNode,
  isGapNode,
  getOpenTag,
  getCloseTag,
  getRoot,
  getRootArray,
  getFirstNodeShiftStack,
} from './path.js';
import { isPlainObject } from './object.js';

export {
  get,
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
    (type != null && inner.type != null && type !== inner.type)
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
      case CloseNodeTag: {
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

        if (isGap) {
          if (held) {
            node = held;
            add(path.node, referenceTag, node, bindingTag);
            suppressTag = true;
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
              suppressTag = true;

              if (isFragmentNode(node)) {
                const parentNode = path.node;

                let referenceTag;
                let bindingTag;

                for (const tag of Children.traverse(node.children)) {
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
            add(path.node, referenceTag, node, bindingTag ?? buildBindingTag());
            referenceTag = null;
          }

          path = { parent: path, node, depth: (path ? path.depth : -1) + 1, arrays: new Set() };
        } else {
          const { type, flags, attributes } = tag.value;

          const attributes_ = doctype?.value.attributes ?? attributes;

          const node = {
            flags,
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
      path.node.children = Children.push(path.node.children, tag);
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
  const { properties } = node;

  let ref = null;

  for (const tag of Children.traverse(node.children)) {
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

      case Property: {
        if (tag.value.reference.type === '@') {
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
    type: null,
    children: freeze([tag]),
    properties: freeze({}),
    attributes: freeze({}),
  });
};

export const streamFromTree = (rootNode, options = {}) => {
  let rootNode_ = isPlainObject(rootNode) ? rootNode : rootNode.node;

  return __streamFromTree(rootNode_, options);
};

function* __streamFromTree(rootNode, options) {
  const { unshift = false } = options;
  if (!rootNode || !Children.getSize(rootNode.children)) return;

  let tagPath = TagPath.fromNode(rootNode, 0);

  let count = 0;

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

  let referenceTag = null;

  for (let tag of Children.traverse(children)) {
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

      case Property: {
        let { node, reference } = tag.value;
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
  return Children.getSize(children) ? [TagPath.from(path, 0), TagPath.from(path, -1)] : null;
};

export const createNode = (openTag) => {
  if (!openTag || openTag.type === GapTag || openTag.type === NullTag) {
    return {
      flags: nodeFlags,
      type: openTag && ([NullTag, GapTag].includes(openTag.type) ? null : openTag.type),
      children: [],
      properties: {},
      attributes: openTag?.attributes || {},
    };
  } else {
    const { flags, type, attributes = {} } = openTag.value || {};
    return {
      flags,
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
      copy[key] = btree.fromValues(value);
    }
  }

  return copy;
};

export const branchNode = (node) => {
  const { flags, type, children, properties, attributes } = node;
  return {
    flags,
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

export const addToProperties = (properties, property) => {
  let { reference, node: value } = property;
  let { flags, name, isArray } = reference;

  if (!name) throw new Error();
  if (value === null) throw new Error();
  if (!hasOwn(property, 'binding')) throw new Error();

  if (Object.isFrozen(properties)) {
    throw new Error('not implemented');
  }

  let isInitializer = value === undefined || Array.isArray(value);

  let outerProperty = property;

  if (flags.expression && !isInitializer) {
    let shiftStack =
      getFirstNodeShiftStack(value) ||
      btree.fromValues([buildProperty(reference, null, buildStubNode(buildGapTag()))]);

    shiftStack = btree.push(shiftStack, property);
    outerProperty = buildProperty(reference, null, shiftStack);
  }

  if (isArray && !isInitializer) {
    properties[name] = buildProperty(
      reference,
      null,
      btree.push(properties[name]?.node || btree.fromValues([]), outerProperty),
    );
  } else {
    properties[name] = outerProperty;
  }

  return properties;
};

export const shiftToProperties = (properties, property) => {
  let { reference, node: value } = property;
  let { flags, name, isArray } = reference;

  if (!name) throw new Error();

  if (Object.isFrozen(properties)) {
    throw new Error('not implemented');
  }

  if (!flags.expression) {
    return addToProperties(properties, property);
  }
  let isInitializer = value === undefined || Array.isArray(value);

  let outerProperty;
  if (flags.expression && !isInitializer) {
    let shiftStack =
      getFirstNodeShiftStack(value) ||
      btree.fromValues([buildProperty(reference, null, buildStubNode(buildGapTag()))]);

    shiftStack = btree.push(shiftStack, property);
    outerProperty = buildProperty(reference, null, shiftStack);
  }

  if (isArray) {
    properties[name] = buildProperty(
      reference,
      null,
      btree.replaceAt(-1, properties[name].node, outerProperty),
    );
  } else {
    properties[name] = outerProperty;
  }
  return properties;
};

export const addProperty = (node, property) => {
  if (!node || !property) throw new Error();
  if (!Object.isFrozen(property)) throw new Error();

  let back1 = Children.getAt(-1, node.children);
  let back2 = Children.getAt(-2, node.children);

  let referenceTag;
  let bindingTag = null;

  if (property.node === null) {
    throw new Error();
  }

  let { node: value } = property;

  let isArrayInitializer = isArray(value);
  let isInitializer = value === undefined || isArrayInitializer;

  if (isArrayInitializer && value.length) throw new Error();

  if (!isInitializer && property.node.type && !property.binding) {
    throw new Error();
  }

  let foundShift = false;
  let foundBinding = false;
  if (back1.type === BindingTag) {
    bindingTag = property.binding && back1;
    referenceTag = back2;
    foundShift = foundBinding = true;
  } else if (back1.type === ReferenceTag) {
    bindingTag = property.binding && buildChild(BindingTag, property.binding);
    referenceTag = back1;
    foundShift = true;
  } else {
    bindingTag = property.binding && buildChild(BindingTag, property.binding);
    referenceTag = buildChild(ReferenceTag, property.reference);
  }

  if (!referenceTag) throw new Error();

  if (isInitializer) {
    if (property.reference.name) {
      addToProperties(node.properties, property);
    }

    if (!foundShift) {
      node.children = Children.push(node.children, referenceTag);
    }
    node.children = Children.push(node.children, buildInitializerTag(isArrayInitializer));

    return;
  }

  if (property.reference.name) {
    addToProperties(node.properties, property);
  }

  if (!foundShift) {
    node.children = Children.push(node.children, referenceTag);
  }
  if (!foundBinding && bindingTag) {
    node.children = Children.push(node.children, bindingTag);
  }
  node.children = Children.push(node.children, buildChild(Property, property));

  return node;
};

export const shiftProperty = (node, property) => {
  if (!node || !property) throw new Error();
  if (!property.reference) throw new Error();
  if (!Object.isFrozen(property)) throw new Error();

  let back1 = Children.getAt(-1, node.children);
  let back2 = Children.getAt(-2, node.children);

  let shiftTag;
  let bindingTag = null;

  if (property.node === null) {
    property.node = buildNullNode();
  }

  let { node: value } = property;

  let isArrayInitializer = isArray(value);
  let isInitializer = value === undefined || isArrayInitializer;

  if (!isInitializer && !property.binding) {
    throw new Error();
  }

  let foundShift = false;
  let foundBinding = false;
  if (back1.type === BindingTag) {
    bindingTag = back1;
    shiftTag = back2;
    foundShift = foundBinding = true;

    if (bindingTag.value !== property.binding) throw new Error();
  } else if ([ShiftTag, ReferenceTag].includes(back1.type)) {
    bindingTag = buildChild(BindingTag, property.binding);
    shiftTag = back1;
    foundShift = true;
  } else {
    bindingTag = buildChild(BindingTag, property.binding);
    shiftTag = buildChild(ReferenceTag, property.reference);
  }

  if (!shiftTag) throw new Error();

  if (isInitializer) {
    shiftToProperties(node.properties, property);

    if (!foundShift) {
      node.children = Children.push(node.children, shiftTag);
    }
    node.children = Children.push(node.children, buildInitializerTag(isArrayInitializer));

    return;
  }

  let shiftStack = node.properties[property.reference.name]?.node || btree.fromValues([]);
  let stackSize = shiftStack && property.reference.flags.expression ? btree.getSize(shiftStack) : 0;

  shiftToProperties(node.properties, property);

  let index = shiftTag.type === ReferenceTag ? 1 : shiftTag.value.index + 1;
  let height = btree.getSize(shiftStack) + 1;

  let newShiftTag = stackSize ? buildShiftTag(index, height) : shiftTag;

  if (!foundShift) {
    node.children = Children.push(node.children, newShiftTag);
  }
  if (!foundBinding) {
    node.children = Children.push(node.children, bindingTag);
  }
  node.children = Children.push(node.children, buildChild(Property, property));

  return node;
};

export const add = (node, referenceTag, value, bindingTag) => {
  let lastChild = Children.getAt(-1, node.children);
  let reference = referenceTag.value;
  let binding = bindingTag
    ? bindingTag.value
    : lastChild.type === BindingTag
    ? lastChild.value
    : buildBindingTag().value;
  return addProperty(node, buildProperty(reference, binding, value));
};

export const shift = (node, referenceTag, value, bindingTag) => {
  let lastChild = Children.getAt(-1, node.children);
  let reference = referenceTag.value;
  let binding = bindingTag
    ? bindingTag.value
    : lastChild.type === BindingTag
    ? lastChild.value
    : buildBindingTag().value;
  return shiftProperty(node, buildProperty(reference, binding, value));
};
