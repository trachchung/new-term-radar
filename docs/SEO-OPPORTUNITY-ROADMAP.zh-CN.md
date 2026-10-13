# SEO Opportunity Radar V1 — 我们自己的需求雷达

原仓库的 X、GitHub、HF、Sitemap、GSC 信号是趋势线（Trend Lane）；本版本新增人群任务线（Persona / Task Lane）：人群 → 场景 → 动作 → 痛点和限制 → 候选搜索词 → 人工验证。两线并行，不破坏原定时采集。

## 使用

1. 不需要 API key 就可以跑本地机会队列：python -m radar opportunities --input opportunities.example.json --out opportunities.md
2. 可合并原雷达每天的 JSON：python -m radar opportunities --input opportunities.example.json --radar-json report.json --out opportunities.md
3. 输出同名 JSON，包含完整人群、动作、证据、SERP 记录和下一步建议。实例中关键词全部是演示假设，不是推荐词。

## 输入

- personas 下按 scenes / actions / keywords 描述目标人群、用户旅程、痛点、条件和候选搜索表达。
- reviews 单独记录：keyword, evidence（每条 type/url/note）, monthly_searches, monthly_searches_source, serp（reviewed_at、exact_tool_results、major_site_results）, estimated_build_days, monetization, existing_site。
- Trend Lane 从 report.json 的 leads 和 keywords.rows 导入；仅是发现信号，不能算搜索量或真实需求证据。
- 重复词按大小写和空白合并。泛需求关键词优先于原雷达误判的品牌类型。

## 阶段与评分

假设 hypothesis → 待补证据 needs-evidence → 待人工决策 manual-review。只有两个不同域名的证据 URL、带来源的搜索量、完整 SERP 检查、开发估时及变现模式都存在，才能进入待人工决策。

证据最多 30 分；带来源的搜索量最多 20；SERP 竞争最多 20；开发估时 10；变现模式 10；复用已有网站 10。分数只用于排序人工调研，绝非可排名概率；输入的证据链接和搜索指标只做格式检查，尚未独立核实。

## 后续的优先开发顺序

- P0：真实用户评论 / Reddit / HN / 产品评论数据源（许可范围内），储存原始 URL、发帖日期、文本、抓取时间。
- P0：AI 依据有出处的痛点拆解人群与动作；关键词必须保留源证据，不能凭模型猜测量化需求。
- P0：接 Google Suggest / GSC / DataForSEO / SERP；按 US 地区和时间记录快照，分析前十对搜索意图的匹配程度、工具站竞争度。
- P1：现有站点匹配（imagekb.net、soocly.com 等）和工具 MVP 技术难度、API 成本、付费意愿评估。
- P1：七天 / 十四天 / 三十天后复盘排名、曝光、付费结果，记录失败案例并优化阈值。
- P2：Cloudflare D1 + Worker 的管理看板，关键词去重聚类、筛选、项目决策记录。

**不做**：自动堆砌「动作×限制」生成虚假词量；将 0 搜索量等同于蓝海；未经 SERP 和需求验证就批量生成重复页面；自动部署产品；提交 API 或 Search Console 密钥。

## 验收

原来的 daily / sources 命令继续可用；新命令支持原数据并能生成 Markdown 与 JSON；无密钥可跑；测试覆盖去重、无搜索量、证据域名、CLI 和无效输入。


## 第二阶段已实现：真实讨论 → 场景动作 → 搜索结果快照

本阶段新增 research、journeys、verify 三个命令；付费 API 和外部网络都需要显式 opt-in。

### A. HN 公开讨论采集（免费）

修改 research.example.json 的 queries 数组，按 keyword / query / pain_terms 指定需要研究的任务，而不是伪造 Google 搜索量。

离线测试：
    python -m radar research --input research.example.json --fixture tests/fixtures/hn_research.json --out research.hn.json

联网采集：
    python -m radar research --input research.example.json --out research.hn.json --days 30 --live

输出评论链接、简短原文、发布时间、采集时间。每个词最多 8 条，至多查询 20 个；HN 用户具有技术圈样本偏差，评论证据不能代替 Google 搜索量。

### B. AI 有出处的需求旅程（可选付费）

离线测试：
    python -m radar journeys --input research.hn.json --fixture tests/fixtures/hn_model_replies.json --out journeys.json

真实模型（需要环境变量 AISA_API_KEY）：
    python -m radar journeys --input research.hn.json --out journeys.json --ai --limit 5

必须使用输入中的 evidence ID，若不存在的来源 ID、无实际动作、无关键词则直接丢弃，不把模型假设冒充真实搜索数据。

### C. 合并机会队列

    python -m radar opportunities --input journeys.json --research-json research.hn.json --out opportunities.md

生成 opportunities.md 和 opportunities.json。AI 生成的场景关键词保留原讨论链接（支持任务存在，不代表用户实际搜索该关键词）；原始监控词也可以作为单独候选。

### D. DataForSEO 实时搜索量 / SERP（付费、默认关闭）

DataForSEO 正式 API：Google Ads Search Volume、Google Organic Live Advanced。
默认 US(2840)、英语、桌面、前十自然结果；每批默认最多五个、硬限制 20 个。

离线测试：
    python -m radar opportunities --input opportunities.example.json --out opportunities.md
    python -m radar verify --input opportunities.json --fixture tests/fixtures/dataforseo_research.json --out research.seo.json

真实验证：预先在环境变量配置 DATAFORSEO_LOGIN 和 DATAFORSEO_PASSWORD，显式加 --paid：
    python -m radar verify --input opportunities.json --limit 5 --paid --out research.seo.json

API 根据实际使用扣费（批量搜索量一次 + 每词 SERP 一次）；命令不会自动判定 SEO KD。只保留 API 中有值的搜索量、CPC、广告竞争指数、原始 SERP 位置、title、URL 和功能区。
注意 Google Ads 竞争指数不是自然搜索 KD，0 搜索量和 API 无数据不一样。

再合并：
    python -m radar opportunities --input journeys.json --research-json research.hn.json --research-json research.seo.json --out opportunities.md

### E. GitHub Actions（初始关闭）

新增 .github/workflows/research.yml；需要在仓库 Actions Variables 将 RESEARCH_ENABLED=true 才会执行（每天一次，也可手动触发）。
未配置 AISA_API_KEY 时只采集 HN；配置后会调用最多五个 AI 任务并产生费用。绝不会由工作流自动调用 DataForSEO 付费 SERP。
应该优先将 research.example.json 演示查询换成实际监控词，并保证密钥从 Secrets 注入。

### 后续未完成

- Reddit 官方 API / HN 之外的用户评论源、Search Suggest 真实搜索表达、同义意图聚类；
- SERP 前十人工分类与多日期跟踪、已有站点归属与工具制作建议；
- Cloudflare D1 存储与操作看板；
- GitHub Actions 实际测试尚待仓库功能可用后验收；PR 提交不是测试或线上 API 运行成功的证明。
