import { redirect } from 'next/navigation';
import AdminDashboard from '@/components/AdminDashboard';
import { requireSuperAdmin } from '@/lib/admin';
import { AuthError } from '@/lib/auth';
import '@/styles/admin.css';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AdminPage() {
  try {
    await requireSuperAdmin();
  } catch (err) {
    if (err instanceof AuthError && err.status === 401) {
      redirect('/');
    }
    if (err instanceof AuthError && err.status === 403) {
      return (
        <div className="admin-denied">
          <h1>Access denied</h1>
          <p>Super admin only. Add your email to SUPER_ADMIN_EMAILS or set isAdmin.</p>
          <a href="/">Back to app</a>
        </div>
      );
    }
    throw err;
  }

  return <AdminDashboard />;
}
