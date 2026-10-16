import { icon } from "./icons.js";

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const DURATION = 12000;
const PURPLE = "#9275b2";
const INK = "#776486";
let nextPlayerId = 0;

const defaultPhases = {
  "orientation-delay": ["指定记忆目标", "刺激编码", "延迟保持", "探测判断"],
  nback: ["注视", "连续呈现", "更新记忆", "匹配判断"],
  "attention-cue": ["注视中心", "空间线索", "等待目标", "目标检测"],
  "category-viewing": ["观看图像", "提取模式", "构建比较", "比较表征"],
  language: ["阅读句子或非词", "探测判断", "个体功能定位", "条件比较"],
  generic: ["实验流程待配置"],
};

// Supplied durations weight the compressed teaching timeline; they are not real trial timings.
export function resolvePhases(experiment = {}) {
  const configured = experiment.animation?.phases;
  const source =
    Array.isArray(configured) && configured.length
      ? configured
      : defaultPhases[experiment.animation?.type] || defaultPhases.generic;
  return source.map((phase, i) => {
    const label = typeof phase === "string" ? phase : phase?.label;
    const rawDuration = Number(phase?.duration_ms ?? phase?.duration ?? 1);
    return {
      label: String(label || `步骤 ${i + 1}`),
      weight: Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 1,
    };
  });
}

export function createRdm(pattern = "category-structure") {
  // Fixed, symmetric, synthetic distances. Visual-feature groups are interleaved,
  // so EVC is not falsely presented as having the FFA category organization.
  const groups =
    pattern === "visual-structure" ? [0, 1, 0, 1, 0, 1] : [0, 0, 0, 1, 1, 1];
  return groups.map((group, row) =>
    groups.map((other, column) => {
      if (row === column) return 0;
      return group === other
        ? 0.16 + Math.abs(row - column) * 0.02
        : 0.72 + ((row + column) % 3) * 0.05;
    }),
  );
}

const svgText = (label, y = 80, size = 18, color = INK, x = 180) =>
  `<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}" fill="${color}" font-family="system-ui,sans-serif">${esc(label)}</text>`;
const fixation =
  '<path d="M174 76h12M180 70v12" stroke="#7d718d" stroke-width="1.5"/>';
const card = (x, label, fill = "#eee7f5", width = 92) =>
  `<rect x="${x}" y="46" width="${width}" height="56" rx="10" fill="${fill}" stroke="#d7c9e5"/>${svgText(label, 80, 17, INK, x + width / 2)}`;
const lines = (labels) =>
  labels.map((label, i) => svgText(label, 63 + i * 25, i ? 12 : 17)).join("");

function arrayStimulus(changed = false) {
  const colors = [
    "#ce8ba0",
    "#8fa8cf",
    changed ? "#d8b070" : "#8dbbaa",
    "#b394cb",
  ];
  return colors
    .map(
      (color, i) =>
        `<rect x="${126 + (i % 2) * 66}" y="${35 + Math.floor(i / 2) * 51}" width="40" height="32" rx="6" fill="${color}"/>`,
    )
    .join("");
}

function patternSwatches() {
  return (
    [0.26, 0.66, 0.4, 0.85, 0.3, 0.59, 0.7, 0.28]
      .map(
        (opacity, i) =>
          `<rect x="${106 + i * 20}" y="57" width="16" height="30" rx="3" fill="${PURPLE}" opacity="${opacity}"/>`,
      )
      .join("") + svgText("多个体素的活动模式（示意）", 116, 11)
  );
}

function workflowStimulus(experiment, phase, label) {
  const paradigm = `${experiment.paradigm || ""} ${experiment.name || ""}`;
  if (/Stroop/i.test(paradigm)) {
    if (phase === 0)
      return (
        card(73, "读词") +
        card(195, "报墨色") +
        svgText("依据提示选择任务规则", 130, 11)
      );
    if (phase === 1) return lines(["准备：报告墨色", "此步尚未呈现颜色词"]);
    if (phase === 2)
      return (
        svgText("红", 94, 54, "#6d90bc") +
        svgText("示例：词义与墨色不一致", 133, 11)
      );
    return lines(["墨色是「蓝」", "比较一致与不一致条件"]);
  }
  if (/变化检测|记忆负荷/.test(paradigm)) {
    if (phase === 0) return arrayStimulus() + svgText("示例项目阵列", 137, 11);
    if (phase === 1) return fixation + svgText("刺激消失，保持项目", 125, 11);
    if (phase === 2)
      return arrayStimulus(true) + svgText("某个项目是否发生变化？", 137, 11);
    return lines(["比较不同项目数量", "用行为表现估计记忆容量"]);
  }
  if (/双任务|协调/.test(paradigm)) {
    if (phase === 0) return card(134, "任务 A");
    if (phase === 1) return card(134, "任务 B");
    if (phase === 2)
      return (
        card(74, "任务 A") + card(194, "任务 B") + svgText("同时执行", 128, 12)
      );
    return lines(["单任务与双任务条件", "比较区域反应，不重现原始幅度"]);
  }
  // Unconfigured experiments get their supplied workflow, never an unrelated grating task.
  return lines([
    label.length > 22 ? `${label.slice(0, 22)}…` : label,
    "流程示意 · 刺激细节待配置",
  ]);
}

function stimulusMarkup(experiment, type, phase, label, withinPhase, uid) {
  if (type === "generic" || !defaultPhases[type])
    return workflowStimulus(experiment, phase, label);
  if (type === "orientation-delay") {
    if (/延迟|保持|空屏/.test(label))
      return fixation + svgText("无物理刺激的保持阶段", 128, 11);
    if (/提示|指定|选择/.test(label))
      return lines(["记住指定的朝向", "提示只保留任务相关信息"]);
    const probe = /探测|匹配|判断/.test(label);
    return `<circle cx="180" cy="76" r="43" fill="url(#${uid}-grating)" transform="rotate(${probe ? 18 : 0} 180 76)"/>${svgText(probe ? "探测：与记忆朝向比较" : "编码：观看光栅朝向", 137, 11)}`;
  }
  if (type === "attention-cue") {
    const locations =
      '<rect x="77" y="56" width="40" height="40" rx="8" fill="none" stroke="#dcd2e7"/><rect x="243" y="56" width="40" height="40" rx="8" fill="none" stroke="#dcd2e7"/>';
    if (/注视/.test(label)) return fixation + locations;
    if (/提示|线索/.test(label))
      return (
        locations +
        '<path d="M156 76h48m-11-11 11 11-11 11" stroke="#9275b2" stroke-width="3" fill="none"/>'
      );
    if (/等待/.test(label))
      return (
        fixation + locations + svgText("注意定向发生在目标出现前", 132, 11)
      );
    return (
      fixation +
      locations +
      '<circle cx="263" cy="76" r="12" fill="#9275b2"/>' +
      svgText("图示为提示位置目标；也可检验未提示位置", 132, 10)
    );
  }
  if (type === "language") {
    if (phase === 0)
      return lines([
        "她在阅读一本书。",
        "对照：可发音的非词序列（另一个条件）",
      ]);
    if (phase === 1)
      return lines(["「阅读」是否出现？", "判断探测项目是否在序列中"]);
    if (phase === 2)
      return lines(["每位参与者内定位", "句子相对非词的功能区域"]);
    return (
      card(74, "句子") +
      card(194, "非词") +
      svgText("再检验非语言任务反应", 130, 11)
    );
  }
  if (type === "category-viewing") {
    if (phase === 0)
      return (
        '<circle cx="120" cy="76" r="29" fill="#ddd4e9"/><path d="M110 69h1m19 0h1m-22 14q11 10 22 0" stroke="#8e77a5" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M219 57h35v42h-35Zm35 8h8v19h-8" fill="#ccd8e7" stroke="#8999b2" stroke-width="2"/>' +
        svgText("不同类别图像（符号示例）", 131, 11)
      );
    if (phase === 1) return patternSwatches();
    if (phase === 2)
      return lines([
        /RDM/.test(label) ? "计算两两不相似性" : "比较多次测量的模式",
        "根据条件间关系构建比较",
      ]);
    return lines([
      /模型/.test(experiment.task_description || "")
        ? "比较脑区与模型的结构"
        : "检查分布式类别信息",
      "图形仅讲解分析步骤",
    ]);
  }
  if (type === "nback") {
    if (phase === 0) return fixation;
    const sequence = ["A", "B", "A"];
    return (
      svgText(sequence[Math.min(phase - 1, 2)], 98, 58) +
      svgText(
        phase === 3 ? "按设定的 n 比较先前项目" : "连续呈现并更新记忆",
        134,
        11,
      )
    );
  }
  return workflowStimulus(experiment, phase, label);
}

const chart = (content, label) =>
  `<svg viewBox="0 0 360 112" role="img" aria-label="${esc(label)}；合成教学示意，非实测值">${content}</svg>`;
const chartText = (
  text,
  x,
  y,
  size = 10,
  anchor = "start",
  color = "#9987ab",
) =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${color}" font-size="${size}" font-family="system-ui,sans-serif">${esc(text)}</text>`;
const axes = '<path d="M24 24v61h318" stroke="#dbd2e4" fill="none"/>';

function conditionBars(labels, heights, t) {
  const step = 292 / labels.length;
  return chart(
    axes +
      chartText("相对反应（无实测量纲）", 25, 14, 9) +
      labels
        .map((label, i) => {
          const x = 34 + step * i + step * 0.2;
          const visible = t >= i / (labels.length + 1);
          return `<rect x="${x}" y="${85 - heights[i]}" width="${step * 0.55}" height="${heights[i]}" rx="4" fill="${PURPLE}" opacity="${visible ? 0.7 : 0.12}"/>${chartText(label, x + step * 0.275, 100, labels.length > 2 ? 9 : 10, "middle")}`;
        })
        .join(""),
    "不同条件的反应对比；柱高固定，播放仅依次展示条件",
  );
}

function categoryPatterns(t) {
  const rows = [
    [0.2, 0.8, 0.4, 0.65, 0.3, 0.85],
    [0.25, 0.76, 0.42, 0.7, 0.29, 0.8],
    [0.75, 0.25, 0.7, 0.3, 0.8, 0.2],
  ];
  const labels = ["类别 A · 测量 1", "类别 A · 测量 2", "类别 B"];
  return chart(
    rows
      .map(
        (row, r) =>
          chartText(labels[r], 7, 25 + r * 29, 10) +
          row
            .map(
              (value, c) =>
                `<rect x="${121 + c * 30}" y="${12 + r * 29}" width="24" height="20" rx="3" fill="${PURPLE}" fill-opacity="${value}" opacity="${t >= r / 4 ? 1 : 0.13}"/>`,
            )
            .join(""),
      )
      .join("") +
      chartText(
        "比较多个体素的模式 · 不等同于平均激活强弱",
        180,
        108,
        9,
        "middle",
      ),
    "类别的分布式活动模式比较",
  );
}

export function metricMarkup(finding = {}, t = 0) {
  const config = finding.animation || {};
  const type = config.type;
  const pattern = config.pattern;
  const progress = Math.min(1, Math.max(0, t));
  if (
    type === "rsa" &&
    ["category-structure", "visual-structure"].includes(pattern)
  ) {
    const rdm = createRdm(pattern);
    const byFeature = pattern === "visual-structure";
    const cells = rdm
      .flatMap((row, r) =>
        row.map((distance, c) => {
          // Both triangles reveal together. Opacity changes visibility, never the distance.
          const revealed = Math.max(r, c) <= Math.floor(progress * 6);
          return `<i data-row="${r}" data-column="${c}" data-dissimilarity="${distance}" title="${r + 1} × ${c + 1}：合成距离 ${distance.toFixed(2)}" style="background:rgba(129,98,177,${distance});opacity:${revealed ? 1 : 0.08}"></i>`;
        }),
      )
      .join("");
    return `<div class="rsa-matrix" role="img" aria-label="固定合成不相似性矩阵；对角线为零，同组距离较低，跨组距离较高；播放仅逐项揭示">${cells}</div><div class="rsa-copy">表征不相似性 RDM<small>对角线 = 0 · 深色 = 距离大<br/>${byFeature ? "按低层特征分组；非类别聚类结论" : "同类距离低 · 跨类距离高"}<br/>固定合成矩阵 · 逐项揭示</small></div>`;
  }
  if (type === "decoding" && pattern === "category-pattern")
    return categoryPatterns(progress);
  if (
    type === "decoding" &&
    ["delay-information", "selective-information"].includes(pattern)
  ) {
    const selective = pattern === "selective-information";
    return chart(
      axes +
        chartText("模式信息（无实测量纲）", 25, 14, 9) +
        '<rect x="104" y="25" width="164" height="59" fill="#eee7f5" opacity=".8"/>' +
        '<path d="M25 73h316" stroke="#c8bdd5" stroke-dasharray="3 4"/>' +
        chartText("机会水平（示意）", 334, 69, 8, "end") +
        '<path d="M30 46C78 43 105 42 145 43S220 45 266 43S308 42 336 44" stroke="#9275b2" stroke-width="2.5" fill="none"/>' +
        (selective
          ? '<path d="M30 73C95 72 150 74 200 73S280 72 336 73" stroke="#baadc9" stroke-width="2" fill="none" stroke-dasharray="5 4"/>'
          : "") +
        `<path d="M${25 + progress * 312} 25v59" stroke="#76618e" opacity=".35"/>` +
        chartText(
          selective
            ? "实线：相关特征；虚线：未选择特征"
            : "有可解码信息 ≠ 平均 BOLD 持续升高",
          180,
          101,
          9,
          "middle",
        ) +
        chartText("保持阶段", 186, 35, 8, "middle"),
      selective
        ? "选择性保持的信息；固定示意曲线，不表示逐渐学会"
        : "记忆保持中的解码信息；无实测准确率",
    );
  }
  if (type === "activation" && pattern === "plateau") {
    return chart(
      axes +
        chartText("相对 BOLD（示意）", 25, 14, 9) +
        '<path d="M30 80C62 75 93 53 123 39S178 29 217 28S296 28 337 28" stroke="#9275b2" stroke-width="2.5" fill="none"/>' +
        `<path d="M${25 + progress * 312} 24v61" stroke="#9275b2" opacity=".3"/>` +
        chartText("记忆负荷 →", 30, 103, 10) +
        chartText("增加后趋于饱和；非时间曲线", 337, 103, 9, "end"),
      "BOLD 随记忆负荷增加后趋于饱和；横轴为负荷，不是时间",
    );
  }
  if (type === "activation") {
    const contrasts = {
      "dual-task": [
        ["任务 A", "任务 B", "A + B"],
        [17, 20, 51],
      ],
      conflict: [
        ["一致", "不一致"],
        [24, 49],
      ],
      "language-selectivity": [
        ["非词", "句子"],
        [19, 51],
      ],
      preparation: [
        ["准备读词", "准备报墨色"],
        [23, 48],
      ],
      "cue-period": [
        ["基线", "提示期定向"],
        [18, 48],
      ],
      "unexpected-target": [
        ["已注意位置", "未注意位置"],
        [27, 49],
      ],
    };
    if (contrasts[pattern])
      return conditionBars(...contrasts[pattern], progress);
  }
  return chart(
    chartText("指标演示待配置", 180, 49, 13, "middle", INK) +
      chartText("尚未设置与此发现匹配的展示方式", 180, 72, 10, "middle") +
      chartText("不自动推定激活升高或正向结果", 180, 91, 9, "middle"),
    "指标展示待配置；未推断结果方向",
  );
}

export class ExperimentPlayer {
  constructor(container, experiment, finding) {
    this.container = container;
    this.exp = experiment || {};
    this.finding = finding || {};
    this.time = 0;
    this.speed = 1;
    this.playing = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.type = this.exp.animation?.type || "generic";
    this.uid = `experiment-${++nextPlayerId}`;
    const phaseConfig = resolvePhases(this.exp);
    this.phases = phaseConfig.map((p) => p.label);
    const weightSum = phaseConfig.reduce((sum, phase) => sum + phase.weight, 0);
    let accumulated = 0;
    this.phaseStarts = phaseConfig.map((phase) => {
      const start = accumulated / weightSum;
      accumulated += phase.weight;
      return start;
    });
    container.innerHTML = `<div class="animation-top"><span>${icon("spark")} 范式演示</span><span class="mini-badge">教学模拟</span></div><div class="stimulus-stage" aria-label="实验范式动画"><div class="stimulus-label">${esc(this.exp.paradigm || this.exp.name || "实验流程")}</div><svg viewBox="0 0 360 155" class="stimulus-svg" role="img" aria-label="实验刺激示意"><defs><pattern id="${this.uid}-grating" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="6" height="12" fill="#8d7ca6"/></pattern></defs><g class="stimulus-shapes"></g></svg><span class="phase-label"></span></div><div class="timeline">${this.phases.map((p, i) => `<button data-phase="${i}" aria-label="跳转到${esc(p)}"><i></i><span>${esc(p)}</span></button>`).join("")}</div><div class="playback"><button class="icon-button play-button" aria-label="${this.playing ? "暂停" : "播放"}动画">${icon(this.playing ? "pause" : "play")}</button><input class="animation-progress" aria-label="动画进度" type="range" min="0" max="999" value="0"/><span class="timecode">0:00 / 0:12</span><button class="speed-button" aria-label="切换播放速度">1×</button></div><div class="metric-heading"><span>${icon("layers")} ${esc(this.finding.metric || "指标示意")}</span><small>合成示意 · 非实测</small></div><div class="metric-plot"></div><p class="animation-disclaimer">范式时序经过压缩，刺激与指标图形均为教学示意，不代表原论文参数、测量值或真实效应大小。</p>`;
    container.querySelector(".play-button").onclick = () => this.toggle();
    container.querySelector(".speed-button").onclick = (event) => {
      this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 0.5 : 1;
      event.currentTarget.textContent = `${this.speed}×`;
    };
    container.querySelector(".animation-progress").oninput = (event) => {
      this.time = (Number(event.target.value) / 1000) * DURATION;
      this.draw();
    };
    container.querySelectorAll("[data-phase]").forEach((button) => {
      button.onclick = () => {
        this.time = this.phaseStarts[Number(button.dataset.phase)] * DURATION;
        this.draw();
      };
    });
    this.draw();
    let last = performance.now();
    this.interval = setInterval(() => {
      const now = performance.now();
      if (this.playing) {
        this.time = (this.time + (now - last) * this.speed) % DURATION;
        this.draw();
      }
      last = now;
    }, 50);
  }

  toggle() {
    this.playing = !this.playing;
    const button = this.container.querySelector(".play-button");
    button.innerHTML = icon(this.playing ? "pause" : "play");
    button.setAttribute("aria-label", `${this.playing ? "暂停" : "播放"}动画`);
  }

  draw() {
    const t = Math.min(0.999999, Math.max(0, this.time / DURATION));
    let phase = 0;
    this.phaseStarts.forEach((start, index) => {
      if (t >= start) phase = index;
    });
    const phaseEnd = this.phaseStarts[phase + 1] ?? 1;
    const withinPhase =
      (t - this.phaseStarts[phase]) / (phaseEnd - this.phaseStarts[phase]);
    this.container.querySelector(".stimulus-shapes").innerHTML = stimulusMarkup(
      this.exp,
      this.type,
      phase,
      this.phases[phase],
      withinPhase,
      this.uid,
    );
    this.container.querySelector(".phase-label").textContent =
      this.phases[phase];
    this.container
      .querySelectorAll("[data-phase]")
      .forEach((element, index) => {
        element.classList.toggle("active", index === phase);
        element.classList.toggle("done", index < phase);
        element.setAttribute(
          "aria-current",
          index === phase ? "step" : "false",
        );
      });
    this.container.querySelector(".animation-progress").value = Math.floor(
      t * 999,
    );
    this.container.querySelector(".timecode").textContent =
      `0:${String(Math.floor(this.time / 1000)).padStart(2, "0")} / 0:12`;
    this.container.querySelector(".metric-plot").innerHTML = metricMarkup(
      this.finding,
      t,
    );
  }

  destroy() {
    clearInterval(this.interval);
  }
}
