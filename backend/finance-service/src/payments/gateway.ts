/**
 * انتزاع درگاه پرداخت آنلاین. فقط وقتی درگاه واقعی/سندباکس پیکربندی شده باشد فعال است؛
 * وگرنه «موفقیتِ ساختگی» وجود ندارد و ساکن به ثبت پرداخت دستی (توسط حسابداری) هدایت می‌شود.
 *
 * زرین‌پال (API v4): ZARINPAL_MERCHANT_ID (الزامی)، ZARINPAL_SANDBOX=true برای سندباکس.
 * مبلغ‌ها تومان هستند (currency: IRT). ZARINPAL_BASE_URL فقط برای تست با سرور شبیه‌ساز است.
 */
export interface GatewayRequest { amount: number; description: string; callbackUrl: string; metadata?: Record<string, string> }
export interface GatewayRequestResult { authority: string; redirectUrl: string }
export interface GatewayVerifyResult { ok: boolean; refId?: string; message?: string }

export interface PaymentGateway {
  readonly name: string
  readonly sandbox: boolean
  request(p: GatewayRequest): Promise<GatewayRequestResult>
  verify(p: { authority: string; amount: number }): Promise<GatewayVerifyResult>
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>

export class ZarinpalGateway implements PaymentGateway {
  readonly name = 'zarinpal'
  constructor(
    private readonly merchantId: string,
    readonly sandbox: boolean,
    private readonly fetchImpl: FetchLike = (u, i) => fetch(u, i as RequestInit) as never,
    private readonly baseUrl?: string,
  ) {}

  private get host() {
    return this.baseUrl ?? (this.sandbox ? 'https://sandbox.zarinpal.com' : 'https://payment.zarinpal.com')
  }

  private async post(path: string, body: unknown) {
    const res = await this.fetchImpl(`${this.host}/pg/v4/payment/${path}.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    return json as { data?: any; errors?: any }
  }

  async request(p: GatewayRequest): Promise<GatewayRequestResult> {
    const j = await this.post('request', {
      merchant_id: this.merchantId,
      amount: p.amount,
      currency: 'IRT',
      description: p.description,
      callback_url: p.callbackUrl,
      metadata: p.metadata,
    })
    const authority = j.data?.authority
    if (j.data?.code !== 100 || !authority) throw new Error(`درگاه درخواست را نپذیرفت (${j.errors?.code ?? j.data?.code ?? 'نامشخص'})`)
    return { authority, redirectUrl: `${this.host}/pg/StartPay/${authority}` }
  }

  async verify(p: { authority: string; amount: number }): Promise<GatewayVerifyResult> {
    const j = await this.post('verify', { merchant_id: this.merchantId, amount: p.amount, authority: p.authority })
    const code = j.data?.code
    // ۱۰۰ = تأیید موفق، ۱۰۱ = قبلاً تأیید شده
    if (code === 100 || code === 101) return { ok: true, refId: j.data?.ref_id != null ? String(j.data.ref_id) : undefined }
    return { ok: false, message: `تأیید پرداخت ناموفق (${j.errors?.code ?? code ?? 'نامشخص'})` }
  }
}

export function resolveGateway(name: string | undefined, env: NodeJS.ProcessEnv = process.env): PaymentGateway | null {
  const g = (name ?? 'zarinpal').toLowerCase()
  if (g === 'zarinpal' && env.ZARINPAL_MERCHANT_ID) {
    return new ZarinpalGateway(env.ZARINPAL_MERCHANT_ID, env.ZARINPAL_SANDBOX === 'true', undefined, env.ZARINPAL_BASE_URL)
  }
  return null
}
