'use client';

// Reserve is now inside the kiosk dashboard - redirect there
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ReservePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/kiosk');
  }, [router]);
  return null;
}
