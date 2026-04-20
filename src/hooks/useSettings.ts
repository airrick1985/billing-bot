import { useEffect, useState } from 'react'
import type { ProviderId } from '../lib/providers'
import {
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  loadSettings,
  type ProviderConfig,
  type Settings,
} from '../lib/settings'

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }))
  }

  const updateProvider = (id: ProviderId, patch: Partial<ProviderConfig>) => {
    setSettings((s) => ({
      ...s,
      providers: { ...s.providers, [id]: { ...s.providers[id], ...patch } },
    }))
  }

  const setActiveProvider = (id: ProviderId) => {
    setSettings((s) => ({ ...s, activeProvider: id }))
  }

  const resetSpecPrompt = () => {
    setSettings((s) => ({ ...s, specPrompt: DEFAULT_SETTINGS.specPrompt }))
  }

  return { settings, update, updateProvider, setActiveProvider, resetSpecPrompt }
}
