import { registerSW } from 'virtual:pwa-register'

export const updateSW = registerSW({
  onNeedRefresh() {
    // Show update prompt to user
    if (confirm('New version available! Update?')) {
      updateSW(true)
    }
  },
  onOfflineReady() {
    console.log('App ready to work offline')
  },
  onRegistered(r) {
    // Check for updates every hour
    r && setInterval(() => {
      r.update()
    }, 60 * 60 * 1000)
  },
  onRegisterError(error) {
    console.error('SW registration error', error)
  }
})