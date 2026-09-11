import { describe, expect, it } from 'vitest'
import type { Community } from '../shared/contracts'
import { defaultCommunityFilter, filterCommunities } from '../src/community-filters'

const now = Date.UTC(2026, 8, 11)
const communities: Community[] = [
  {
    id: 1,
    title: 'Active Product Group',
    kind: 'group',
    role: 'member',
    archived: false,
    muted: false,
    memberCount: 120,
    lastActivity: now / 1_000
  },
  {
    id: 2,
    title: 'Old Announcement',
    kind: 'channel',
    role: 'admin',
    archived: true,
    muted: true,
    memberCount: 5_000,
    lastActivity: now / 1_000 - 400 * 86_400
  }
]

describe('community filters', () => {
  it('combines inactivity, kind, role and member range rules', () => {
    expect(
      filterCommunities(
        communities,
        {
          ...defaultCommunityFilter,
          kind: 'channel',
          role: 'admin',
          inactiveDays: 365,
          minMembers: 1_000,
          maxMembers: 10_000
        },
        [],
        now
      ).map((item) => item.id)
    ).toEqual([2])
  })

  it('supports include and exclusion terms', () => {
    expect(
      filterCommunities(
        communities,
        { ...defaultCommunityFilter, search: 'old', exclude: 'product' },
        [],
        now
      ).map((item) => item.id)
    ).toEqual([2])
  })

  it('finds observations that are due', () => {
    expect(
      filterCommunities(
        communities,
        { ...defaultCommunityFilter, observation: 'due' },
        [
          { chatId: 1, dueAt: now + 1_000 },
          { chatId: 2, dueAt: now - 1_000 }
        ],
        now
      ).map((item) => item.id)
    ).toEqual([2])
  })
})
