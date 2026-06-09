import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/session';
import { AppShell } from '@/components/AppShell';

export const dynamic = 'force-dynamic';

export default async function AuthedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin?next=/app');
  return (
    <AppShell user={{ id: user.id, email: user.email, name: user.name }}>
      {children}
    </AppShell>
  );
}
