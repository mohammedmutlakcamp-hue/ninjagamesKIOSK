import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBZc2a9hjuk4m1p1h2JiePqHRGTS7qhf74",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "ninja-games-kiosk.firebaseapp.com",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://ninja-games-kiosk-default-rtdb.firebaseio.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "ninja-games-kiosk",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "ninja-games-kiosk.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "245461125914",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:245461125914:web:a0c0262040970f050cfaa3",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const storage = getStorage(app);

// Ensure every Firestore call has an authenticated user (anonymous if nothing
// else). Lets us tighten Firestore rules from `allow write: if true` to
// `if request.auth != null` without breaking the kiosk web UI. Persists in
// localStorage so the same anonymous UID is reused across reloads.
if (typeof window !== 'undefined') {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      signInAnonymously(auth).catch((err) => {
        console.error('[firebase] anonymous sign-in failed:', err);
      });
    }
  });
}

export default app;
