import { HttpException } from '@nestjs/common'
import { FREE_ATTEMPTS, LoginThrottleService, lockoutSeconds, throttleKey } from './login-throttle.service'

describe('lockoutSeconds', () => {
  it('تا آستانه قفلی ندارد', () => {
    for (let n = 0; n <= FREE_ATTEMPTS; n++) expect(lockoutSeconds(n)).toBe(0)
  })
  it('بعد از آستانه نمایی بالا می‌رود و سقف ۱۵ دقیقه دارد', () => {
    expect(lockoutSeconds(FREE_ATTEMPTS + 1)).toBe(30)
    expect(lockoutSeconds(FREE_ATTEMPTS + 2)).toBe(60)
    expect(lockoutSeconds(FREE_ATTEMPTS + 3)).toBe(120)
    expect(lockoutSeconds(100)).toBe(900)
  })
})

describe('throttleKey', () => {
  it('به حروف بزرگ/کوچک و فاصله حساس نیست و بین scopeها جداست', () => {
    expect(throttleKey('t:1', ' Admin@X.com ')).toBe(throttleKey('t:1', 'admin@x.com'))
    expect(throttleKey('t:1', 'a')).not.toBe(throttleKey('t:2', 'a'))
    expect(throttleKey('t:1', 'a', '1.1.1.1')).not.toBe(throttleKey('t:1', 'a'))
  })
  it('شناسه‌ی خام در کلید نیست', () => {
    expect(throttleKey('t:1', 'secret-user')).not.toContain('secret')
  })
})

describe('LoginThrottleService.assertAllowed', () => {
  const make = (wait: number) =>
    new LoginThrottleService({ withPlatformAccess: async (fn: any) => fn({ query: async () => ({ rows: [{ wait: String(wait) }] }) }) } as any)

  it('وقتی قفل نیست رد نمی‌شود', async () => {
    await expect(make(0).assertAllowed('s', 'u', '1.1.1.1')).resolves.toBeUndefined()
  })
  it('وقتی قفل است ۴۲۹ می‌دهد', async () => {
    await expect(make(41.2).assertAllowed('s', 'u', '1.1.1.1')).rejects.toBeInstanceOf(HttpException)
    await make(41.2).assertAllowed('s', 'u', 'ip').catch((e: HttpException) => expect(e.getStatus()).toBe(429))
  })
})
