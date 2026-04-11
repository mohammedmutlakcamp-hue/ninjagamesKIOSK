import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, deleteDoc, doc, query, where } from 'firebase/firestore';

export async function POST() {
  try {
    // Only clean up calls that ended more than 1 hour ago, or stale ringing calls older than 2 minutes
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const twoMinAgo = now - 120000;

    const snap = await getDocs(collection(db, 'calls'));
    let count = 0;

    for (const d of snap.docs) {
      const data = d.data();
      const isEnded = data.status === 'ended' || data.status === 'declined';
      const isStaleRinging = data.status === 'ringing' && data.startedAt < twoMinAgo;
      const isOldEnded = isEnded && (data.endedAt || data.startedAt) < oneHourAgo;

      if (!isOldEnded && !isStaleRinging) continue;

      // Delete known 1:1 subcollections
      for (const sub of ['callerCandidates', 'receiverCandidates']) {
        const subSnap = await getDocs(collection(db, 'calls', d.id, sub));
        for (const s of subSnap.docs) {
          await deleteDoc(doc(db, 'calls', d.id, sub, s.id));
        }
      }

      // Delete group call candidate subcollections (candidates_{pairKey}_from_{uid})
      // Firestore doesn't list subcollections from client SDK, so we reconstruct from participants
      const participants: string[] = data.participants || [];
      if (participants.length > 1) {
        for (let i = 0; i < participants.length; i++) {
          for (let j = i + 1; j < participants.length; j++) {
            const pk = [participants[i], participants[j]].sort().join('_');
            for (const uid of [participants[i], participants[j]]) {
              const subCol = collection(db, 'calls', d.id, `candidates_${pk}_from_${uid}`);
              const subSnap = await getDocs(subCol);
              for (const s of subSnap.docs) {
                await deleteDoc(doc(db, 'calls', d.id, `candidates_${pk}_from_${uid}`, s.id));
              }
            }
          }
        }
      }

      await deleteDoc(doc(db, 'calls', d.id));
      count++;
    }

    return NextResponse.json({ success: true, callsDeleted: count });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
