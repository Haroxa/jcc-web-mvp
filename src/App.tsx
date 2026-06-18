import {
  BadgeCent,
  Camera,
  ClipboardList,
  Database,
  LayoutDashboard,
  LockKeyhole,
  Settings,
  Users
} from "lucide-react";

const navItems = [
  { label: "工作台", icon: LayoutDashboard },
  { label: "定榜", icon: ClipboardList },
  { label: "锁牌", icon: LockKeyhole },
  { label: "存票", icon: BadgeCent },
  { label: "粉丝", icon: Users },
  { label: "截图", icon: Camera },
  { label: "资料", icon: Database },
  { label: "设置", icon: Settings }
];

const cards = [
  { title: "当前场次", value: "未开始", note: "创建下午场或晚上场后进入直播流程" },
  { title: "待结算", value: "0", note: "直播结束后确认存票入账和回退" },
  { title: "公开存票榜", value: "关闭", note: "游客只看到公开模块和公开字段" },
  { title: "截图限制", value: "5MB", note: "超过限制提示压缩或重新上传" }
];

export function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">J</span>
          <div>
            <strong>JCC 直播助手</strong>
            <span>新项目骨架</span>
          </div>
        </div>
        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button className="nav-item" key={item.label} type="button">
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="main">
        <header className="page-header">
          <div>
            <p className="eyebrow">TypeScript + React + Drizzle</p>
            <h1>直播管理工作台</h1>
            <p className="header-copy">
              先搭建朴素后台骨架，后续逐步接入场次、定榜、锁牌、存票、截图和公开榜。
            </p>
          </div>
          <button className="primary-button" type="button">
            创建直播场次
          </button>
        </header>

        <section className="metric-grid">
          {cards.map((card) => (
            <article className="metric-card" key={card.title}>
              <span>{card.title}</span>
              <strong>{card.value}</strong>
              <p>{card.note}</p>
            </article>
          ))}
        </section>

        <section className="work-area">
          <div className="panel">
            <div className="panel-header">
              <h2>MVP 主流程</h2>
              <span>待实现</span>
            </div>
            <ol className="flow-list">
              <li>创建直播场次</li>
              <li>录入定榜并生成推荐名单</li>
              <li>确认对局席位并记录锁牌</li>
              <li>记录存票、取票、现刷和修正</li>
              <li>结算确认并更新长期余额</li>
              <li>开放游客公开存票榜</li>
            </ol>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>工程状态</h2>
              <span>已创建</span>
            </div>
            <ul className="status-list">
              <li>React 前端骨架</li>
              <li>Drizzle SQLite schema</li>
              <li>Cloudflare Worker API 入口</li>
              <li>D1 / R2 配置占位</li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}

