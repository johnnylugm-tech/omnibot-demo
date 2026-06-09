import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  uniqueIndex,
  index,
  primaryKey,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------
// 預設 8 色票 (§3 FR-10 / §8.3 D-8)
export const TAG_COLORS = [
  'gray',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'violet',
] as const;
export type TagColor = (typeof TAG_COLORS)[number];

// -----------------------------------------------------------------------------
// Users
// -----------------------------------------------------------------------------
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(), // bcrypt cost=12 (§8.2 T-5)
    name: text('name'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    emailUnique: uniqueIndex('users_email_unique').on(t.email),
  }),
);

// -----------------------------------------------------------------------------
// Sessions (§8.2 T-4) — DB-backed, revocable
// Token = sha256(secret) so DB leak doesn't expose live cookies
// -----------------------------------------------------------------------------
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tokenUnique: uniqueIndex('sessions_token_unique').on(t.tokenHash),
    userIdx: index('sessions_user_idx').on(t.userId),
  }),
);

// -----------------------------------------------------------------------------
// Password reset tokens (FR-4 / §8.1 O-2 demo: console log magic link)
// -----------------------------------------------------------------------------
export const passwordResets = pgTable(
  'password_resets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tokenUnique: uniqueIndex('password_resets_token_unique').on(t.tokenHash),
  }),
);

// -----------------------------------------------------------------------------
// Notes
// -----------------------------------------------------------------------------
export const notes = pgTable(
  'notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default(''),
    content: text('content').notNull().default(''),
    isPinned: boolean('is_pinned').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }), // soft delete (§3 FR-9)
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // 列表複合索引 (§5 / §3 FR-5)
    listIdx: index('notes_list_idx').on(t.userId, t.deletedAt, t.isPinned, t.updatedAt),
  }),
);

// -----------------------------------------------------------------------------
// Tags
// -----------------------------------------------------------------------------
export const tags = pgTable(
  'tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').$type<TagColor>().notNull().default('gray'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // 同一使用者下 tag 名稱唯一
    userNameUnique: uniqueIndex('tags_user_name_unique').on(t.userId, t.name),
  }),
);

// -----------------------------------------------------------------------------
// NoteTag (M:N)
// -----------------------------------------------------------------------------
export const noteTags = pgTable(
  'note_tags',
  {
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.noteId, t.tagId] }),
    tagIdx: index('note_tags_tag_idx').on(t.tagId),
  }),
);

// -----------------------------------------------------------------------------
// Share links (FR-15) — 32-byte unguessable token (§4 NFR 安全)
// tokenHash = sha256(token); URL carries token, DB stores hash only.
// -----------------------------------------------------------------------------
export const shareLinks = pgTable(
  'share_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tokenUnique: uniqueIndex('share_links_token_unique').on(t.tokenHash),
    noteIdx: index('share_links_note_idx').on(t.noteId),
  }),
);

// -----------------------------------------------------------------------------
// Relations
// -----------------------------------------------------------------------------
export const usersRelations = relations(users, ({ many }) => ({
  notes: many(notes),
  tags: many(tags),
  sessions: many(sessions),
}));

export const notesRelations = relations(notes, ({ one, many }) => ({
  user: one(users, { fields: [notes.userId], references: [users.id] }),
  tags: many(noteTags),
  shareLinks: many(shareLinks),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  user: one(users, { fields: [tags.userId], references: [users.id] }),
  notes: many(noteTags),
}));

export const noteTagsRelations = relations(noteTags, ({ one }) => ({
  note: one(notes, { fields: [noteTags.noteId], references: [notes.id] }),
  tag: one(tags, { fields: [noteTags.tagId], references: [tags.id] }),
}));

// -----------------------------------------------------------------------------
// Inferred types
// -----------------------------------------------------------------------------
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type ShareLink = typeof shareLinks.$inferSelect;
export type Session = typeof sessions.$inferSelect;

// Re-export sql helper for migrations / raw queries
export { sql };
