import { NextResponse } from 'next/server';
import { seedDatabase } from '../../../../prisma/seed';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await seedDatabase();
    return NextResponse.json({ success: true, message: 'Database seeded with Demo Project & Workers' });
  } catch (error: any) {
    console.error('Error seeding DB:', error);
    return NextResponse.json({ error: error.message || 'Failed to seed database' }, { status: 500 });
  }
}
