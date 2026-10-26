import AnnouncementEditor from '../../../../../components/AnnouncementEditor';

export const metadata = { title: 'Edit announcement — CrewLink' };
export default async function EditAnnouncementPage({ params }) { const { id } = await params; return <AnnouncementEditor announcementId={id} />; }
