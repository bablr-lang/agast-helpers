import { CloseNodeTag, ReferenceTag } from './symbols.js';

export function* allTagPathsFor(range, options = {}) {
  if (range == null) return;

  const { unshift = false } = options;
  let startPath = range[0];
  let endPath = range[1];
  let tagPath = startPath;

  while (tagPath) {
    if (tagPath.inner && tagPath.previousSibling.tag.type === ReferenceTag) {
      tagPath = tagPath.inner.tagPathAt(0);
    }

    if (tagPath.path.depth < startPath.path.depth) {
      return;
    }

    yield tagPath;

    if (tagPath.tag.type === CloseNodeTag) {
      let propPath = tagPath.path.parentPropertyPath;
      if (endPath && propPath && endPath.equalTo(propPath.path.tagPathAt(propPath.tagsIndex, 2))) {
        return;
      }
    }

    if (endPath && endPath.equalTo(tagPath)) {
      return;
    }

    tagPath = unshift ? tagPath.nextUnshifted : tagPath.next;
  }
}

export function* allTagsFor(range, options = {}) {
  for (let path of allTagPathsFor(range, options)) {
    yield path.tag;
  }
}
