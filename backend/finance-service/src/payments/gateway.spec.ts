import { ZarinpalGateway, resolveGateway } from './gateway'

const mk = (responses: any[]) => {
  const calls: { url: string; body: any }[] = []
  const fetchImpl = async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) })
    return { ok: true, status: 200, json: async () => responses.shift() }
  }
  return { calls, gw: new ZarinpalGateway('mid', true, fetchImpl as never) }
}

describe('ZarinpalGateway', () => {
  it('request: آدرس سندباکس و مبلغ به تومان', async () => {
    const { gw, calls } = mk([{ data: { code: 100, authority: 'A0001' } }])
    const r = await gw.request({ amount: 1000, description: 'x', callbackUrl: 'https://cb' })
    expect(r.redirectUrl).toBe('https://sandbox.zarinpal.com/pg/StartPay/A0001')
    expect(calls[0].url).toContain('sandbox.zarinpal.com/pg/v4/payment/request.json')
    expect(calls[0].body).toMatchObject({ merchant_id: 'mid', amount: 1000, currency: 'IRT' })
  })
  it('request: رد درگاه خطا می‌دهد', async () => {
    const { gw } = mk([{ data: [], errors: { code: -9 } }])
    await expect(gw.request({ amount: 1, description: 'x', callbackUrl: 'u' })).rejects.toThrow()
  })
  it('verify: کد ۱۰۰ و ۱۰۱ موفق؛ بقیه ناموفق', async () => {
    expect((await mk([{ data: { code: 100, ref_id: 55 } }]).gw.verify({ authority: 'A', amount: 1 })).ok).toBe(true)
    expect((await mk([{ data: { code: 101 } }]).gw.verify({ authority: 'A', amount: 1 })).ok).toBe(true)
    expect((await mk([{ data: [], errors: { code: -50 } }]).gw.verify({ authority: 'A', amount: 1 })).ok).toBe(false)
  })
})

describe('resolveGateway', () => {
  it('بدون merchant id هیچ درگاهی فعال نیست (نه موفقیت ساختگی)', () => {
    expect(resolveGateway('zarinpal', {} as NodeJS.ProcessEnv)).toBeNull()
    expect(resolveGateway('zarinpal', { ZARINPAL_MERCHANT_ID: 'm' } as unknown as NodeJS.ProcessEnv)?.name).toBe('zarinpal')
    expect(resolveGateway('unknown', { ZARINPAL_MERCHANT_ID: 'm' } as unknown as NodeJS.ProcessEnv)).toBeNull()
  })
})
