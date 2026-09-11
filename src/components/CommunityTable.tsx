import type { Community, Locale, Observation } from '../../shared/contracts'
import { tx } from '../i18n'

interface CommunityTableProps {
  communities: Community[]
  selectedIds: Set<number>
  protectedIds: Set<number>
  systemProtectedIds: Set<number>
  observations: Observation[]
  locale: Locale
  onToggleSelected(id: number): void
  onToggleProtected(id: number): void
}

const formatLastActivity = (timestamp: number | null, locale: Locale) => {
  if (!timestamp) return tx(locale, '暂无记录', 'No activity')
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(timestamp * 1000))
}

export function CommunityTable({
  communities,
  selectedIds,
  protectedIds,
  systemProtectedIds,
  observations,
  locale,
  onToggleSelected,
  onToggleProtected
}: CommunityTableProps) {
  const memberFormatter = new Intl.NumberFormat(locale, { notation: 'compact' })
  const observationMap = new Map(observations.map((item) => [item.chatId, item.dueAt]))
  const roleLabel: Record<Community['role'], string> = {
    owner: tx(locale, '群主', 'Owner'),
    admin: tx(locale, '管理员', 'Admin'),
    member: tx(locale, '成员', 'Member')
  }
  if (communities.length === 0) {
    return (
      <div className="empty-state">
        <span aria-hidden="true">⌁</span>
        <h2>{tx(locale, '没有匹配的群组', 'No matching conversations')}</h2>
        <p>
          {tx(locale, '调整搜索或筛选条件后再试。', 'Adjust the search or filters and try again.')}
        </p>
      </div>
    )
  }

  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">
          {tx(locale, 'Telegram 群组与频道列表', 'Telegram groups and channels')}
        </caption>
        <thead>
          <tr>
            <th className="check-column">
              <span className="sr-only">{tx(locale, '选择', 'Select')}</span>
            </th>
            <th>{tx(locale, '名称', 'Name')}</th>
            <th>{tx(locale, '类型', 'Type')}</th>
            <th>{tx(locale, '身份', 'Role')}</th>
            <th>{tx(locale, '成员', 'Members')}</th>
            <th>{tx(locale, '最近活动', 'Last activity')}</th>
            <th className="protect-column">{tx(locale, '保护', 'Protect')}</th>
          </tr>
        </thead>
        <tbody>
          {communities.map((community) => {
            const isProtected = protectedIds.has(community.id)
            const isSystemProtected = systemProtectedIds.has(community.id)
            const isOwner = community.role === 'owner'
            const disabled = isProtected || isOwner

            return (
              <tr
                key={community.id}
                className={selectedIds.has(community.id) ? 'selected-row' : ''}
              >
                <td className="check-column">
                  <input
                    aria-label={`${tx(locale, '选择', 'Select')} ${community.title}`}
                    checked={selectedIds.has(community.id)}
                    disabled={disabled}
                    type="checkbox"
                    onChange={() => onToggleSelected(community.id)}
                  />
                </td>
                <td>
                  <div className="community-name">
                    <span className={`avatar avatar-${community.kind}`} aria-hidden="true">
                      {community.title.slice(0, 1).toUpperCase()}
                    </span>
                    <span>
                      <strong>{community.title}</strong>
                      <small>
                        {community.archived
                          ? tx(locale, '已归档', 'Archived')
                          : tx(locale, '主列表', 'Main')}
                        {community.muted ? ` · ${tx(locale, '已静音', 'Muted')}` : ''}
                        {observationMap.has(community.id)
                          ? ` · ${tx(locale, '观察至', 'Watch until')} ${new Date(observationMap.get(community.id)!).toLocaleDateString(locale)}`
                          : ''}
                      </small>
                    </span>
                  </div>
                </td>
                <td>
                  <span className={`kind-badge kind-${community.kind}`}>
                    {community.kind === 'group'
                      ? tx(locale, '群组', 'Group')
                      : tx(locale, '频道', 'Channel')}
                  </span>
                </td>
                <td>
                  <span className={`role-label role-${community.role}`}>
                    {roleLabel[community.role]}
                  </span>
                </td>
                <td>
                  {community.memberCount === null
                    ? '—'
                    : memberFormatter.format(community.memberCount)}
                </td>
                <td>{formatLastActivity(community.lastActivity, locale)}</td>
                <td className="protect-column">
                  {isOwner ? (
                    <span
                      className="owner-lock"
                      title={tx(
                        locale,
                        '群主创建的群默认禁止批量操作',
                        'Owner conversations are excluded from batch actions'
                      )}
                    >
                      {tx(locale, '锁定', 'Locked')}
                    </span>
                  ) : isSystemProtected ? (
                    <span
                      className="owner-lock"
                      title={tx(
                        locale,
                        '已在设置中启用管理员保护',
                        'Administrator protection is enabled in Settings'
                      )}
                    >
                      {tx(locale, '管理员保护', 'Protected')}
                    </span>
                  ) : (
                    <button
                      aria-label={`${isProtected ? tx(locale, '取消保护', 'Unprotect') : tx(locale, '保护', 'Protect')} ${community.title}`}
                      className={`protect-button ${isProtected ? 'is-protected' : ''}`}
                      title={
                        isProtected
                          ? tx(locale, '取消保护', 'Unprotect')
                          : tx(locale, '加入白名单', 'Add to allowlist')
                      }
                      type="button"
                      onClick={() => onToggleProtected(community.id)}
                    >
                      {isProtected ? '◆' : '◇'}
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
