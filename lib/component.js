import { buildNode, CloseTag, Function, isValidNode, OpenTag, parseTag } from 'agast';
import { Path } from './path.js';

export const renderToDOM = (component, props) => {
  let stack = [];
  let iter = component[Symbol.iterator]();
  let resultPath = null;

  outer: do {
    let componentPath = null;

    let step;
    while (!(step = iter.next()).done) {
      let tag_ = step.value;
      let tag = parseTag(tag_);

      switch (tag.type) {
        case OpenTag: {
          if (tag.value.flags.component) {
            componentPath = Path.advance(componentPath, tag_);
          } else {
            resultPath = Path.advance(resultPath, tag_);
          }

          if (tag.value.selfClosing) {
          }
          break;
        }

        case Function: {
          let fn = tag.value;

          if (!componentPath || componentPath.depth) throw new Error();
          let openTag = componentPath.node[0];

          componentPath = Path.advance(componentPath, fn);

          if (parseTag(openTag).value.selfClosing) {
            throw new Error();
          }

          break;
        }

        case CloseTag: {
          if (componentPath && !componentPath.depth) {
            stack.push({ iter, resultPath });

            componentPath = Path.advance(componentPath, tag_);

            let { node } = componentPath;
            let fn = node[1];

            iter = fn(node);
            continue outer;
          } else {
            resultPath = Path.advance(resultPath, tag_);
          }

          break;
        }

        default: {
          if (componentPath) {
            componentPath = Path.advance(componentPath, tag_);
          } else if (resultPath) {
            resultPath = Path.advance(resultPath, tag_);
          }
          break;
        }
      }
    }

    let finishedResultPath = resultPath;
    ({ iter, resultPath } = stack.pop());
    resultPath = Path.advance(resultPath, finishedResultPath.node);

    if (!stack.length) break;
  } while (true);

  return resultPath.node;
};
