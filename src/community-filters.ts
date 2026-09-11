import type { Community, Locale, Observation, SavedFilter } from '../shared/contracts'
import { tx } from './i18n'

export type CommunityFilter = Omit<SavedFilter, 'id' | 'name'>

export const defaultCommunityFilter: CommunityFilter = {
  search: '',
  exclude: '',
  kind: 'all',
  location: 'all',
  role: 'all',
  observation: 'all',
  inactiveDays: 0,
  minMembers: null,
  maxMembers: null
}

const terms = (value: string): string[] =>
  value
    .split(/[,，\n]/)
    .map((term) => term.trim().toLocaleLowerCase('zh-CN'))
    .filter(Boolean)

export const filterCommunities = (
  communities: Community[],
  filter: CommunityFilter,
  observations: Observation[],
  now = Date.now()
): Community[] => {
  const searchTerms = terms(filter.search)
  const excludedTerms = terms(filter.exclude)
  const observationMap = new Map(observations.map((item) => [item.chatId, item.dueAt]))
  const inactiveBefore = filter.inactiveDays
    ? Math.floor(now / 1_000) - filter.inactiveDays * 24 * 60 * 60
    : null

  return communities.filter((community) => {
    if (filter.kind !== 'all' && community.kind !== filter.kind) return false
    if (filter.location === 'main' && community.archived) return false
    if (filter.location === 'archive' && !community.archived) return false
    if (filter.role !== 'all' && community.role !== filter.role) return false
    if (filter.minMembers !== null && (community.memberCount ?? -1) < filter.minMembers)
      return false
    if (filter.maxMembers !== null && (community.memberCount ?? Infinity) > filter.maxMembers) {
      return false
    }
    if (
      inactiveBefore !== null &&
      community.lastActivity !== null &&
      community.lastActivity > inactiveBefore
    ) {
      return false
    }
    const dueAt = observationMap.get(community.id)
    if (filter.observation === 'watching' && dueAt === undefined) return false
    if (filter.observation === 'due' && (dueAt === undefined || dueAt > now)) return false
    const title = community.title.toLocaleLowerCase('zh-CN')
    if (searchTerms.length > 0 && !searchTerms.every((term) => title.includes(term))) return false
    if (excludedTerms.some((term) => title.includes(term))) return false
    return true
  })
}

export const describeFilter = (filter: CommunityFilter, locale: Locale = 'zh-CN'): string[] => {
  const rules: string[] = []
  if (filter.search.trim()) {
    rules.push(tx(locale, `包含“${filter.search.trim()}”`, `Includes “${filter.search.trim()}”`))
  }
  if (filter.exclude.trim()) {
    rules.push(tx(locale, `排除“${filter.exclude.trim()}”`, `Excludes “${filter.exclude.trim()}”`))
  }
  if (filter.kind !== 'all') {
    rules.push(
      filter.kind === 'group'
        ? tx(locale, '仅群组', 'Groups only')
        : tx(locale, '仅频道', 'Channels only')
    )
  }
  if (filter.location !== 'all') {
    rules.push(
      filter.location === 'main'
        ? tx(locale, '主列表', 'Main list')
        : tx(locale, '已归档', 'Archived')
    )
  }
  if (filter.role !== 'all') {
    const role = {
      member: tx(locale, '成员', 'Member'),
      admin: tx(locale, '管理员', 'Admin'),
      owner: tx(locale, '群主', 'Owner')
    }[filter.role]
    rules.push(tx(locale, `身份：${role}`, `Role: ${role}`))
  }
  if (filter.inactiveDays) {
    rules.push(
      tx(locale, `${filter.inactiveDays} 天未活跃`, `Inactive for ${filter.inactiveDays} days`)
    )
  }
  if (filter.minMembers !== null) {
    rules.push(
      tx(locale, `成员不少于 ${filter.minMembers}`, `At least ${filter.minMembers} members`)
    )
  }
  if (filter.maxMembers !== null) {
    rules.push(
      tx(locale, `成员不多于 ${filter.maxMembers}`, `At most ${filter.maxMembers} members`)
    )
  }
  if (filter.observation !== 'all') {
    rules.push(
      filter.observation === 'watching'
        ? tx(locale, '观察中', 'On watchlist')
        : tx(locale, '观察已到期', 'Watch period due')
    )
  }
  return rules
}
