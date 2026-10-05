import { detectCategory, matchAsset, type AssetLite } from './detect'

const assets: AssetLite[] = [
  { id: 'a', name: 'آسانسور A', category: 'elevator', location: 'لابی بلوک A' },
  { id: 'b', name: 'آسانسور B', category: 'elevator', location: 'لابی بلوک B' },
  { id: 'l', name: 'روشنایی راه‌پله طبقه ۳', category: 'lighting', location: 'راه‌پله طبقه ۳' },
]

describe('detectCategory', () => {
  it('کلیدواژه‌ی فارسی را به دسته می‌رساند', () => {
    expect(detectCategory('لامپ راه‌پله سوخته')).toBe('lighting')
    expect(detectCategory('آسانسور گیر کرده')).toBe('elevator')
    expect(detectCategory('پیشنهاد برای بهتر شدن فضای سبز')).toBeNull()
  })
})

describe('matchAsset', () => {
  it('آسانسور B را با توجه به حرف نام تشخیص می‌دهد، نه بلوک محل', () => {
    const r = matchAsset({ subject: 'صدای ساییدگی آسانسور B', body: '', location: 'بلوک A' }, assets)
    expect(r.category).toBe('elevator')
    expect(r.asset?.id).toBe('b')
  })

  it('اگر چند تجهیز هم‌دسته و شباهت ضعیف باشد، تجهیز مشخص نمی‌کند ولی کاندیدها را برمی‌گرداند', () => {
    const r = matchAsset({ subject: 'آسانسور خراب است', body: '' }, assets)
    expect(r.asset).toBeNull()
    expect(r.candidates).toHaveLength(2)
  })

  it('تنها تجهیز هم‌دسته را انتخاب می‌کند', () => {
    const r = matchAsset({ subject: 'لامپ سوخته', body: '' }, assets)
    expect(r.asset?.id).toBe('l')
  })

  it('اتصال دستی بر تشخیص خودکار مقدم است', () => {
    const r = matchAsset({ subject: 'آسانسور B خراب', body: '', assetId: 'a' }, assets)
    expect(r.asset?.id).toBe('a')
  })
})
