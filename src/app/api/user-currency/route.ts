import { NextRequest, NextResponse } from 'next/server';
import { userSettingsDb } from '@/lib/db/schema';

export async function GET() {
  const settings = userSettingsDb.get();
  return NextResponse.json({ defaultCurrency: settings?.defaultCurrency || 'USD' });
}

export async function POST(request: NextRequest) {
  const { defaultCurrency } = await request.json();
  if (!defaultCurrency || typeof defaultCurrency !== 'string') {
    return NextResponse.json({ error: 'defaultCurrency is required' }, { status: 400 });
  }
  userSettingsDb.update({ defaultCurrency });
  return NextResponse.json({ success: true, defaultCurrency });
} 