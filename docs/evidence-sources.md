# HugeBrain 示例文献与证据边界

本种子库收录 9 篇真实文献，用于演示文献—实验—发现—脑区—认知功能之间的关系。书目信息及下列概括于 2026-10-16 对照原始论文、出版商页面或作者原文核验。这不是系统综述，也不代表当前领域的完整证据。

## 解释界面前先明确三件事

- **皮层分区与功能区不同。** a2009s / Destrieux 是脑沟、脑回的解剖图谱。V1、FFA、DLPFC、IPS 的功能定义不会与一个解剖分区严格重合。这里所有文献映射均为 `provisional`（待核验的解剖近似），没有伪称原研究使用 a2009s。尤其不能将整个距状沟直接命名为 V1。
- **热图表示当前库中去重后的文献篇数。** 同一论文在同一脑区下出现多个实验或发现，只计一篇。篇数不是效应量、显著性、研究质量或该功能的重要程度。没有条目表示尚未收录，不能推断没有作用。情景记忆当前没有种子条目。
- **动画是教学示意。** 范式用简化的形状和步骤重述；播放时间压缩，曲线和矩阵不取自原始数据。`synthetic: true` 与 `data_status: illustrative` 必须保留。种子库不填入未经提取的样本量、统计量、效应值或测量时序。

`mapping_confidence` 为录入者用于排队复核的粗略标记，不是统计置信度。不得用于证据加权或推断真实性。研究均以 fMRI 相关性结果为主，动画中的指标变化不建立因果机制。

## 已核验来源

| 记录 | 原始文献 / 核验来源 | 收录内容与限制 |
| --- | --- | --- |
| `harrison-tong-2009` | Harrison, S. A., & Tong, F. (2009). *Decoding reveals the contents of visual working memory in early visual areas*. Nature, 458, 632–635. [出版商原文](https://www.nature.com/articles/nature07832) · [作者稿全文](https://pmc.ncbi.nlm.nih.gov/articles/PMC2709809/) · DOI: 10.1038/nature07832 | 延迟期多体素模式携带被记忆的朝向信息，即使平均反应较低。功能视网膜定位的 V1–V4 不能整体等同于距状沟，种子仅给出早期视觉皮层的粗略入口。 |
| `serences-2009` | Serences, J. T., Ester, E. F., Vogel, E. K., & Awh, E. (2009). *Stimulus-specific delay activity in human primary visual cortex*. Psychological Science, 20(2), 207–214. [书目与原始摘要](https://pubmed.ncbi.nlm.nih.gov/19170936/) · [作者提供的论文](https://awhvogellab.com/files/pdfs/serences_2009_stimulus-specific-delay.pdf) · DOI: 10.1111/j.1467-9280.2009.02276.x | 按任务要求保持颜色或朝向；V1 模式反映有意保持的特征。不要把“有信息”写成“平均 BOLD 必然持续升高”。 |
| `todd-marois-2004` | Todd, J. J., & Marois, R. (2004). *Capacity limit of visual short-term memory in human posterior parietal cortex*. Nature, 428, 751–754. [出版商原文](https://www.nature.com/articles/nature02466) · DOI: 10.1038/nature02466 | 视觉短时记忆负荷与后顶叶活动和行为容量的关系。以顶内沟作探索入口，不将整个分区视作专属储存模块；曲线仅表达“随负荷增加并趋于饱和”的概念。 |
| `desposito-1995` | D'Esposito, M., Detre, J. A., Alsop, D. C., Shin, R. K., Atlas, S., & Grossman, M. (1995). *The neural basis of the central executive system of working memory*. Nature, 378, 279–281. [出版商原文](https://www.nature.com/articles/378279a0) · [原始摘要](https://pubmed.ncbi.nlm.nih.gov/7477346/) · DOI: 10.1038/378279a0 | 同时执行两项任务与分别执行时的前额叶反应差异。摘要足以支持双任务和前额叶概括，但不足以做精细分区或侧化结论；额中回映射特意使用较低复核置信标记。 |
| `haxby-2001` | Haxby, J. V., Gobbini, M. I., Furey, M. L., Ishai, A., Schouten, J. L., & Pietrini, P. (2001). *Distributed and overlapping representations of faces and objects in ventral temporal cortex*. Science, 293(5539), 2425–2430. [论文 DOI](https://doi.org/10.1126/science.1063736) · [作者实验室书目](https://sites.dartmouth.edu/haxbylab/publication/) · [论文全文](https://pages.saclay.inria.fr/demian.wassermann/pdfs/HaxbyScience2001.pdf) | 类别信息分布于腹侧颞叶活动模式，排除某类别最大响应区后仍有可区分信息。仅借梭状回进入更广的腹侧颞叶文献，不能将整篇结论局限于该分区。 |
| `corbetta-2000` | Corbetta, M., Kincade, J. M., Ollinger, J. M., McAvoy, M. P., & Shulman, G. L. (2000). *Voluntary orienting is dissociated from target detection in human posterior parietal cortex*. Nature Neuroscience, 3(3), 292–297. [出版商原文](https://doi.org/10.1038/73009) · [原始摘要](https://pubmed.ncbi.nlm.nih.gov/10700263/) · DOI: 10.1038/73009 | 将目标出现前的定向注意与目标检测分离：前者涉及顶内沟，后者涉及右颞顶交界。右缘上回只是颞顶交界的近似入口。PubMed 记录另列有 2000 年勘误，正式系统综述时须一并复核。 |
| `macdonald-2000` | MacDonald, A. W., III, Cohen, J. D., Stenger, V. A., & Carter, C. S. (2000). *Dissociating the role of the dorsolateral prefrontal and anterior cingulate cortex in cognitive control*. Science, 288(5472), 1835–1838. [论文 DOI](https://doi.org/10.1126/science.288.5472.1835) · [原始摘要](https://pubmed.ncbi.nlm.nih.gov/10846167/) | Stroop 任务切换中区分准备阶段与冲突反应阶段。左 DLPFC 和 ACC 的功能分离属于该任务条件下的解释，不能据此给整个脑区分配单一功能。 |
| `fedorenko-2011` | Fedorenko, E., Behr, M. K., & Kanwisher, N. (2011). *Functional specificity for high-level linguistic processing in the human brain*. PNAS, 108(39), 16428–16433. [作者稿全文](https://pmc.ncbi.nlm.nih.gov/articles/PMC3182706/) · [作者提供的论文](https://web.mit.edu/evlab/assets/papers/Fedorenko_et_al_2011_PNAS.pdf) · DOI: 10.1073/pnas.1112937108 | 个体内功能定位后比较句子理解与若干非语言任务。种子以额下回作语言网络入口，不宣称整个额下回都语言专属；未把非语言对照条件作为该区支持工作记忆的正证据。 |
| `kriegeskorte-2008` | Kriegeskorte, N., Mur, M., & Bandettini, P. (2008). *Representational similarity analysis—connecting the branches of systems neuroscience*. Frontiers in Systems Neuroscience, 2, 4. [出版商原文](https://www.frontiersin.org/journals/systems-neuroscience/articles/10.3389/neuro.06.004.2008/full) · DOI: 10.3389/neuro.06.004.2008 | 方法论文及经验示例；EVC 与右 FFA 的 RDM 呈现不同结构。RSA 比较的是表征结构；相似性“变高”并不普遍等于更好的功能。本文的合成矩阵示范类别内／类别间关系，不假称学习导致实测增益。 |

## 映射与标签的录入原则

当前映射：`lh_45` / `rh_45` 为 S_calcarine；`lh_15` / `rh_15` 为 G_front_middle；`lh_57` / `rh_57` 为 S_intrapariet_and_P_trans；`lh_21` / `rh_21` 为 G_oc-temp_lat-fusifor；`rh_26` 为 G_pariet_inf-Supramar；`lh_6` / `rh_6` 为 G_and_S_cingul-Ant；`lh_12` / `lh_14` 为 G_front_inf-Opercular / G_front_inf-Triangul。编号由实际 a2009s 表核验，不能套用另一个 0 起始编号表。42 是 Medial_wall，不是距状沟。

每篇文献都有领域、认知过程、范式、采集模态、人群、设计、信号、分析方法、刺激、证据性质、来源核验状态等标签。每个发现单独绑定实验、脑区和认知功能，可区分同一论文的多个结果。文献标签中的“工作记忆对照”不自动生成“工作记忆正向发现”。

进一步正式入库，应分别记录实验级样本、排除规则、对照、结果方向、效应量与区间、统计阈值、多重比较方法、原始坐标及空间、原始功能 ROI 或统计图、a2009s 变换过程、映射重叠率、审阅者和审阅日期。没有原文支持的字段保持空值；不以动画参数代替研究结果。
