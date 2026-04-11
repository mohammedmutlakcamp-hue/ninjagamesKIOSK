/**
 * Get the avatar image source for a player.
 * Returns custom profilePhoto if uploaded, otherwise falls back to ninja type image.
 */
export function getAvatarSrc(player: { profilePhoto?: string; ninjaType?: string } | null | undefined): string {
  if (player?.profilePhoto) return player.profilePhoto;
  return `/img/pfp-${player?.ninjaType || 'neon'}.png`;
}

/**
 * Same as getAvatarSrc but takes individual fields (for friend data that's not a full player doc).
 */
export function getAvatarSrcFromFields(profilePhoto?: string, ninjaType?: string): string {
  if (profilePhoto) return profilePhoto;
  return `/img/pfp-${ninjaType || 'neon'}.png`;
}
