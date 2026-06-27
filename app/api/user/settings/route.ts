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
    
    // Find or create default user settings
    let settings = await prisma.userSetting.findUnique({
      where: { userId }
    });

    if (!settings) {
      settings = await prisma.userSetting.create({
        data: { userId }
      });
    }

    // Mask keys before returning to frontend
    return NextResponse.json({
      geminiApiKey: settings.geminiApiKey ? '••••••••••••••••' : '',
      githubToken: settings.githubToken ? '••••••••••••••••' : '',
      hasGeminiKey: !!settings.geminiApiKey,
      hasGithubToken: !!settings.githubToken
    });
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
    const { geminiApiKey, githubToken } = body;

    // Load existing settings
    const existing = await prisma.userSetting.findUnique({
      where: { userId }
    });

    const updateData: any = {};
    
    // Only update if not masked placeholder and value changed
    if (geminiApiKey && geminiApiKey !== '••••••••••••••••') {
      updateData.geminiApiKey = geminiApiKey;
    } else if (geminiApiKey === '') {
      updateData.geminiApiKey = null; // Clear key
    }
    
    if (githubToken && githubToken !== '••••••••••••••••') {
      updateData.githubToken = githubToken;
    } else if (githubToken === '') {
      updateData.githubToken = null; // Clear key
    }

    const settings = await prisma.userSetting.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        geminiApiKey: updateData.geminiApiKey || null,
        githubToken: updateData.githubToken || null
      }
    });

    return NextResponse.json({
      success: true,
      hasGeminiKey: !!settings.geminiApiKey,
      hasGithubToken: !!settings.githubToken
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
