import "./style.css";
import { icon } from "./icons.js";
import { BrainViewer } from "./brain.js";
import { ExperimentPlayer } from "./animations.js";
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const state = {
  data: null,
  region: null,
  fn: null,
  scope: "all",
  tab: "atlas",
  paper: null,
  heatmap: null,
  regionData: null,
  player: null,
};
let viewer,
  regionRequest = 0,
  heatRequest = 0,
  libraryRequest = 0;
async function api(path, options) {
  const r = await fetch(`/api${path}`, options);
  const data = await r.json();
  if (!r.ok)
    throw new Error(data.error || data.message || `请求失败 (${r.status})`);
  return data;
}
function toast(message) {
  const t = $("#toast");
  t.textContent = message;
  t.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("visible"), 4200);
}
const fnIcons = {
  "working-memory": "layers",
  "visual-perception": "eye",
  attention: "target",
  "cognitive-control": "bolt",
  language: "message",
  "episodic-memory": "clock",
};
$("#app").innerHTML = `
  <div class="ambient ambient-one"></div><div class="ambient ambient-two"></div><div class="ambient ambient-three"></div>
  <header class="header"><a class="brand" href="#atlas" aria-label="HugeBrain 首页"><span class="brand-symbol">${icon("brain")}</span><span>Huge<span class="brand-light">Brain</span><small>CONNECTING MINDS & DISCOVERIES</small></span></a><nav class="main-nav" aria-label="主导航"><button class="nav-item active" data-tab="atlas">${icon("brain")} 脑图谱</button><button class="nav-item" data-tab="library">${icon("book")} 文献库 <span id="nav-count">—</span></button><button class="nav-item" data-tab="data">${icon("database")} 数据管理</button></nav><div class="header-actions"><span class="local-badge"><i></i> 本地工作空间</span><button id="add-paper" class="primary small">${icon("plus")} 添加文献</button></div></header>
  <main>
    <section id="atlas-page" class="page active"><div class="page-heading"><div><div class="eyebrow">THE SHAPE OF COGNITION</div><h1>认知的每一面，都有迹可循<span>。</span></h1><p>从一个脑区，到一种认知。让分散的发现，彼此连接。</p></div><button class="search-trigger glass" id="global-search">${icon("search")} <span>搜索脑区、功能或文献</span><kbd>⌘ K</kbd></button></div>
    <div class="workspace"><section class="brain-stage glass" aria-label="交互式脑图谱"><div class="stage-heading"><div class="atlas-label">${icon("layers")} <strong>Destrieux</strong><span>a2009s</span><button class="plain-icon" id="atlas-info" aria-label="查看图谱说明">${icon("info")}</button></div><span class="stage-badge">148 个皮层分区</span></div><div id="brain-canvas"></div><div id="brain-loading"><span class="loading-orb"></span><span>正在展开大脑的褶皱…</span></div><div id="brain-tooltip" role="tooltip"></div><div class="brain-annotation" id="brain-annotation"><span class="annotation-kicker">SELECTED REGION</span><h2 id="selected-region-title">选择一个脑区</h2><p id="selected-region-en">旋转大脑，探索文献证据</p><div id="selected-region-meta"></div><div id="region-preview"></div></div><div class="view-switch glass" aria-label="脑表面类型"><button data-surface="pial" class="active">皮层表面</button><button data-surface="inflated">膨胀表面</button></div><div class="canvas-controls glass"><button id="reset-view" aria-label="重置视角" title="重置视角">${icon("reset")}</button><span></span><button id="zoom-in" aria-label="放大" title="放大">${icon("plus")}</button><button id="zoom-out" aria-label="缩小" title="缩小"><svg class="icon" viewBox="0 0 24 24"><path d="M5 12h14" stroke="currentColor" stroke-width="1.6"/></svg></button><span></span><button id="fullscreen" aria-label="全屏显示大脑" title="全屏显示">${icon("expand")}</button></div><div class="brain-footer"><div class="hemisphere-control" aria-label="半球选择"><button data-hemi="both" class="active">双侧</button><button data-hemi="lh">左半球</button><button data-hemi="rh">右半球</button></div><div class="view-select"><label for="camera-view" class="sr-only">视角</label><select id="camera-view"><option value="lateral">外侧视角</option><option value="medial">内侧视角</option><option value="top">顶部视角</option><option value="front">前部视角</option><option value="back">后部视角</option></select></div><span class="interaction-hint">${icon("move")} 拖动旋转 <b>·</b> 点击探索</span></div></section>
    <aside class="function-panel glass"><div class="panel-title"><div><span class="eyebrow">COGNITIVE LENS</span><h2>以认知为线索</h2></div><span class="circle-icon">${icon("spark")}</span></div><p class="panel-intro">选择一种功能，发现它在大脑中的足迹。</p><div id="function-list"></div><div class="heatmap-legend"><div><span>文献关联数量</span><strong id="heat-total">—</strong></div><div class="gradient-bar"></div><div class="legend-labels"><span>0 篇</span><span id="heat-max">— 篇</span></div><p>颜色越深，关联的独立文献越多。</p><p class="quiet-note">计数不等同于效应强度或证据质量。</p><span class="selection-key"><i></i> 蓝色标识当前选中脑区</span></div><label class="scope-control"><input id="verified-only" type="checkbox"/><span>仅已确认的脑区映射</span>${icon("info")}</label><div class="sample-notice">${icon("info")}<span id="mapping-note">示例文献 · 脑区映射待人工复核</span></div></aside></div>
    <section class="evidence-section" id="evidence-section"><div class="section-heading"><div><span class="eyebrow">FROM ANATOMY TO EVIDENCE</span><h2>这个脑区，告诉了我们什么？</h2></div><span class="subtle" id="evidence-count">选择脑区以查看证据</span></div><div class="evidence-layout"><div class="evidence-list glass"><div class="evidence-toolbar"><span id="evidence-region">脑区文献</span><label><input type="checkbox" id="limit-function"/> 当前认知功能</label></div><div id="region-papers"><div class="empty-state">点击大脑表面，开启探索。</div></div></div><div class="paper-detail glass" id="paper-detail"><div class="empty-state">${icon("book")}<h3>每一个结论，都能回到来源</h3><p>选择一篇文献，查看实验范式、机制解释和指标动画。</p></div></div></div></section>
    <footer class="page-footer"><span>HugeBrain <b>·</b> A living atlas of human cognition</span><button id="source-info">图谱与证据说明 ${icon("external")}</button><span>以证据连接认知</span></footer></section>
    <section id="library-page" class="page"><div class="page-heading"><div><div class="eyebrow">YOUR EVIDENCE, CONNECTED</div><h1>让知识，不止于收藏<span>。</span></h1><p>从文献、范式与指标中，整理认知的线索。</p></div><button class="secondary" id="import-library">${icon("plus")} 导入文献</button></div><div class="library-filters glass"><div class="input-search">${icon("search")}<input id="library-search" placeholder="搜索标题、作者、摘要或标签…" aria-label="搜索文献"/></div><select id="library-function" aria-label="按认知功能筛选"><option value="">全部认知功能</option></select><select id="library-method" aria-label="按研究方法筛选"><option value="">全部研究方法</option><option value="fMRI">fMRI</option><option value="EEG">EEG</option><option value="MEG">MEG</option><option value="behavior">行为研究</option></select><input id="library-year-from" type="number" placeholder="起始年份" aria-label="起始年份" min="1900" max="2100"/><input id="library-year-to" type="number" placeholder="结束年份" aria-label="结束年份" min="1900" max="2100"/><button id="clear-filters" class="plain">重置</button></div><div class="library-results-label"><span id="library-result-count"></span><span>所有示例均提供原始来源</span></div><div id="library-results" class="library-grid"></div></section>
    <section id="data-page" class="page"><div class="page-heading"><div><div class="eyebrow">BUILT ON EVIDENCE</div><h1>每一条证据，都有来处<span>。</span></h1><p>用结构化数据保存发现，用清晰的标签连接知识。</p></div><button class="secondary" id="export-data">${icon("download")} 导出数据</button></div><div id="data-stats" class="data-stats"></div><div class="data-grid"><article class="glass data-card"><span class="circle-icon">${icon("database")}</span><h2>一个可持续生长的文献库</h2><p>本地 SQLite 数据库保存文献、实验、发现与脑区关系。每个发现独立记录认知功能、指标、映射来源与确认状态。</p><div class="schema-flow"><span>文献<small>Paper</small></span>${icon("arrow")}<span>实验<small>Experiment</small></span>${icon("arrow")}<span>发现<small>Finding</small></span></div><div class="schema-branches"><span>脑区 · 半球 · 图谱</span><span>认知功能</span><span>测量指标</span><span>来源与置信度</span></div><p class="data-note">热图按独立文献去重统计；同一论文的多个实验不会重复增加同一个脑区的计数。无关联文献不表示该脑区没有相关功能。</p></article><article class="glass data-card"><span class="circle-icon">${icon("grid")}</span><h2>让标签保留研究的细节</h2><p>跨文献使用一致的标签，同时保留实验级与发现级的结构化信息。</p><div id="taxonomy-list" class="taxonomy-list"></div></article></div><div class="glass import-card"><div><h2>把你的文献带进来</h2><p>添加单篇文献，或导入 JSON 文献集。导出文件也可用于迁移到另一个 HugeBrain 工作空间。</p></div><div><button class="secondary" id="download-template">${icon("download")} 下载模板</button><button class="primary" id="import-json">${icon("plus")} 导入 JSON</button></div></div><div class="glass provenance-card"><h2>关于这份初始图谱</h2><p>三维表面来自 fsaverage5，使用 Destrieux（a2009s）分区，每侧 74 个皮层脑区；不含皮层下结构。初始论文为真实文献，解剖分区映射为人工示例，尚未经坐标或个体表面验证。教学动画不代表原始实验数据。</p><div><a href="https://doi.org/10.1016/j.neuroimage.2010.06.010" target="_blank" rel="noopener noreferrer">Destrieux et al., 2010 ${icon("external")}</a><a href="https://nilearn.github.io/stable/auto_examples/01_plotting/plot_surf_atlas.html" target="_blank" rel="noopener noreferrer">Nilearn 表面图谱 ${icon("external")}</a></div></div></section>
  </main><div id="toast" role="status"></div><div id="modal-root"></div><input id="json-file" type="file" accept=".json,application/json" hidden/>
`;
async function init() {
  try {
    state.data = await api("/bootstrap");
    refreshShell();
    state.fn =
      state.data.functions.find((f) => f.id === "working-memory")?.id ||
      state.data.functions[0]?.id;
    renderFunctions();
    viewer = new BrainViewer($("#brain-canvas"), {
      onSelect: selectRegion,
      onHover: (id, event) => {
        const tt = $("#brain-tooltip");
        if (!id) {
          tt.classList.remove("visible");
          return;
        }
        const r = state.data.regions.find((r) => r.id === id);
        tt.textContent = `${r?.name_zh || r?.name || id} · ${r?.hemisphere === "lh" ? "左" : "右"}`;
        tt.classList.add("visible");
        const rect = $(".brain-stage").getBoundingClientRect();
        tt.style.left = `${Math.min(event.clientX - rect.left + 14, rect.width - 230)}px`;
        tt.style.top = `${event.clientY - rect.top - 42}px`;
      },
      onReady: () => {
        $("#brain-loading").classList.add("hidden");
        viewer.setHeatmap(
          Object.fromEntries(
            (state.heatmap?.counts || []).map((c) => [c.region_id, c.count]),
          ),
        );
        if (state.region) viewer.select(state.region);
      },
      onError: (e) => {
        $("#brain-loading").innerHTML =
          `<span>${icon("info")}</span><strong>三维视图暂不可用</strong><span>${esc(e.message)}</span><button class="secondary" id="fallback-regions">通过列表探索脑区</button>`;
        $("#fallback-regions").onclick = openSearch;
      },
    });
    await setFunction(state.fn);
    const r =
      state.data.regions.find(
        (r) => r.hemisphere === "lh" && r.name === "G_front_middle",
      ) || state.data.regions[0];
    if (r) await selectRegion(r.id);
    renderData();
    if (location.hash === "#library" || location.hash === "#data")
      switchTab(location.hash.slice(1));
  } catch (e) {
    $("#brain-loading").innerHTML =
      `<strong>暂时无法连接文献库</strong><span>${esc(e.message)}</span><button class="secondary" onclick="location.reload()">重试</button>`;
    toast("请确认本地服务已启动。");
  }
}
function refreshShell() {
  $("#nav-count").textContent = state.data.stats.papers;
  $("#library-function").innerHTML =
    '<option value="">全部认知功能</option>' +
    state.data.functions
      .map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`)
      .join("");
}
function renderFunctions() {
  $("#function-list").innerHTML = state.data.functions
    .map((f) => {
      const n = state.data.papers.filter((p) =>
        p.findings?.some(
          (x) =>
            x.function_ids?.includes(f.id) &&
            (state.scope !== "accepted" || x.mapping_status === "accepted"),
        ),
      ).length;
      return `<button class="function-item ${f.id === state.fn ? "active" : ""}" data-function="${esc(f.id)}" aria-pressed="${f.id === state.fn}"><span class="function-icon">${icon(fnIcons[f.id] || "brain")}</span><span class="function-name">${esc(f.name)}<small>${esc(f.description?.split("。")[0] || f.id)}</small></span><span class="function-count">${n}</span>${icon("chevron")}</button>`;
    })
    .join("");
  $$("[data-function]").forEach(
    (el) => (el.onclick = () => setFunction(el.dataset.function)),
  );
}
async function setFunction(id) {
  state.fn = id;
  renderFunctions();
  const req = ++heatRequest;
  try {
    const h = await api(
      `/heatmap?function=${encodeURIComponent(id || "")}&mapping=${state.scope}`,
    );
    if (req !== heatRequest) return;
    state.heatmap = h;
    viewer?.setHeatmap(
      Object.fromEntries(h.counts.map((c) => [c.region_id, c.count])),
    );
    $("#heat-total").textContent = `${h.total_papers} 篇文献`;
    $("#heat-max").textContent = `${h.max_count} 篇`;
    $("#mapping-note").textContent =
      state.scope === "accepted"
        ? "仅显示已确认映射；示例数据暂无确认映射。"
        : "含待复核的解剖映射 · 不代表精确功能定位";
    if ($("#limit-function").checked && state.region)
      await selectRegion(state.region);
  } catch (e) {
    toast(e.message);
  }
}
async function selectRegion(id) {
  state.region = id;
  viewer?.select(id);
  const r = state.data.regions.find((r) => r.id === id);
  if (!r) return;
  $("#selected-region-title").textContent = r.name_zh || r.name;
  $("#selected-region-en").textContent = r.name;
  $("#selected-region-meta").innerHTML =
    `<span>${r.hemisphere === "lh" ? "左半球" : "右半球"}</span><span>a2009s · ${r.label_index}</span>`;
  $("#evidence-region").textContent =
    `${r.name_zh || r.name} · ${r.hemisphere === "lh" ? "左半球" : "右半球"}`;
  const req = ++regionRequest;
  try {
    const data = await api(
      `/regions/${encodeURIComponent(id)}?mapping=${state.scope}`,
    );
    if (req !== regionRequest) return;
    state.regionData = data;
    renderRegionPapers();
  } catch (e) {
    toast(e.message);
  }
}
function renderRegionPapers() {
  let papers = [...(state.regionData?.papers || [])].sort(
    (a, b) =>
      Number(b.findings?.some((f) => f.function_ids?.includes(state.fn))) -
      Number(a.findings?.some((f) => f.function_ids?.includes(state.fn))),
  );
  if ($("#limit-function").checked)
    papers = papers.filter((p) =>
      p.findings?.some(
        (f) =>
          f.region_id === state.region && f.function_ids?.includes(state.fn),
      ),
    );
  if (state.scope === "accepted")
    papers = papers.filter((p) =>
      p.findings?.some(
        (f) => f.region_id === state.region && f.mapping_status === "accepted",
      ),
    );
  $("#evidence-count").textContent = `${papers.length} 篇关联文献`;
  $("#region-preview").innerHTML =
    `<button class="region-evidence-link">${icon("book")} ${papers.length} 篇文献 · 查看证据 ${icon("arrow")}</button>${papers[0] ? `<p class="preview-paper-title">${esc(papers[0].title)}</p>` : ""}`;
  $(".region-evidence-link").onclick = () =>
    $("#evidence-section").scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
  $("#region-papers").innerHTML = papers.length
    ? papers
        .map(
          (p, i) =>
            `<button class="evidence-item ${i === 0 ? "active" : ""}" data-evidence="${esc(p.id)}"><div class="paper-kicker"><span>${esc((p.authors?.[0] || "").split(",")[0])}${p.authors?.length > 1 ? " et al." : ""}</span><span>${p.year}</span></div><h3>${esc(p.title)}</h3><div class="paper-meta"><span>${esc(p.journal)}</span><span>${esc(p.experiments?.[0]?.modality || "研究")}</span></div></button>`,
        )
        .join("")
    : `<div class="empty-state">${icon("book")}<h3>${state.scope === "accepted" ? "暂无已确认的映射" : "这里，等待新的发现"}</h3><p>当前筛选下尚未收录这个脑区的文献。没有记录不意味着没有相关功能。</p><button class="secondary" id="add-region-paper">${icon("plus")} 添加关联文献</button></div>`;
  $$("[data-evidence]").forEach(
    (b) =>
      (b.onclick = () => {
        $$("[data-evidence]").forEach((el) =>
          el.classList.toggle("active", el === b),
        );
        renderPaper(papers.find((p) => p.id === b.dataset.evidence));
      }),
  );
  if (papers.length) renderPaper(papers[0]);
  else {
    state.player?.destroy();
    $("#paper-detail").innerHTML =
      '<div class="empty-state"><h3>保持开放，也保持严谨</h3><p>你可以选择另一个脑区，或添加一篇新文献。</p></div>';
    $("#add-region-paper")?.addEventListener("click", openAddPaper);
  }
}
function safeUrl(p) {
  if (p.doi) return `https://doi.org/${encodeURI(p.doi)}`;
  try {
    const u = new URL(p.url);
    return ["https:", "http:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
function renderPaper(p, target = $("#paper-detail"), findingId = null) {
  state.player?.destroy();
  state.paper = p;
  const findings = (p.findings || []).filter(
    (f) =>
      (target.id === "modal-paper" ||
        !state.region ||
        f.region_id === state.region) &&
      (state.scope !== "accepted" || f.mapping_status === "accepted"),
  );
  const available = findings.length ? findings : p.findings || [];
  const f = available.find((x) => x.id === findingId) || available[0] || {};
  const e =
    p.experiments?.find((e) => e.id === f.experiment_id) ||
    p.experiments?.[0] ||
    {};
  target.innerHTML = `<div class="detail-header"><div><span class="eyebrow">EVIDENCE SPOTLIGHT</span><h3>${esc(p.title)}</h3><p>${esc(p.authors?.join(", "))} <b>·</b> ${p.year} <b>·</b> ${esc(p.journal)}</p></div>${safeUrl(p) ? `<a class="source-button" href="${esc(safeUrl(p))}" target="_blank" rel="noopener noreferrer" aria-label="打开论文原始来源">${icon("external")}</a>` : `<span class="source-button" title="尚未录入 DOI 或原始来源" aria-label="尚未录入原始来源">${icon("info")}</span>`}</div>${
    available.length > 1
      ? `<div class="finding-selector"><label for="finding-select-${target.id}">查看发现</label><select id="finding-select-${target.id}" class="finding-select">${available
          .map((x) => {
            const r = state.data.regions.find((r) => r.id === x.region_id);
            return `<option value="${esc(x.id)}" ${x.id === f.id ? "selected" : ""}>${r?.hemisphere === "lh" ? "左" : "右"} · ${esc(r?.name_zh || r?.name || x.region_id)} · ${esc(x.metric)}</option>`;
          })
          .join("")}</select></div>`
      : ""
  }<div class="detail-body"><div class="finding-content"><div class="detail-tabs" role="tablist"><button class="active" data-detail-tab="finding" role="tab" aria-selected="true">研究发现</button><button data-detail-tab="tags" role="tab" aria-selected="false">标签档案</button><button data-detail-tab="mapping" role="tab" aria-selected="false">脑区映射</button></div><div id="detail-tab-content"></div></div><div class="animation-container"></div></div>`;
  $(".finding-select", target)?.addEventListener("change", (event) =>
    renderPaper(p, target, event.target.value),
  );
  const renderTab = (tab) => {
    const c = $("#detail-tab-content", target);
    if (tab === "finding")
      c.innerHTML = `<div class="detail-section"><h4>研究问题与范式</h4><p>${esc(e.task_description || p.summary || "尚未录入实验描述")}</p></div><div class="detail-section"><h4>这项研究发现了什么</h4><p>${esc(f.summary || p.summary || "尚未录入发现")}</p></div>${f.mechanism ? `<div class="finding-callout"><span>${icon("spark")}</span><p>${esc(f.mechanism)}</p></div>` : ""}<div class="detail-tags">${[
        e.modality,
        e.paradigm,
        f.metric,
      ]
        .filter(Boolean)
        .map((t) => `<span>${esc(t)}</span>`)
        .join(
          "",
        )}</div><p class="detail-note">${icon("info")} ${esc(f.mapping_status === "accepted" ? "已确认的脑区映射" : "功能定位与 a2009s 分区为近似映射，待人工复核。")}</p>`;
    else if (tab === "tags") {
      const categories = {};
      (p.tags || []).forEach((t) =>
        (categories[t.category] ??= []).push(t.label),
      );
      c.innerHTML =
        Object.entries(categories)
          .map(
            ([key, tags]) =>
              `<div class="tag-category"><h4>${esc(categoryName(key))}</h4><div class="detail-tags">${tags.map((t) => `<span>${esc(t)}</span>`).join("")}</div></div>`,
          )
          .join("") || '<p class="subtle">尚未添加标签</p>';
    } else
      c.innerHTML = `<p class="mapping-explanation">每项发现保留独立的映射状态与来源。功能区名称不能直接替代解剖图谱分区。</p>${(
        p.findings || []
      )
        .map((x) => {
          const r = state.data.regions.find((r) => r.id === x.region_id);
          return `<div class="mapping-row"><strong>${esc(r?.name_zh || r?.name || x.region_id)} · ${r?.hemisphere === "lh" ? "左" : "右"}</strong><span class="mini-badge ${x.mapping_status === "accepted" ? "accepted" : ""}">${x.mapping_status === "accepted" ? "已确认" : "待复核"}</span><p>${esc(x.mapping_source || "尚未填写映射来源")}</p></div>`;
        })
        .join("")}`;
  };
  $$("[data-detail-tab]", target).forEach(
    (b) =>
      (b.onclick = () => {
        $$("[data-detail-tab]", target).forEach((el) => {
          el.classList.toggle("active", el === b);
          el.setAttribute("aria-selected", el === b);
        });
        renderTab(b.dataset.detailTab);
      }),
  );
  renderTab("finding");
  state.player = new ExperimentPlayer($(".animation-container", target), e, f);
}
function categoryName(key) {
  return (
    {
      domain: "认知领域",
      process: "认知过程",
      paradigm: "实验范式",
      modality: "测量技术",
      population: "研究群体",
      design: "研究设计",
      metric: "提取指标",
      analysis: "分析方法",
      stimulus: "刺激类型",
      evidence: "证据类型",
      quality: "证据质量",
      species: "物种",
      task: "任务",
      method: "研究方法",
      sample: "样本特征",
      source: "来源",
      signal: "信号类型",
    }[key] || key
  );
}
function switchTab(tab) {
  state.tab = tab;
  $$(".page").forEach((el) =>
    el.classList.toggle("active", el.id === `${tab}-page`),
  );
  $$("[data-tab]").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === tab),
  );
  history.replaceState(null, "", `#${tab}`);
  if (tab === "library") loadLibrary();
  if (tab === "data") renderData();
  if (tab === "atlas") viewer?.resize();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
async function loadLibrary() {
  const req = ++libraryRequest;
  const params = new URLSearchParams({
    q: $("#library-search").value,
    function: $("#library-function").value,
    method: $("#library-method").value,
    year_from: $("#library-year-from").value,
    year_to: $("#library-year-to").value,
  });
  try {
    const data = await api(`/papers?${params}`);
    if (req !== libraryRequest) return;
    $("#library-result-count").textContent = `${data.total} 篇文献`;
    $("#library-results").innerHTML = data.papers.length
      ? data.papers
          .map(
            (p) =>
              `<article class="glass library-card"><div class="paper-kicker"><span>${esc(p.journal)}</span><strong>${p.year}</strong></div><h2>${esc(p.title)}</h2><p class="library-authors">${esc(p.authors?.join(", "))}</p><p class="library-summary">${esc(p.summary)}</p><div class="detail-tags">${(
                p.tags || []
              )
                .slice(0, 4)
                .map((t) => `<span>${esc(t.label)}</span>`)
                .join(
                  "",
                )}</div><div class="library-card-footer"><span>${p.findings?.length || 0} 条发现 <b>·</b> ${p.experiments?.length || 0} 个实验</span><button data-library-paper="${esc(p.id)}">阅读证据 ${icon("arrow")}</button></div></article>`,
          )
          .join("")
      : '<div class="empty-state glass"><h3>没有匹配的文献</h3><p>试试其他关键词，或调整筛选条件。</p></div>';
    $$("[data-library-paper]").forEach(
      (b) =>
        (b.onclick = () =>
          openPaperModal(
            data.papers.find((p) => p.id === b.dataset.libraryPaper),
          )),
    );
  } catch (e) {
    toast(e.message);
  }
}
function renderData() {
  if (!state.data) return;
  const s = state.data.stats;
  $("#data-stats").innerHTML = [
    [s.papers, "篇文献", "book"],
    [s.regions, "个脑区", "brain"],
    [s.findings, "条研究发现", "spark"],
    [s.accepted_mappings, "条确认映射", "check"],
  ]
    .map(
      ([n, label, i]) =>
        `<div class="glass stat-card">${icon(i)}<strong>${n}</strong><span>${label}</span></div>`,
    )
    .join("");
  const categories = {};
  state.data.tags.forEach(
    (t) => (categories[t.category] = (categories[t.category] || 0) + 1),
  );
  $("#taxonomy-list").innerHTML = Object.entries(categories)
    .map(
      ([cat, n]) => `<span>${esc(categoryName(cat))}<small>${n}</small></span>`,
    )
    .join("");
}
let restoreFocus;
function openModal(content, cls = "") {
  restoreFocus = document.activeElement;
  $("#modal-root").innerHTML =
    `<div class="modal-overlay"><section class="modal glass ${cls}" role="dialog" aria-modal="true" aria-label="HugeBrain 对话框"><button class="modal-close icon-button" aria-label="关闭对话框">${icon("close")}</button>${content}</section></div>`;
  document.body.classList.add("modal-open");
  $(".modal-close").onclick = closeModal;
  $(".modal-overlay").onclick = (e) => {
    if (e.target === e.currentTarget) closeModal();
  };
  setTimeout(() => $(".modal input, .modal button")?.focus(), 30);
}
function closeModal() {
  if ($(".modal .animation-container")) {
    state.player?.destroy();
    if (state.regionData) renderRegionPapers();
  }
  $("#modal-root").innerHTML = "";
  document.body.classList.remove("modal-open");
  restoreFocus?.focus();
}
function openPaperModal(p) {
  openModal('<div id="modal-paper"></div>', "paper-modal");
  renderPaper(p, $("#modal-paper"));
}
function openSearch() {
  if (!state.data) return;
  openModal(
    `<div class="modal-title"><span class="eyebrow">FIND YOUR CONNECTION</span><h2>从好奇的地方开始</h2></div><div class="input-search modal-search">${icon("search")}<input id="search-input" placeholder="脑区、文献标题、认知功能…" autocomplete="off"/></div><div id="search-results" class="search-results"></div>`,
    "search-modal",
  );
  const run = () => {
    const q = $("#search-input").value.trim().toLowerCase();
    const regions = state.data.regions
      .filter((r) =>
        `${r.name} ${r.name_zh} ${r.hemisphere === "lh" ? "左半球" : "右半球"}`
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 20);
    const funcs = state.data.functions.filter((f) =>
      `${f.name} ${f.id}`.toLowerCase().includes(q),
    );
    const papers = q
      ? state.data.papers
          .filter((p) =>
            `${p.title} ${p.authors?.join(" ")} ${p.summary}`
              .toLowerCase()
              .includes(q),
          )
          .slice(0, 8)
      : [];
    $("#search-results").innerHTML =
      `${funcs.length ? "<h4>认知功能</h4>" : ""}${funcs.map((f) => `<button data-search-function="${esc(f.id)}">${icon(fnIcons[f.id] || "brain")}<span>${esc(f.name)}</span>${icon("arrow")}</button>`).join("")}${regions.length ? "<h4>脑区</h4>" : ""}${regions.map((r) => `<button data-search-region="${r.id}">${icon("brain")}<span>${esc(r.name_zh || r.name)}<small>${esc(r.name)} · ${r.hemisphere === "lh" ? "左半球" : "右半球"}</small></span>${icon("arrow")}</button>`).join("")}${papers.length ? "<h4>文献</h4>" : ""}${papers.map((p) => `<button data-search-paper="${esc(p.id)}">${icon("book")}<span>${esc(p.title)}<small>${p.year}</small></span>${icon("arrow")}</button>`).join("")}${!regions.length && !funcs.length && !papers.length ? '<div class="empty-state">没有找到匹配结果</div>' : ""}`;
    $$("[data-search-region]").forEach(
      (b) =>
        (b.onclick = () => {
          closeModal();
          switchTab("atlas");
          selectRegion(b.dataset.searchRegion);
        }),
    );
    $$("[data-search-function]").forEach(
      (b) =>
        (b.onclick = () => {
          closeModal();
          switchTab("atlas");
          setFunction(b.dataset.searchFunction);
        }),
    );
    $$("[data-search-paper]").forEach(
      (b) =>
        (b.onclick = () =>
          openPaperModal(
            state.data.papers.find((p) => p.id === b.dataset.searchPaper),
          )),
    );
  };
  $("#search-input").oninput = run;
  run();
  $("#search-input").focus();
}
function openInfo() {
  openModal(
    `<div class="modal-title"><span class="eyebrow">ATLAS & EVIDENCE</span><h2>真实解剖，谨慎解释</h2></div><div class="info-content"><h3>Destrieux · a2009s</h3><p>使用 fsaverage5 的真实软脑膜表面与膨胀表面，左右半球各 74 个脑回和脑沟分区。表面降采样后每侧包含 10,242 个顶点。图谱不包含皮层下结构。</p><h3>解剖分区 ≠ 功能定位</h3><p>例如初级视觉皮层（V1）与距状沟分区相关，但并不等同。初始文献与分区的对应属于待复核的解剖近似；正式分析应结合原文 ROI、坐标与个体图谱配准。</p><h3>热图与动画如何解读</h3><p>颜色按所选认知功能关联的独立文献数编码，已选脑区用蓝色标识。它不是效应量、统计显著性或元分析。所有动画是统一风格的教学示意，不是原文实测曲线。</p><a class="source-link" href="https://doi.org/10.1016/j.neuroimage.2010.06.010" target="_blank" rel="noopener noreferrer">图谱论文 · Destrieux et al., 2010 ${icon("external")}</a></div>`,
  );
}
function openAddPaper() {
  if (!state.data) return;
  openModal(
    `<div class="modal-title"><span class="eyebrow">ADD A DISCOVERY</span><h2>让一项发现，加入连接</h2><p>可先录入文献，脑区映射和实验信息可通过完整 JSON 导入。</p></div><form id="paper-form"><label class="form-full">论文标题 <b>*</b><input name="title" required maxlength="1000" placeholder="Original article title"/></label><div class="form-row"><label>作者 <b>*</b><input name="authors" required placeholder="多位作者用分号分隔"/></label><label>发表年份 <b>*</b><input name="year" type="number" min="1800" max="2100" value="${new Date().getFullYear()}" required/></label></div><div class="form-row"><label>期刊<input name="journal" placeholder="Journal"/></label><label>DOI<input name="doi" placeholder="10.xxxx/xxxxx"/></label></div><label class="form-full">研究摘要<textarea name="summary" rows="3" placeholder="研究问题、范式与主要发现"></textarea></label><div id="tag-rows"><div class="form-row" data-tag-row><label>标签类别<select name="tag_category"><option value="domain">认知领域</option><option value="paradigm">实验范式</option><option value="analysis">分析方法</option><option value="population">研究群体</option><option value="metric">提取指标</option><option value="stimulus">刺激类型</option><option value="process">认知过程</option><option value="modality">采集模态</option><option value="design">实验设计</option><option value="evidence">证据性质</option><option value="source">证据来源</option><option value="review">审阅状态</option></select></label><label>标签<input name="tags" placeholder="多个标签用逗号分隔"/></label></div></div><button type="button" class="plain add-tag-row" id="add-tag-row">＋ 新增标签维度</button><details class="form-details"><summary>关联实验与脑区（选填） ${icon("plus")}</summary><div class="form-row"><label>实验范式<input name="paradigm" placeholder="例如：延迟匹配任务"/></label><label>测量技术<select name="modality"><option>fMRI</option><option>EEG</option><option>MEG</option><option>behavior</option><option>other</option></select></label></div><label class="form-full">脑区<select name="region_id"><option value="">暂不关联脑区</option>${state.data.regions.map((r) => `<option value="${r.id}" ${r.id === state.region ? "selected" : ""}>${r.hemisphere === "lh" ? "左" : "右"} · ${esc(r.name_zh || r.name)} (${esc(r.name)})</option>`).join("")}</select></label><div class="form-row"><label>认知功能<select name="function_id">${state.data.functions.map((f) => `<option value="${esc(f.id)}" ${f.id === state.fn ? "selected" : ""}>${esc(f.name)}</option>`).join("")}</select></label><label>提取指标<input name="metric" placeholder="例如：BOLD 激活、解码准确率"/></label></div><label class="form-full">此脑区的研究发现<textarea name="finding" rows="2" placeholder="填写后才会建立脑区关联；新映射默认为待复核"></textarea></label></details><p id="form-error" class="form-error" role="alert"></p><div class="form-footer"><button type="button" class="plain" id="form-import">从 JSON 导入完整记录</button><button type="submit" class="primary">${icon("plus")} 保存文献</button></div></form>`,
    "add-modal",
  );
  $("#form-import").onclick = () => $("#json-file").click();
  $("#add-tag-row").onclick = () => {
    const row = $("[data-tag-row]").cloneNode(true);
    $("input", row).value = "";
    $("#tag-rows").appendChild(row);
    $("select", row).focus();
  };
  $("#paper-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const v = Object.fromEntries(new FormData(form));
    const payload = {
      title: v.title.trim(),
      authors: v.authors
        .split(/[;；]/)
        .map((s) => s.trim())
        .filter(Boolean),
      year: Number(v.year),
      journal: v.journal,
      doi: v.doi.replace(/^https?:\/\/(dx\.)?doi.org\//, ""),
      summary: v.summary,
      tags: $$("[data-tag-row]", form).flatMap((row) =>
        $("input", row)
          .value.split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean)
          .map((label) => ({ category: $("select", row).value, label })),
      ),
    };
    if (v.finding.trim() && v.region_id) {
      const expId = "local-exp-" + crypto.randomUUID();
      payload.experiments = [
        {
          id: expId,
          name: v.paradigm || "手工录入实验",
          paradigm: v.paradigm || "待补充",
          modality: v.modality,
          task_description: v.summary,
          animation: { type: "generic" },
        },
      ];
      payload.findings = [
        {
          experiment_id: expId,
          region_id: v.region_id,
          function_ids: [v.function_id],
          metric: v.metric || "待补充",
          summary: v.finding,
          mechanism: "",
          effect_direction: "mixed",
          mapping_status: "provisional",
          mapping_source: "用户手工标注，待复核原文坐标与图谱对应。",
          mapping_confidence: 0.35,
          animation: { type: "unconfigured" },
        },
      ];
    }
    const submit = $("[type=submit]", form);
    submit.disabled = true;
    try {
      await api("/papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      closeModal();
      await refreshData();
      toast("文献已保存到本地数据库");
    } catch (err) {
      $("#form-error").textContent = err.message;
      submit.disabled = false;
    }
  };
}
async function refreshData() {
  state.data = await api("/bootstrap");
  refreshShell();
  renderFunctions();
  renderData();
  await setFunction(state.fn);
  if (state.region) await selectRegion(state.region);
  if (state.tab === "library") await loadLibrary();
}
function downloadJSON(obj, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function importFile(file) {
  if (!file) return;
  try {
    const obj = JSON.parse(await file.text());
    const papers = Array.isArray(obj) ? obj : obj.papers || [obj];
    if (!papers.length) throw new Error("文件中没有文献记录");
    if (papers.length > 1000) throw new Error("每次最多导入 1000 篇文献");
    let ok = 0;
    const failures = [];
    for (const p of papers) {
      try {
        await api("/papers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p),
        });
        ok++;
      } catch (e) {
        failures.push(`${p.title || "未命名"}：${e.message}`);
      }
    }
    closeModal();
    await refreshData();
    if (failures.length)
      openModal(
        `<div class="modal-title"><h2>导入结果</h2><p>成功 ${ok} 篇，未导入 ${failures.length} 篇。已保存的记录保留。</p></div><div class="import-errors">${failures.map((x) => `<p>${esc(x)}</p>`).join("")}</div>`,
      );
    else toast(`已导入 ${ok} 篇文献`);
  } catch (e) {
    toast(`导入失败：${e.message}`);
  } finally {
    $("#json-file").value = "";
  }
}
$$("[data-tab]").forEach((b) => (b.onclick = () => switchTab(b.dataset.tab)));
$(".brand").onclick = (e) => {
  e.preventDefault();
  switchTab("atlas");
};
$("#add-paper").onclick = openAddPaper;
$("#global-search").onclick = openSearch;
$("#atlas-info").onclick = openInfo;
$("#source-info").onclick = openInfo;
$("#verified-only").onchange = async (e) => {
  state.scope = e.target.checked ? "accepted" : "all";
  await setFunction(state.fn);
  if (state.region) await selectRegion(state.region);
};
$("#limit-function").onchange = renderRegionPapers;
$$("[data-surface]").forEach(
  (b) =>
    (b.onclick = () => {
      $$("[data-surface]").forEach((el) =>
        el.classList.toggle("active", el === b),
      );
      viewer?.setSurface(b.dataset.surface);
    }),
);
$$("[data-hemi]").forEach(
  (b) =>
    (b.onclick = () => {
      $$("[data-hemi]").forEach((el) =>
        el.classList.toggle("active", el === b),
      );
      viewer?.setHemisphere(b.dataset.hemi);
    }),
);
$("#camera-view").onchange = (e) => {
  if (e.target.value === "medial" && viewer?.hemisphere === "both") {
    $('[data-hemi="lh"]').click();
  }
  viewer?.setView(e.target.value);
};
$("#reset-view").onclick = () => {
  viewer?.setView("lateral");
  $("#camera-view").value = "lateral";
  $('[data-hemi="both"]').click();
};
$("#zoom-in").onclick = () => viewer?.zoom(0.9);
$("#zoom-out").onclick = () => viewer?.zoom(1.1);
$("#fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $(".brain-stage").requestFullscreen();
  } catch {
    toast("当前浏览器不支持全屏显示");
  }
};
let searchTimer;
$("#library-search").oninput = () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadLibrary, 220);
};
[
  "library-function",
  "library-method",
  "library-year-from",
  "library-year-to",
].forEach((id) => ($(`#${id}`).onchange = loadLibrary));
$("#clear-filters").onclick = () => {
  $$(".library-filters input, .library-filters select").forEach(
    (el) => (el.value = ""),
  );
  loadLibrary();
};
["import-library", "import-json"].forEach(
  (id) => ($(`#${id}`).onclick = () => $("#json-file").click()),
);
$("#json-file").onchange = (e) => importFile(e.target.files[0]);
$("#export-data").onclick = async () => {
  try {
    downloadJSON(
      await api("/export"),
      `hugebrain-export-${new Date().toISOString().slice(0, 10)}.json`,
    );
    toast("数据库已导出为 JSON");
  } catch (e) {
    toast(e.message);
  }
};
$("#download-template").onclick = () =>
  downloadJSON(
    {
      papers: [
        {
          title: "请替换为论文原始标题",
          authors: ["Author A", "Author B"],
          year: 2026,
          journal: "Journal",
          doi: "",
          summary: "请填写可由原文支持的中文摘要",
          tags: [
            { category: "domain", label: "工作记忆" },
            { category: "analysis", label: "MVPA" },
          ],
          experiments: [],
          findings: [],
        },
      ],
    },
    "hugebrain-import-template.json",
  );
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    openSearch();
  }
  if (e.key === "Escape") closeModal();
  if (e.key === "Tab" && $(".modal")) {
    const focusable = $$(
      "button, input, select, textarea, a[href], summary",
      $(".modal"),
    ).filter((el) => !el.disabled && el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0],
      last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
init();
