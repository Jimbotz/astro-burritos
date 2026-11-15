/** Icons of the impact lenses (lucide-react), by lens, status and component (IMPLEMENTACION_LENTES_IMPACTO §10.3–10.4). */
import { AlertTriangle, Building2, CircleHelp, CircleMinus, CloudRain, Droplets, Eye, Flag, Gauge, Moon, ShieldAlert, Sun, ThermometerSun, UsersRound, Waves, Wind, type LucideIcon } from 'lucide-react'
import type { ImpactLens } from '@/lib/api/impact-types'
import type { StatusIconName } from './impact-status'

export const LENS_ICONS: Record<ImpactLens, LucideIcon[]> = {
  water: [Droplets, CloudRain, Wind, Gauge, Waves, AlertTriangle],
  heat: [ThermometerSun, Sun, Moon, UsersRound, Building2, ShieldAlert],
}

export const STATUS_ICONS: Record<StatusIconName, LucideIcon> = { 'circle-help': CircleHelp, 'circle-minus': CircleMinus, eye: Eye, flag: Flag, 'shield-alert': ShieldAlert }

/** Icon of each decision component returned by the backend. */
export const COMPONENT_ICONS: Record<string, LucideIcon> = {
  supplyStress: CloudRain, demandStress: Wind, storageStress: Waves, observedDrought: AlertTriangle,
  warmNights: Moon, warmDays: Sun, hotExtreme: ThermometerSun, coldExtreme: Moon, urbanExposure: Building2,
}

/** Icon of each indicator id returned by the backend. */
export const INDICATOR_ICONS: Record<string, LucideIcon> = {
  precipitation: CloudRain, 'precipitation-wet': CloudRain, et0: Wind, 'et0-wet': Wind, balance: Gauge, 'balance-wet': Gauge, 'root-zone-wetness': Waves, 'observed-drought': AlertTriangle,
  TN90p: Moon, TX90p: Sun, TXx: ThermometerSun, TNn: Moon, TX: ThermometerSun, TN: Moon, T2M: ThermometerSun, 'population-exposure': UsersRound,
}
