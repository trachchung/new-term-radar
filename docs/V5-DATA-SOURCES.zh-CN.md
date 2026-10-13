# V5 — 多来源需求发现 + 真实关键词候选

## 两类信号分别保存

A. 真实用户问题线索（免费，定时）

- Hacker News：保留带具体动作与痛点的公众评论。
- Stack Exchange：调用官方 /2.3/search/advanced，发现公开问答中的具体操作困难；只保留标题摘要、原始链接、日期和来源标记，并在网页中注明来自 Stack Exchange 的 CC BY-SA 许可归属。保留 API backoff 限流，最多七个查询主题。
- HN 与 Stack Exchange 都不能证明某个候选词有 Google 搜索量，也不是“容易排名”的证据；来自技术论坛的人群有样本偏差。
- Reddit 商业自动采集默认不启用。2026 年官方条款要求商业用途在获得 Reddit 许可后开展。不要通过未授权代理规避规则。

B. 真实 Google 搜索表达（可选、按调用收费）

DataForSEO Labs Google Keyword Suggestions 官方接口。默认 US 2840 / English，输入种子词并得到最多 30 条真实数据库建议。保留种子词、来源、搜索量、CPC、第三方 KD（如果存在）和数据查询日。
Google Ads 竞争指数不等于自然排名 KD，DataForSEO 的 KD 也不是能进前三名的保证。

在仓库根目录运行：

    python -m radar opportunities --input opportunities.example.json --out opportunities.md
    python -m radar ideas --input opportunities.json --limit-seeds 2 --results-per-seed 20 --paid --out research.ideas.json
    python -m radar opportunities --input opportunities.example.json --research-json research.ideas.json --out opportunities.md

命令只有明确加 --paid 且设置 DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD 时才调用收费接口。最大一批 3 个种子，每词最多 30 条；关闭附加点击流数据以避免额外费用，报表展示供应商返回的实际成本（若接口提供）。

离线演示：
    echo '{"keywords":["avatar image format converter"]}' > /tmp/ideas-input.json
    python -m radar ideas --input /tmp/ideas-input.json --fixture tests/fixtures/dataforseo_keyword_ideas.json --out research.ideas.json

## Cloudflare 线上采集

- 独立的 seo-demand-collector Worker 每日 UTC 02:20 运行，按照 12 个 HN 任务与 7 个 Stack Exchange 任务研究公开用户问题。
- 两类记录都进入原 D1 opportunities 表，保留原有的人工处理状态、搜索量、SERP 快照和用户备注。
- 新迁移 collector/migrations/0002_source_counts.sql 增加 source_counts_json 统计源数；必须在正式代码部署前应用。
- 登录后在工作台点击“立即采集”，后台通过私有 Service Binding 触发；匿名无法请求采集器。
- 工作台显示分别来自 HN 和 Stack Exchange 的新增证据数量。
- 无搜索量的候选只进入“待补证据”，不自动新建站点或 SEO 页面。

## 测试及局限

pytest + Node tests 覆盖 API 输入、时间限制、分页上限、来源链接验证、backoff、无搜索量、数据合并。
真实 SEO 机会仍需核验美国 Google SERP 前十、建站成本、商业模式；社区帖子不是销售订单。


## 2026-10-13 线上验证记录与当前限制

- D1 source_counts_json 和 collector_provider_state 已完成迁移。
- Cloudflare collector V5 模块上传成功；Dashboard 新版已上传，ADMIN_TOKEN 使用 Cloudflare API 的 inherit 绑定保留（未暴露或更换现有密钥）。
- Hacker News 真实在线采集仍正常。
- Stack Exchange 在此 Cloudflare 出口调用官方 API 曾返回 HTTP 400 / 429。故此**不能声称 Stack Exchange 已经成功采集用户问题**。已将它的查询改为更简洁的官方参数，并在任何 HTTP 错误时停止整批后续调用。
- 已为 Stack Exchange 设置独立的 provider_state 记录和跨 Cron 生效的 22-24 小时冷却。遇限流时不继续重试其他主题；当前已手动按上一次 429 错误设置至少一天冷却，避免多次触发。HN 每日采集不受影响。
- 如果冷却后仍连续发生 400 / 429，应核查 API 返回的具体错误文本、部署出口的访问限制和 API 账号配额。不可将这些失败记为已得到真实需求。
- DataForSEO Labs 模块只通过 --paid 显式调用；此轮没有使用付费凭据、没有产生付费查询，也没有声称发现已验证的关键词量。
- CI 针对最新提交通过；测试属于模块/逻辑/模拟数据验收，不等于 Stack Exchange 线上数据 API 验收。

- 注意：Cloudflare 定时配置虽然已设为每天一次，但曾观察到旧触发频率仍持续。因此 V5 另加入采集器内部 20 小时幂等保护：在上一轮成功或部分成功后 20 小时内，scheduled() 直接跳过，不再请求外部 API。手动管理员采集仍保留独立的 10 分钟频率限制。
- Stack Exchange 额外采用 provider_state 表跨 Cron 保存 22 至 24 小时冷却；实际出现 429 后已按 24 小时冷却，不进行绕过或强行重试。
