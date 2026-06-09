import EditorClient from '@/components/EditorClient';

export default function Page({ params }: { params: { id: string } }) {
  return <EditorClient key={params.id} noteId={params.id} />;
}
