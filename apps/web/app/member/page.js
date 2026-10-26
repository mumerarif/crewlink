import Link from 'next/link';
import MemberInbox from '../../components/MemberInbox';

export default function MemberDashboard() {
  return <><div className="page-heading"><div><p className="eyebrow">Member inbox</p><h2>Messages for you</h2><p>Announcements included here were addressed to your authenticated member record.</p></div><Link className="button secondary" href="/member/profile">View profile</Link></div><section className="card"><div className="section-heading"><div><h3>Latest announcements</h3><p>Unread messages appear with a blue marker.</p></div></div><MemberInbox compact /></section><div className="center-action"><Link href="/member/announcements">Open full inbox</Link></div></>;
}
