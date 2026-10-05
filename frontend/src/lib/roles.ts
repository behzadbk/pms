import type { Role } from './types'

export interface RoleLabel {
  id: Role
  label: string
  /** توضیح کوتاه نقش (زیر نام کاربر) */
  sub: string
}

/** برچسب نقش‌ها — فقط متن ثابت رابط کاربری؛ نام و اطلاعات کاربر همیشه از نشست واقعی می‌آید */
export const roles: RoleLabel[] = [
  { id: 'admin', label: 'مدیر ساختمان', sub: 'مدیریت مجتمع' },
  { id: 'resident', label: 'ساکن / مالک', sub: 'ساکن مجتمع' },
  { id: 'guard', label: 'نگهبانی', sub: 'نگهبانی و تردد' },
  { id: 'staff', label: 'تکنسین / پرسنل', sub: 'کارکنان مجتمع' },
  { id: 'accountant', label: 'حسابداری', sub: 'حسابدار ساختمان' },
  { id: 'super_admin', label: 'Super-Admin', sub: 'مدیر پلتفرم' },
  { id: 'child', label: 'کودک (حالت والدین)', sub: 'حالت والدین' },
]
