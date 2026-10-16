import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolvePhases, createRdm, metricMarkup } from '../src/animations.js';

const seed = JSON.parse(readFileSync(new URL('../database/seed.json', import.meta.url), 'utf8'));

test('each literature experiment preserves its configured teaching phases', () => {
  for (const paper of seed.papers) {
    for (const experiment of paper.experiments) {
      assert.deepEqual(
        resolvePhases(experiment).map(phase => phase.label),
        experiment.animation.phases.map(phase => phase.label),
        `${paper.id}: phases must not be replaced by a generic delayed-grating sequence`,
      );
    }
  }
});

test('custom phases retain relative durations, with safe defaults for invalid weights', () => {
  assert.deepEqual(resolvePhases({ animation: { phases: [
    { label: '编码', duration: 2 },
    { label: '保持', duration_ms: 6 },
    { label: '判断', duration: -1 },
  ] } }), [
    { label: '编码', weight: 2 },
    { label: '保持', weight: 6 },
    { label: '判断', weight: 1 },
  ]);
  assert.deepEqual(resolvePhases({}), [{ label: '实验流程待配置', weight: 1 }]);
});

test('synthetic dissimilarity matrices are symmetric with zero diagonal and lower within-group distances', () => {
  for (const pattern of ['category-structure', 'visual-structure']) {
    const matrix = createRdm(pattern);
    const groups = pattern === 'category-structure' ? [0, 0, 0, 1, 1, 1] : [0, 1, 0, 1, 0, 1];
    const within = [];
    const between = [];
    assert.equal(matrix.length, 6);
    matrix.forEach((row, r) => {
      assert.equal(row.length, 6);
      row.forEach((distance, c) => {
        assert.equal(distance, matrix[c][r], `${pattern}: RDM must be symmetric`);
        assert.ok(distance >= 0 && distance <= 1);
        if (r === c) assert.equal(distance, 0, 'self-dissimilarity must be zero');
        else (groups[r] === groups[c] ? within : between).push(distance);
      });
    });
    assert.ok(Math.max(...within) < Math.min(...between));
  }
  assert.notDeepEqual(createRdm('visual-structure'), createRdm('category-structure'),
    'EVC must not be assigned the same category organization as the FFA example');
});

test('RDM playback reveals fixed values rather than inventing an increase in similarity', () => {
  for (const pattern of ['category-structure', 'visual-structure']) {
    const finding = { animation: { type: 'rsa', pattern } };
    const values = progress => [...metricMarkup(finding, progress)
      .matchAll(/data-dissimilarity="([^"]+)"/g)].map(match => Number(match[1]));
    assert.equal(values(0).length, 36);
    assert.deepEqual(values(0), values(0.5));
    assert.deepEqual(values(0.5), values(0.99));
    assert.match(metricMarkup(finding, 0.5), /固定合成矩阵/);
  }
});

test('capacity illustration uses memory load as its axis, not a BOLD time course', () => {
  const markup = metricMarkup({ animation: { type: 'activation', pattern: 'plateau' } }, 0.5);
  assert.match(markup, /记忆负荷 →/);
  assert.match(markup, /横轴为负荷，不是时间/);
  assert.doesNotMatch(markup, /时间 →/);
});

test('delay decoding is explicitly distinct from sustained mean activation', () => {
  const markup = metricMarkup({ animation: { type: 'decoding', pattern: 'delay-information' } }, 0.5);
  assert.match(markup, /有可解码信息 ≠ 平均 BOLD 持续升高/);
  assert.match(markup, /保持阶段/);
  assert.match(markup, /非实测值/);
});

test('missing or unknown metric configuration never implies a positive activation result', () => {
  for (const finding of [
    {},
    { metric: 'BOLD 激活升高' },
    { metric: 'RSA', animation: {} },
    { animation: { type: 'activation' } },
    { animation: { type: 'activation', pattern: 'unknown' } },
    { animation: { type: 'unknown', pattern: 'plateau' } },
  ]) {
    const markup = metricMarkup(finding, 0.5);
    assert.match(markup, /指标演示待配置/);
    assert.match(markup, /不自动推定激活升高或正向结果/);
    assert.doesNotMatch(markup, /<path|<rect|rsa-matrix/);
  }
});

test('every seeded finding has a configured, explicitly illustrative renderer', () => {
  for (const paper of seed.papers) {
    for (const finding of paper.findings) {
      const markup = metricMarkup(finding, 0.75);
      assert.doesNotMatch(markup, /指标演示待配置/, `${finding.id}: missing supported configuration`);
      assert.match(markup, /合成|示意/);
      assert.equal(finding.animation.synthetic, true);
      assert.equal(finding.animation.data_status, 'illustrative');
    }
  }
});
