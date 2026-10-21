import { fitsSlotHours, buildSlots, tehranInstant, tehranToday } from './slots'

describe('buildSlots — ساعت پُر قابل انتخاب نیست', () => {
  const date = '2030-01-15'
  const now = new Date('2030-01-15T06:00:00Z') // ۰۹:۳۰ تهران

  it('ساعت رزروشده (در انتظار یا قطعی) taken است و رزرو ردشده/لغوشده نه', () => {
    const busy = [
      { start: tehranInstant(date, 10), end: tehranInstant(date, 11), status: 'pending' },
      { start: tehranInstant(date, 18), end: tehranInstant(date, 19), status: 'confirmed' },
      { start: tehranInstant(date, 19), end: tehranInstant(date, 20), status: 'rejected' },
    ]
    const s = buildSlots(date, [8, 9, 10, 11, 16, 17, 18, 19, 20], busy, now)
    const by = Object.fromEntries(s.map((x) => [x.hour, x.status]))
    expect(by[10]).toBe('taken')
    expect(by[18]).toBe('taken')
    expect(by[19]).toBe('free')
    expect(by[8]).toBe('past')
    expect(by[9]).toBe('past')
    expect(by[11]).toBe('free')
  })

  it('رزرو چندساعته همه‌ی ساعت‌های هم‌پوشان را پر می‌کند', () => {
    const busy = [{ start: tehranInstant(date, 16), end: tehranInstant(date, 19), status: 'confirmed' }]
    const s = buildSlots(date, [16, 17, 18, 19], busy, now)
    expect(s.map((x) => x.status)).toEqual(['taken', 'taken', 'taken', 'free'])
  })

  it('ساعت‌ها به وقت تهران ساخته می‌شوند', () => {
    expect(tehranInstant('2030-01-15', 17).toISOString()).toBe('2030-01-15T13:30:00.000Z')
    expect(tehranToday(new Date('2030-01-15T21:00:00Z'))).toBe('2030-01-16')
  })
})

describe('fitsSlotHours', () => {
  const at = (h: number, m = 0) => new Date(`2026-10-10T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+03:30`)
  it('ساعت شروع و همه‌ی ساعت‌های نوبت باید در slot_hours باشد', () => {
    expect(fitsSlotHours(at(16), 1, [16, 17, 18])).toBe(true)
    expect(fitsSlotHours(at(16), 3, [16, 17, 18])).toBe(true)
    expect(fitsSlotHours(at(17), 3, [16, 17, 18])).toBe(false)
    expect(fitsSlotHours(at(15), 1, [16, 17, 18])).toBe(false)
  })
  it('دقیقه‌ی غیرصفر و عبور از نیمه‌شب رد می‌شود', () => {
    expect(fitsSlotHours(at(16, 30), 1, [16, 17])).toBe(false)
    expect(fitsSlotHours(at(23), 2, [23, 0])).toBe(false)
  })
})
