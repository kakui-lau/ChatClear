import type { Community } from '../../shared/contracts'

interface CommunityTableProps {
  communities: Community[]
  selectedIds: Set<number>
  protectedIds: Set<number>
  onToggleSelected(id: number): void
  onToggleProtected(id: number): void
}

const memberFormatter = new Intl.NumberFormat('zh-CN', { notation: 'compact' })
const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'short',
  day: 'numeric'
})

const formatLastActivity = (timestamp: number | null) => {
  if (!timestamp) return '暂无记录'
  return dateFormatter.format(new Date(timestamp * 1000))
}

const roleLabel: Record<Community['role'], string> = {
  owner: '群主',
  admin: '管理员',
  member: '成员'
}

export function CommunityTable({
  communities,
  selectedIds,
  protectedIds,
  onToggleSelected,
  onToggleProtected
}: CommunityTableProps) {
  if (communities.length === 0) {
    return (
      <div className="empty-state">
        <span aria-hidden="true">⌁</span>
        <h2>没有匹配的群组</h2>
        <p>调整搜索或筛选条件后再试。</p>
      </div>
    )
  }

  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">Telegram 群组与频道列表</caption>
        <thead>
          <tr>
            <th className="check-column">
              <span className="sr-only">选择</span>
            </th>
            <th>名称</th>
            <th>类型</th>
            <th>身份</th>
            <th>成员</th>
            <th>最近活动</th>
            <th className="protect-column">保护</th>
          </tr>
        </thead>
        <tbody>
          {communities.map((community) => {
            const isProtected = protectedIds.has(community.id)
            const isOwner = community.role === 'owner'
            const disabled = isProtected || isOwner

            return (
              <tr
                key={community.id}
                className={selectedIds.has(community.id) ? 'selected-row' : ''}
              >
                <td className="check-column">
                  <input
                    aria-label={`选择 ${community.title}`}
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
                      <small>{community.archived ? '已归档' : '主列表'}</small>
                    </span>
                  </div>
                </td>
                <td>
                  <span className={`kind-badge kind-${community.kind}`}>
                    {community.kind === 'group' ? '群组' : '频道'}
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
                <td>{formatLastActivity(community.lastActivity)}</td>
                <td className="protect-column">
                  {isOwner ? (
                    <span className="owner-lock" title="群主创建的群默认禁止批量退出">
                      锁定
                    </span>
                  ) : (
                    <button
                      aria-label={`${isProtected ? '取消保护' : '保护'} ${community.title}`}
                      className={`protect-button ${isProtected ? 'is-protected' : ''}`}
                      title={isProtected ? '取消保护' : '加入白名单'}
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
