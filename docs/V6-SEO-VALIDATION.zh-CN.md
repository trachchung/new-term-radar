# V6 SEO SERP 人工竞争审核 + 站点落地

本阶段新增浏览器里的真实竞争检查：不是模型推测的 KD，也不自动认定谷歌前三或能够赚钱。

## 操作方式

打开私有 SEO Opportunity Radar，登录后选一个候选词。V6 允许粘贴真实 Google 搜索结果 URL（每行一条，最多十条），逐个标记同用途工具、大平台、文章、搜索意图不相关或未判断。记录实际用途匹配程度、用户需求证据质量、MVP 估计开发天数、广告/付费模式和目标站点。

如果没有 DataForSEO 数据，你可以在 Google 浏览器里手工检查，再把看到的 URL 粘贴进去。禁止凭想象填写排名。只有至少五条真实 URL 被人工分类，才显示初步完成审核；这仍不能保证排名。

人工评估保存在新的 D1 opportunity_assessments 表。自动采集/反复导入关键词不会清除这些决定或记录。

## 导入实际 SEO 数据

DataForSEO 用户可以手动运行：

    python -m radar verify --input opportunities.json --limit 5 --paid --out research.seo.json

关键词建议：

    python -m radar ideas --input opportunities.json --limit-seeds 2 --paid --out research.ideas.json

在工作台点击“导入 SEO 数据”，上传生成的研究文件。仅合并已有关键词的缺失搜索量、第三方指标和 SERP 快照；原有用户讨论、人工决定和竞争评估保留。文件内没有的搜索量保持未知而不是填零。没有入库的词先作为假设词导入机会库，再补真实 SEO 数据，防止自动灌入大量不相关关键词。

上述付费命令必须有 DataForSEO 凭据并显式加 --paid，网页后台只导入文件而不自动扣费。上传数据本身并未由工作台二次核实。

## 与现有网站匹配

dashboard/src/site-match.js 包含 imagekb.net、soocly.com、dreamstimedownloader.com、lewisstructuregenerator.org 的初步主题匹配。此匹配是人工决策辅助，不是 SEO/商业适配的自动结论。可填写其他网站。

## 安全与验收

- 新增 dashboard/migrations/0002_assessments.sql；生产部署前先建立对应数据表。
- 所有研究和审核接口继续使用既有 ADMIN_TOKEN Secret。重新部署时应继承 Secret，不要硬编码在源码或输出中。
- 备份导出中会同时包含机会数据与人工评估记录，避免只备份一半。
- Google SERP URL 来自用户上传或人工输入，不通过不明代理自动采集。
- CI 执行 Python 与 Node 单元测试。额外需核验线上 D1 持久化和未授权请求拦截。

下一阶段可以接 GSC 真实展示/点击/索引反馈和历史研发/营收结果，校准机会评分。
