'use client'

import { useState } from 'react'

export interface ColumnConfig {
  key: string
  label: string
  defaultWidth: number
  minWidth: number
}

interface ColumnPrefsState {
  visible: Record<string, boolean>
  widths: Record<string, number>
}

function buildDefaults(columns: ColumnConfig[]): ColumnPrefsState {
  return {
    visible: Object.fromEntries(columns.map((c) => [c.key, true])),
    widths: Object.fromEntries(columns.map((c) => [c.key, c.defaultWidth])),
  }
}

function loadPrefs(storageKey: string, columns: ColumnConfig[]): ColumnPrefsState {
  const defaults = buildDefaults(columns)
  if (typeof window === 'undefined') return defaults
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<ColumnPrefsState>
    return {
      visible: { ...defaults.visible, ...parsed.visible },
      widths: { ...defaults.widths, ...parsed.widths },
    }
  } catch {
    return defaults
  }
}

/** Column visibility + width, persisted to localStorage. Columns should be a stable (module-level) array.
 * Shared by the CRM and Processos table views so both get the same column-management UI. */
export function useColumnPrefs(storageKey: string, columns: ColumnConfig[]) {
  const [prefs, setPrefs] = useState<ColumnPrefsState>(() => loadPrefs(storageKey, columns))

  function persist(next: ColumnPrefsState) {
    setPrefs(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // storage full/unavailable — state still updates for this session
    }
  }

  function toggleVisible(key: string) {
    const currentlyVisible = Object.values(prefs.visible).filter(Boolean).length
    if (prefs.visible[key] && currentlyVisible <= 1) return // keep at least one column visible
    persist({ ...prefs, visible: { ...prefs.visible, [key]: !prefs.visible[key] } })
  }

  function setWidth(key: string, width: number) {
    const col = columns.find((c) => c.key === key)
    const min = col?.minWidth ?? 60
    persist({ ...prefs, widths: { ...prefs.widths, [key]: Math.max(Math.round(width), min) } })
  }

  function resetPrefs() {
    persist(buildDefaults(columns))
  }

  return {
    visible: prefs.visible,
    widths: prefs.widths,
    toggleVisible,
    setWidth,
    resetPrefs,
  }
}
