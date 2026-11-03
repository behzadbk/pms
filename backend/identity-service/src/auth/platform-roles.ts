/** نقش داخل تیم پلتفرم (همه‌شان role='super_admin' در JWT دارند؛ این نقش دسترسی ریزتر را تعیین می‌کند) */
export type PlatformAdminRole = 'owner' | 'support' | 'sales'

export const PLATFORM_ROLES: PlatformAdminRole[] = ['owner', 'support', 'sales']
