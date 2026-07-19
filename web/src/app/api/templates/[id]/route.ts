import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireManageAccess } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireManageAccess();
    const id = Number(params.id);
    const existing = await prisma.quickTemplate.findFirst({ where: { id, userId: user.id } });
    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
    await prisma.quickTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true, message: 'Template deleted' });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Could not delete template' }, { status: 500 });
  }
}
