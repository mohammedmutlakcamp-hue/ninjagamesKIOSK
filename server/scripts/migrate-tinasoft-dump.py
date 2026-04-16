#!/usr/bin/env python
"""
Reads EasyCafe (Tinasoft) Paradox database `maindbex.DB` and writes a clean
JSON file ready for the Node push script.

Each user is shaped to match the NinjaKiosk Firestore `players` schema, with
two extra fields for the legacy-login flow:
  - isLegacyUser:  true  -> login UI shows free-text password input
  - legacyPassword: <plaintext from EasyCafe SIFRE field>
  - pin: ''         -> forces 6-digit PIN setup on first successful login

Run:
  python scripts/migrate-tinasoft-dump.py
"""
import json
import os
import sys
from datetime import datetime, date

from pypxlib import Table

SOURCE_DB = r"C:\Users\vip-2\Downloads\TinaSoft\Easy Cafe Server\database\maindbex.DB"
OUT_DIR   = os.path.join(os.path.dirname(__file__), "migration-data")
OUT_USERS = os.path.join(OUT_DIR, "tinasoft-users.json")
OUT_ISSUES = os.path.join(OUT_DIR, "tinasoft-issues.json")

DEFAULT_NINJA_TYPE  = "neon"
DEFAULT_NINJA_COLOR = "#39FF14"
NOW_MS = int(datetime.now().timestamp() * 1000)


def to_ms(d):
    if isinstance(d, datetime):
        return int(d.timestamp() * 1000)
    if isinstance(d, date):
        return int(datetime(d.year, d.month, d.day).timestamp() * 1000)
    return NOW_MS


def normalize_phone(raw):
    """Jordan numbers: 0790720314 -> 962790720314. Already-international left alone."""
    if not raw:
        return ""
    p = "".join(c for c in str(raw) if c.isdigit())
    if not p:
        return ""
    if p.startswith("962"):
        return p
    if p.startswith("0"):
        return "962" + p[1:]
    return p


def build_player(row):
    username = (row.KULLANICIKODU or "").strip().lower()
    raw_pwd  = (row.SIFRE or "").strip()
    phone    = normalize_phone(row.KULLANICIKODU or row.TEL or "")

    issues = []
    if not username:
        issues.append("missing_username")
    if not raw_pwd:
        issues.append("missing_password")
    if raw_pwd and not raw_pwd.isdigit():
        issues.append("non_numeric_password")
    if raw_pwd and raw_pwd.isdigit() and len(raw_pwd) > 6:
        issues.append("password_longer_than_6")

    remaining_min = int(row.DAKIKAHAKKI or 0)
    used_min      = int(row.KULLANILANSURE or 0)
    aktif         = bool(row.AKTIF) if row.AKTIF is not None else True

    player = {
        "username": username,
        "phone": phone,
        "firstName": (row.ADI or "").strip(),
        "lastName": (row.SOYADI or "").strip(),

        # Legacy-login fields
        "pin": "",
        "isLegacyUser": True,
        "legacyPassword": raw_pwd,

        "coins": 0,
        "totalCoinsSpent": 0,
        "remainingPlaytime": remaining_min,
        "totalPlaytime": used_min,

        "ninjaType": DEFAULT_NINJA_TYPE,
        "character": {
            "skinColor": DEFAULT_NINJA_COLOR,
            "outfitId": "outfit_default",
            "maskId": "mask_default",
            "accessoryId": "none",
            "equippedSkins": [],
            "ninjaType": DEFAULT_NINJA_TYPE,
        },
        "inventory": [],
        "friends": [],
        "titles": ["Newcomer"],
        "activeTitle": "Newcomer",
        "stats": {
            "totalKills": 0, "totalDeaths": 0, "totalHeadshots": 0, "totalWins": 0,
            "gamesPlayed": 0, "chestsOpened": 0, "foodOrdered": 0, "longestStreak": 0,
            "favoriteGame": "", "gameStats": {},
        },
        "onlineStatus": {"isOnline": False, "currentActivity": "", "lastSeen": NOW_MS},
        "createdAt": to_ms(row.ACILISTARIHI),
        "lastLogin": 0,
        "banned": not aktif,

        # Migration provenance
        "migratedFrom": "easycafe",
        "migratedAt": NOW_MS,
        "_source": {
            "userKod": row.KULLANICIKODU,
            "tel": row.TEL,
            "email": (row.EMAIL or "").strip() or None,
        },
    }
    return player, issues


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    if not os.path.exists(SOURCE_DB):
        print(f"ERROR: source DB not found: {SOURCE_DB}")
        sys.exit(1)

    table = Table(SOURCE_DB)
    total = len(table)
    print(f"Reading {total} rows from {SOURCE_DB}\n")

    clean = []
    issues = []
    skipped_pc_accounts = []
    seen_phones = {}
    skipped_empty = 0
    duplicates = 0

    for row in table:
        player, row_issues = build_player(row)

        if not player["username"]:
            skipped_empty += 1
            continue

        u = player["username"]
        first = (player["firstName"] or "").upper()
        if (
            first.startswith("ANONYMOUS")
            or u.startswith("desktop-")
            or u.startswith("vip-")
            or u == "owner"
        ):
            skipped_pc_accounts.append({"username": u, "name": player["firstName"]})
            continue

        phone_key = player["phone"] or player["username"]
        if phone_key in seen_phones:
            duplicates += 1
            existing_idx = seen_phones[phone_key]
            if player["totalPlaytime"] > clean[existing_idx]["totalPlaytime"]:
                clean[existing_idx] = player
            continue
        seen_phones[phone_key] = len(clean)
        clean.append(player)

        if row_issues:
            issues.append({
                "username": player["username"],
                "phone": player["phone"],
                "name": f"{player['firstName']} {player['lastName']}".strip(),
                "legacyPassword": player["legacyPassword"],
                "issues": row_issues,
            })

    with open(OUT_USERS, "w", encoding="utf-8") as f:
        json.dump(clean, f, ensure_ascii=False, indent=2, default=str)
    with open(OUT_ISSUES, "w", encoding="utf-8") as f:
        json.dump(issues, f, ensure_ascii=False, indent=2, default=str)

    print("== SUMMARY ==")
    print(f"Source rows:                {total}")
    print(f"Skipped (no username):      {skipped_empty}")
    print(f"Skipped (PC/anon accounts): {len(skipped_pc_accounts)}")
    print(f"Duplicates merged:          {duplicates}")
    print(f"Clean users to push:        {len(clean)}")
    print(f"Users flagged:              {len(issues)}")
    print()
    print(f"Wrote: {OUT_USERS}")
    print(f"Wrote: {OUT_ISSUES}")
    if clean:
        print("\nSample (first user):")
        sample = {k: v for k, v in clean[0].items() if k not in ("character", "stats", "onlineStatus", "_source")}
        print(json.dumps(sample, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
