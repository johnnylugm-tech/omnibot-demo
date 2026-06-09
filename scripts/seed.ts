// 種子資料 — 建立 demo 帳號
import 'dotenv/config';
import { db } from '../src/db/client';
import { users, tags, notes, shareLinks } from '../src/db/schema';
import { hashPassword } from '../src/lib/auth';
import { generateShareToken } from '../src/lib/crypto';
import { eq } from 'drizzle-orm';

async function main() {
  const email = 'demo@example.com';
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) {
    console.log('seed: demo user already exists, skipping');
    return;
  }
  const [u] = await db
    .insert(users)
    .values({
      email,
      passwordHash: await hashPassword('demo1234'),
      name: 'Demo',
    })
    .returning();
  if (!u) throw new Error('seed failed');

  const [t1, t2, t3] = await db
    .insert(tags)
    .values([
      { userId: u.id, name: '工作', color: 'blue' },
      { userId: u.id, name: '個人', color: 'green' },
      { userId: u.id, name: '靈感', color: 'amber' },
    ])
    .returning();

  const [n1] = await db
    .insert(notes)
    .values({
      userId: u.id,
      title: '歡迎使用 Notes',
      content: `# 歡迎\n\n這是一則**範例筆記**。\n\n- 支援 Markdown\n- 自動保存\n- 標籤整理\n- 公開分享\n\n> 開始書寫吧。`,
      isPinned: true,
    })
    .returning();
  const [n2] = await db
    .insert(notes)
    .values({
      userId: u.id,
      title: '待辦清單',
      content: '- [ ] 撰寫 README\n- [ ] 跑一輪 E2E\n- [x] 啟動 Postgres',
    })
    .returning();
  if (n1 && t1 && t2) {
    await db
      .update(notes)
      .set({ isPinned: true })
      .where(eq(notes.id, n1.id));
    // note 對 tag 關聯 (M:N)
    const { noteTags } = await import('../src/db/schema');
    await db
      .insert(noteTags)
      .values([
        { noteId: n1.id, tagId: t1.id },
        { noteId: n1.id, tagId: t3.id },
        { noteId: n2!.id, tagId: t1.id },
      ]);
  }

  // 一個 share 連結
  if (n2) {
    const { tokenHash } = generateShareToken();
    await db.insert(shareLinks).values({ noteId: n2.id, tokenHash });
  }
  console.log('seed: created demo@example.com / demo1234');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
