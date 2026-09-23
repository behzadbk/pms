/**
 * راه‌اندازی قابلیت‌های نیتیو وقتی فرانت‌اند داخل اپ Capacitor (Android/iOS) اجرا می‌شود.
 * در مرورگر/PWA هیچ کاری نمی‌کند.
 */
import { Capacitor } from '@capacitor/core'

export const isNativeApp = Capacitor.isNativePlatform()

export async function initNativeShell() {
  if (!isNativeApp) return
  document.documentElement.classList.add('native-app', `native-${Capacitor.getPlatform()}`)

  const [{ App }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
    import('@capacitor/app'),
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen'),
  ])

  try {
    await StatusBar.setStyle({ style: Style.Dark })
    if (Capacitor.getPlatform() === 'android') await StatusBar.setBackgroundColor({ color: '#16324f' })
  } catch {
    // StatusBar روی برخی نسخه‌ها در دسترس نیست — بی‌خطر
  }

  // دکمه‌ی Back اندروید: برگشت در تاریخچه‌ی Router، یا خروج از اپ در صفحه‌ی اول
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back()
    else App.exitApp()
  })

  await SplashScreen.hide().catch(() => undefined)
}
