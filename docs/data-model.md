# HugeBrain 数据模型与本地 API

应用使用 Python 标准库 HTTP 服务与 SQLite。数据库位于 `data/hugebrain.db`，不会提交到 Git；重启后保留用户数据。建表文件是 `database/schema.sql`。所有查询使用参数绑定，写入以整篇文献为单位执行事务。生产部署前需要另行增加身份认证、权限和 HTTPS；当前服务默认仅监听 `127.0.0.1`。

## 实体与粒度

| 表 | 含义 |
| --- | --- |
| `brain_regions` | 每个半球的 a2009s 解剖标签，共 148 个皮层分区；排除 Unknown 与 Medial_wall |
| `cognitive_functions` | 认知功能词表；功能通过具体研究发现关联到脑区 |
| `papers` / `paper_authors` | 文章与有序作者列表；DOI 忽略大小写唯一，防止重复计数 |
| `experiments` / `experiment_conditions` | 文章中的不同实验、范式、模态、样本与有序实验条件 |
| `findings` | 一个实验在一个解剖分区上的发现；保存指标、方向、机制解释、证据类型与映射依据 |
| `finding_functions` | 发现与认知功能之间的多对多关系 |
| `taxonomies` / `tags` / `paper_tags` | 标签分类、受控词条与文章之间的多对多关系 |
| `animations` | 实验与指标动画的 JSON 参数，独立保存是否为说明性动画 |
| `app_metadata` | 模型版本与一次性初始化状态 |

标签机制可覆盖认知领域、认知功能、实验范式、研究方法、测量模态、人群、刺激、指标、分析方法、证据类型、实验设计、物种、脑网络、样本、局限性、重复验证与数据开放性。也允许增加自定义分类。缺失样本量用 NULL 表示，不能填 0 冒充已知值。每项发现可记录 `source_locator`（正文段落、图表或补充材料位置）与 `limitations`。未查明的信息应留空。

`brain_regions.id` 使用 `lh_45` / `rh_45` 形式。其中数字是原始 a2009s 标签索引，不能用显示顺序替代。皮层分区不是功能定位的同义词：例如 `S_calcarine` 不等于经过个体视网膜拓扑实验确认的 V1；Destrieux 皮层分区也不包含海马等皮层下结构。

## 映射审核与热图

每项发现明确记录：

- `mapping_status`：`provisional`（待复核的近似对应）或 `accepted`（已经人工审核的对应）。
- `mapping_source`：必须填写映射依据，例如原论文 ROI、原文定位、可重现的坐标转分区流程及其版本。
- `mapping_confidence`：0–1 的映射信心水平。它描述解剖对应的标注信心，不是统计显著性，也不是研究结论为真的概率。
- `evidence_type`：默认 association；观察性关联不能直接写成因果证据。

所有随附文献为示例数据 `source_kind=demo`。示例中的解剖对应保持 provisional。示例动画用于解释范式和指标，不能作为原文时序或实际测量值的替代。

热图在选定认知功能与映射范围后，对每个脑区计算 `COUNT(DISTINCT paper_id)`。同篇文章的多个实验、多个发现、多个功能链接都不会重复增加该脑区的文章数。颜色代表数据库中的文献覆盖度，不代表效应量、功能特异性、显著性或证据质量。默认 `mapping=all` 包含近似对应以演示功能；严格范围 `mapping=accepted` 仅包含已审核对应。示例库在严格范围内可能全为零，这是预期行为。一个文章可能同时拥有两种映射状态，`accepted_count` 与 `provisional_count` 因而不能直接相加得到 `count`。

## API

| 请求 | 响应 |
| --- | --- |
| `GET /api/health` | 服务与数据库模型版本 |
| `GET /api/bootstrap` | `{regions, functions, papers, tags, stats}`；文章为完整对象 |
| `GET /api/papers` | `{papers, total}` |
| `GET /api/papers/:id` | 完整文章对象，未知 ID 为 404 |
| `GET /api/regions/:id` | `{region, papers, findings}` |
| `GET /api/heatmap?function=working-memory&mapping=all` | `{counts, max_count, total_papers, accepted_papers, provisional_papers, mapping_scope, counting_unit}` |
| `POST /api/papers` | JSON 文章入库；成功返回 201 与完整记录 |
| `GET /api/export` | 包含全部文章、脑区、功能、标签与分类的 JSON 文件 |

文章检索支持 `region`、`function`、`q`、`year_from`、`year_to`、`method`、`mapping`。多个过滤器同时生效；脑区和功能须出现在同一发现上，不能由同一篇文章的两个无关发现拼接。`q` 查询标题、摘要、总结、作者、DOI 和标签；`method` 精确匹配模态或 method/modality/analysis 标签，忽略大小写。

新增文章最少需要 `title` 与整数 `year`；可以先存元数据，随后通过数据库补充实验与发现。当前 HTTP API 提供新增与读取，尚未提供编辑/删除端点。`authors` 是字符串数组，`tags` 是 `{category,label}` 数组。所有提供的 paper/experiment/finding ID 必须全库唯一；未提供时自动生成。`doi` 可传裸 DOI 或 DOI URL，服务器会规范化。重复 DOI 或 ID 返回 409，且整篇文章与新标签、动画一起回滚。未知脑区或功能、错误的跨文章实验引用、非法信心水平返回 400。

```json
{
  "title": "Your verified article title",
  "authors": ["Author Name"],
  "year": 2024,
  "doi": "10.1000/example",
  "journal": "Journal",
  "url": "https://doi.org/10.1000/example",
  "summary": "基于原文的总结",
  "tags": [{"category": "method", "label": "fMRI"}],
  "experiments": [{
    "id": "unique-experiment-id",
    "name": "Experiment 1",
    "paradigm": "delayed match-to-sample",
    "modality": "fMRI",
    "conditions": ["low load", "high load"],
    "animation": {"type": "delayed-match", "illustrative": true}
  }],
  "findings": [{
    "experiment_id": "unique-experiment-id",
    "region_id": "lh_45",
    "function_ids": ["working-memory"],
    "metric": "decoding accuracy",
    "summary": "在此填写有原文支持的发现",
    "effect_direction": "increase",
    "mapping_status": "provisional",
    "mapping_source": "在此填写原文定位与映射依据",
    "mapping_confidence": 0.4,
    "source_locator": "Figure 2",
    "limitations": "此为结构示例，并非真实研究结论"
  }]
}
```

初始化只在数据库无文章且未加载示例时写入 `database/seed.json`。后续重启不会覆盖用户文章。导出的 `papers` 数组可以逐篇通过 POST 导入；重复记录会被拒绝，单篇导入失败不会污染现有数据。跨多篇的批量导入不是一个总事务。备份运行中的数据库应使用 SQLite backup API；直接复制时同时处理 WAL 文件，或先正常关闭服务。
