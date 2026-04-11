import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';

export async function POST() {
  try {
    const snap = await getDocs(collection(db, 'players'));
    let count = 0;

    for (const d of snap.docs) {
      const data = d.data();
      const countryNinja = data.country ? `${data.country}-ninja` : 'jordan-ninja';

      await updateDoc(doc(db, 'players', d.id), {
        // Reset currency
        coins: 100,
        totalCoinsSpent: 0,
        totalPlaytime: 0,

        // Reset inventory & skins
        inventory: [],
        ownedNinjas: [countryNinja],
        equippedNinja: countryNinja,

        // Reset titles
        titles: ['Newcomer'],
        activeTitle: 'Newcomer',

        // Reset stats
        stats: {
          totalKills: 0,
          totalDeaths: 0,
          totalHeadshots: 0,
          totalWins: 0,
          gamesPlayed: 0,
          chestsOpened: 0,
          foodOrdered: 0,
          longestStreak: 0,
          favoriteGame: '',
          gameStats: {},
        },

        // Reset social
        friends: [],
        bio: '',
        socialLinks: {},
        totalGiftsReceived: 0,

        // Reset VIP
        vip: {
          active: false,
          startedAt: 0,
          expiresAt: 0,
          trialUsed: true,
          tier: 'basic',
        },

        // Reset engagement
        dailyLoginStreak: 0,
        lastDailyLogin: 0,
        gamePlaytime: {},

        // Reset appearance (keep character but reset paid cosmetics)
        profilePhoto: '',
        profileColor: '',
        profileSkin: '',

        // Reset online status
        onlineStatus: {
          isOnline: false,
          currentActivity: '',
          lastSeen: Date.now(),
        },

        // Reset misc
        usernameChanges: 0,
        linkedAccounts: {},
        banned: false,
        lastLogin: Date.now(),
      });

      count++;
    }

    return NextResponse.json({
      success: true,
      playersReset: count,
      message: `Reset ${count} players. Kept: username, pin, phone, name, country, referralCode.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
