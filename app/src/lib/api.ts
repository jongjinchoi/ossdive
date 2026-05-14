import { invoke } from '@tauri-apps/api/core'
import type { Project, Stats, ListOpts } from './types'

export const listProjects = (opts: ListOpts = {}) =>
  invoke<Project[]>('list_projects', { sortBy: opts.sort_by, limit: opts.limit })

export const getStats = () => invoke<Stats>('get_stats')
