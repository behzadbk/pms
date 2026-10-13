import { ErpAdapter } from './adapter'
import { WebhookAdapter } from './webhook.adapter'

/** آداپترهای ثبت‌شده — برای نرم‌افزار جدید فقط اینجا اضافه کنید (راهنما در adapter.ts) */
export const ADAPTERS: Record<string, ErpAdapter> = {
  webhook: new WebhookAdapter(),
}

export function adapterFor(type: string): ErpAdapter | undefined {
  return ADAPTERS[type]
}
