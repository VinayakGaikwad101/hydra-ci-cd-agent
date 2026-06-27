import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Fetch user repositories and their past analysis runs
    const repos = await prisma.repository.findMany({
      where: { userId },
      include: {
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 10 // Take last 10 runs
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(repos);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { name, url, branch, testCommand } = body;

    if (!name || !url) {
      return NextResponse.json({ error: 'Repository name and Git URL are required.' }, { status: 400 });
    }

    const repository = await prisma.repository.create({
      data: {
        userId,
        name,
        url,
        branch: branch || 'main',
        testCommand: testCommand || 'npm test'
      }
    });

    return NextResponse.json(repository);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const repoId = searchParams.get('id');

    if (!repoId) {
      return NextResponse.json({ error: 'Repository ID is required' }, { status: 400 });
    }

    // Verify ownership before deleting
    const existing = await prisma.repository.findUnique({
      where: { id: repoId }
    });

    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.repository.delete({
      where: { id: repoId }
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
