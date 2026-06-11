import { invoke } from '@tauri-apps/api/core'
import type { Project, Stats, ListOpts } from './types'

export const listProjects = (opts: ListOpts = {}) =>
  invoke<Project[]>('list_projects', {
    sortBy: opts.sort_by,
    query: opts.query,
    filter: opts.filter,
    limit: opts.limit,
  })

export const getStats = () => invoke<Stats>('get_stats')

export const openCli = () => invoke<void>('open_cli')

export const quitApp = () => invoke<void>('quit_app')
