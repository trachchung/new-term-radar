# V4：每日公开用户痛点采集

独立 Worker seo-demand-collector 每天 UTC 02:20 运行，使用 HN Algolia 公开评论，不依赖 GitHub Secrets，也不调用付费 AI 或 SEO 接口。

## 已实现

- 12 个在线工具的研究主题：图片压缩、PDF 压缩、简历转换、Shopify 商品图、字幕、CSV 去重、网页截图、批量改名、GSC 导出、图片隐私转换、alt text、录音转文字。
- 每主题每次最多 80 条近期评论，只收录近 180 天、同时含对象/操作和明确求助/痛点表述的评论，每次最多 6 条。
- 把 HN 评论的原始 URL、摘录、发表时间、采集时间及来源查询记录到已有 D1 数据库。
- 同一关键词数据会去重更新，并保留之前人工决定、备注、目标网站、搜索量、SERP 与其他网站的证据。
- 监控研究主题不是已确认的 Google 搜索词；仍需查 Google Suggest、月搜索量和 SERP。不会自动列为可开发，也不会自动上线相似内容。
- 新增 collector_runs 表记录每次运行时间、错误数量和匹配数量。

## 诊断与后续

D1 控制台运行 SQL，检查最近执行记录：

    SELECT started_at,ended_at,status,total_topics,total_matches,errors_json
    FROM collector_runs ORDER BY started_at DESC LIMIT 10;

查看真实候选：

    SELECT keyword,evidence_count,stage,imported_at
    FROM opportunities ORDER BY imported_at DESC LIMIT 20;

Cloudflare cron 的更新可能需要至多 15 分钟传播，新部署后不能立即把没有记录解释为故障。

代码位置：collector/src/worker.js、collector/src/topics.js、collector/wrangler.toml。
若要更换监控主题，修改 topics.js 后发布 Worker。默认 HN 社区有明显的技术用户样本偏差，不能推断所有美国普通消费者的需求。


## 线上运行记录（2026-10-13）

已在 Cloudflare 创建并部署独立的 seo-demand-collector Worker，连接专用 D1（与 V3 工作台共享），完成 collector_runs 建表。

- 初期每分钟短暂启动测试并完成真实 HN API 访问；最初规则误匹配求职资料等无关评论。
- 已经加入同一局部语境匹配（求助/抱怨 + 动作 + 操作对象）、求职资料排除，以及邮件/电话脱敏。
- 误报条目均是由自动采集器刚创建、尚无人工处理记录的数据；已从 D1 清理，未删除人工决策。
- 严格筛选后 12 个主题留下 1 条与头像图片格式转换相关的公开操作问题，关键词调整为 avatar image format converter。它仍属于 needs-evidence，不代表 Google 有这个搜索需求。
- Cron 已由每分钟测试调整为每天 UTC 02:20（中国时间 10:20）。Cloudflare 定时修改最多约 15 分钟生效，在传播期可能还有旧频率的运行。
- V3 工作台已接入私有 Cloudflare Service Binding：只有管理员通过工作台认证后，才能点击「立即采集」，直接启动一次免费 HN 采集。最近一次运行统计显示在工作台顶部。
- 上一版聊天出现过的管理密钥已轮换；使用新密钥登录。所有密钥仅存于 Worker Secret，不写进 GitHub。

安全：collector 本身 workers_dev=false，无公网匿名采集入口；Dashboard 的 /api/collect 需要管理员 Bearer Token，且触发采集前 10 分钟内已运行时会返回频率限制。正式运行不自动调用收费 API。

运维 SQL 可查看 collector_runs 和 opportunities 的最新内容。若前十结果没有人工分类或月搜索量缺失，必须在「补证据」队列中继续核实。

## 下一阶段待完善

可以拓展非技术用户密度更高的合法数据源，以及 GSC / Google SERP 的真实需求验证、目标人群画像与后续收益复盘。当前一条合格讨论不能保证一个有流量的 SEO 工具机会。
