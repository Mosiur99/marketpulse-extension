export const MAX_BOOKMARKS = 200;

export function isBookmarked(bookmarks, id) {
  return bookmarks.some((bookmark) => bookmark.id === id);
}

/** Adds a full copy (so it survives article pruning) or removes it; newest first, capped. */
export function toggleBookmark(bookmarks, article, now) {
  if (isBookmarked(bookmarks, article.id)) {
    return bookmarks.filter((bookmark) => bookmark.id !== article.id);
  }
  return [{ ...article, bookmarkedAt: now }, ...bookmarks].slice(0, MAX_BOOKMARKS);
}

export function removeBookmark(bookmarks, id) {
  return bookmarks.filter((bookmark) => bookmark.id !== id);
}
