function sameIdentity(left, right) {
  return left !== undefined && left !== null
    && right !== undefined && right !== null
    && String(left) === String(right);
}

export function isOwner(config, userId, openId) {
  if (!config.owner?.bound) return false;
  return sameIdentity(config.owner.user_id, userId)
    || sameIdentity(config.owner.open_id, openId);
}

export function isDmAllowed(config, userId, openId) {
  if (isOwner(config, userId, openId)) return true;
  const policy = config.dmPolicy || 'owner';
  if (policy === 'open') return true;
  if (policy === 'owner') return false;

  const allowFrom = (Array.isArray(config.dmAllowFrom) ? config.dmAllowFrom : []).map(String);
  const normalizedUserId = userId === undefined || userId === null ? '' : String(userId);
  const normalizedOpenId = openId === undefined || openId === null ? '' : String(openId);
  return (normalizedUserId && allowFrom.includes(normalizedUserId))
    || (normalizedOpenId && allowFrom.includes(normalizedOpenId));
}

export async function authorizePrivateMessage({
  config,
  userId,
  openId,
  resolveUserName,
  saveConfig,
  resolveProtectedContent,
}) {
  let boundOwnerName = null;

  if (!config.owner?.bound) {
    boundOwnerName = await resolveUserName(userId, openId);
    const previousOwner = config.owner;
    config.owner = {
      bound: true,
      user_id: userId,
      open_id: openId,
      name: boundOwnerName,
    };
    if (!saveConfig(config)) {
      config.owner = previousOwner;
      return { allowed: false, bindingFailed: true, boundOwnerName: null, protectedContent: null };
    }
  }

  if (!isDmAllowed(config, userId, openId)) {
    return { allowed: false, bindingFailed: false, boundOwnerName, protectedContent: null };
  }

  const protectedContent = resolveProtectedContent
    ? await resolveProtectedContent()
    : null;
  return { allowed: true, bindingFailed: false, boundOwnerName, protectedContent };
}
