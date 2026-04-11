import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';

export async function POST() {
  try {
    const snap = await getDocs(collection(db, 'players'));
    let count = 0;
    for (const d of snap.docs) {
      await updateDoc(doc(db, 'players', d.id), { pin: '000000' });
      count++;
    }
    return NextResponse.json({ success: true, playersUpdated: count });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
