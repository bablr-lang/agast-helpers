import { CloseNodeTag, ReferenceTag } from './symbols.js';

export function* allTagPathsFor(range, options = {}) {
  if (range == null) return;

  const { unshift = false } = options;
  let startPath = range[0];
  let endPath = range[1];
  let path = startPath;

  while (path) {
    if (path.inner && path.previousSibling.tag.type === ReferenceTag) {
      path = path.inner.tagPathAt(0);
    }

    if (path.path.depth < startPath.path.depth) {
      return;
    }

    yield path;

    if (endPath && endPath.equalTo(path)) {
      return;
    }

    // let propPath = path.path.parent && path.path.parent.tagPathAt(path.path.parentIndex, 2);

    // if (endPath && path.tag.type === CloseNodeTag && propPath && endPath.equalTo(propPath)) {
    //   return;
    // }
    path = unshift ? path.nextUnshifted : path.next;
  }
}

export function* allTagsFor(range, options = {}) {
  for (let path of allTagPathsFor(range, options)) {
    yield path.tag;
  }
}
