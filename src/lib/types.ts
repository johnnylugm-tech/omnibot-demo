export type TagColor = 'gray' | 'red' | 'orange' | 'amber' | 'green' | 'teal' | 'blue' | 'violet';

export interface Note {
  id: string;
  userId: string;
  title: string;
  content: string;
  isPinned: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  userId: string;
  name: string;
  color: TagColor;
  createdAt: string;
}

export interface ShareLinkRow {
  id: string;
  noteId: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  noteTitle: string;
}

export const TAG_COLOR_HEX: Record<TagColor, string> = {
  gray: '#a1a1aa',
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  green: '#10b981',
  teal: '#14b8a6',
  blue: '#3b82f6',
  violet: '#8b5cf6',
};
