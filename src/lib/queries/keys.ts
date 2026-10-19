/**
 * Query keys, scoped by user so that signing out (a new anonymous user) or
 * signing in to another account never shows data from the previous one.
 */
export const queryKeys = {
  all: (userId: string) => ["user", userId] as const,
  lists: (userId: string) => ["user", userId, "lists"] as const,
  /** Everything under one list: items, categories, catalog, members. */
  list: (userId: string, listId: string) =>
    ["user", userId, "list", listId] as const,
  items: (userId: string, listId: string) =>
    ["user", userId, "list", listId, "items"] as const,
  categories: (userId: string, listId: string) =>
    ["user", userId, "list", listId, "categories"] as const,
  catalog: (userId: string, listId: string) =>
    ["user", userId, "list", listId, "catalog"] as const,
  members: (userId: string, listId: string) =>
    ["user", userId, "list", listId, "members"] as const,
  /** What an invite link says before the user joins (invite_preview). */
  invite: (userId: string, token: string) =>
    ["user", userId, "invite", token] as const,
};
