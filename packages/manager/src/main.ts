import { createApp } from 'vue'
import './style.css'
import './styles/file-browser.css'
import 'katex/dist/katex.min.css'
import App from './App.vue'
import router from './router'
import { createI18n } from 'vue-i18n'
import { APP_VERSION, APP_BUILD_TIME } from './version'

// Load locale messages
import en from './locales/en.json'
import zh from './locales/zh-CN.json'

const messages = {
  en,
  'zh-CN': zh
}

const isElectron = typeof window !== 'undefined' && !!(window as any).chronicleElectron?.isElectron

// Determine initial locale: prefer saved setting, otherwise browser language
const saved = localStorage.getItem('locale')
const browser = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'en'
const defaultLocale = saved || (browser.startsWith('zh') ? 'zh-CN' : 'en')

export const i18n = createI18n({
	legacy: false,
	locale: defaultLocale,
	fallbackLocale: 'en',
	messages
})

async function cleanupLegacyServiceWorker() {
	if (typeof window === 'undefined') return
	if (!('serviceWorker' in navigator)) return

	const CLEANUP_FLAG = 'chronicle.sw.cleanup.v1'

	try {
		const registrations = await navigator.serviceWorker.getRegistrations()
		if (!registrations.length) return

		await Promise.all(registrations.map((registration) => registration.unregister()))

		if ('caches' in window) {
			const keys = await caches.keys()
			await Promise.all(keys.map((key) => caches.delete(key)))
		}

		if (!sessionStorage.getItem(CLEANUP_FLAG)) {
			sessionStorage.setItem(CLEANUP_FLAG, '1')
			const nextUrl = new URL(window.location.href)
			nextUrl.searchParams.set('_sw_cleaned', String(Date.now()))
			window.location.replace(nextUrl.toString())
		}
	} catch (err) {
		console.warn('[Chronicle] Service worker cleanup failed:', err)
	}
}

cleanupLegacyServiceWorker()

const app = createApp(App)
app.use(router)
app.use(i18n)
// Set a CSS variable --vh equal to 1% of the window innerHeight.
// Useful as a fallback for mobile browsers where 100vh is unstable.
function setVh() {
	if (typeof window !== 'undefined' && window.innerHeight) {
		document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
	}
}
setVh();
window.addEventListener('resize', setVh);

// Mark body when running inside Electron (frameless window adjustments)
if (isElectron) {
  document.body.classList.add('is-electron')
}

// Expose Electron state globally (single source of truth for the whole app)
;(window as any).__chronicle = {
  isElectron,
  platform: isElectron ? (window as any).chronicleElectron?.platform : 'browser',
  version: APP_VERSION,
  buildTime: APP_BUILD_TIME,
}

// Which copy am I? There are several (dev server, dist via preview, Electron,
// deployed) and they look identical — this line is the discriminator. Open
// DevTools console and check it before debugging "the CMS didn't change".
console.info(`[Chronicle] v${APP_VERSION} · build ${APP_BUILD_TIME} · ${isElectron ? 'electron' : 'web'}`)

app.mount('#app')
