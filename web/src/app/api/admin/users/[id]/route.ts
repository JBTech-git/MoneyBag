import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse } from '@/lib/auth';
import { requireSuperAdmin, runAdminUserAction } from '@/lib/admin';
import { serializeAccess } from '@/lib/subscription';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const admin = await requireSuperAdmin();
    const body = await req.json();
    const action = String(body.action || '');
    const days = body.days != null ? Number(body.days) : undefined;

    const updated = await runAdminUserAction(admin.id, params.id, action, days);
    return NextResponse.json({
      ok: true,
      message: action === 'delete' ? 'User and all related data permanently deleted' : 'Updated',
      user: updated
        ? {
            id: updated.id,
            email: updated.email,
            access: serializeAccess(updated),
            is_admin: updated.isAdmin,
            disabled: Boolean(updated.disabledAt),
          }
        : null,
    });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error('admin action error', err);
    const message = err instanceof Error ? err.message : 'Action failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
