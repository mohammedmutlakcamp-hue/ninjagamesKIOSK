import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';

// Resets the daily free-chest cooldown for every player so they can claim again.
export async function POST() {
  try {
    const snap = await getDocs(collection(db, 'players'));
    let count = 0;
    for (const d of snap.docs) {
      await updateDoc(doc(db, 'players', d.id), { lastFreeChest: 0 });
      count++;
    }
    return NextResponse.json({ success: true, playersReset: count });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
