import { SetMetadata } from '@nestjs/common'

export type AppRole = 'admin' | 'resident' | 'guard' | 'staff' | 'accountant' | 'super_admin'

export const ROLES_KEY = 'roles'
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles)
