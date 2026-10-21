import { ForbiddenException } from '@nestjs/common'
import type { PoolClient } from 'pg'
import type { JwtPayload } from '../auth/decorators/current-user.decorator'

export const isAdmin = (u: JwtPayload) => u.role === 'admin'
export const hasServiceDesk = (u: JwtPayload) => u.role === 'staff' && (u.perms ?? []).includes('service_desk')

/** کد دپارتمان‌هایی که این کاربر «مدیر»شان است (identity.departments.manager_user_id) */
export async function managedDepartments(client: PoolClient, userId: string): Promise<string[]> {
  const r = await client.query<{ code: string }>(
    `SELECT code FROM identity.departments WHERE manager_user_id = $1 AND is_active`,
    [userId],
  )
  return r.rows.map((x) => x.code)
}

/** مدیر ساختمان یا مدیر همان دپارتمان */
export async function canManageDept(client: PoolClient, user: JwtPayload, dept: string): Promise<boolean> {
  if (isAdmin(user)) return true
  if (!hasServiceDesk(user)) return false
  return (await managedDepartments(client, user.sub)).includes(dept)
}

export async function needManageDept(client: PoolClient, user: JwtPayload, dept: string) {
  if (!(await canManageDept(client, user, dept))) throw new ForbiddenException('فقط مدیر همین دپارتمان یا مدیر ساختمان')
}
