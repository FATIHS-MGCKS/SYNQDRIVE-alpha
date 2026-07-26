#!/usr/bin/env node
/**
 * Generates SynqDrive Master Admin Grafana dashboards (Phase 2F.6).
 * Run: node backend/monitoring/grafana/scripts/generate-dashboards.mjs
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'dashboards');

const DS = { type: 'prometheus', uid: 'prometheus' };

const DASHBOARD_LINKS = [
  { title: 'Platform', url: '/d/synqdrive-platform-overview', type: 'link' },
  { title: 'Infrastructure', url: '/d/synqdrive-infrastructure', type: 'link' },
  { title: 'Databases', url: '/d/synqdrive-databases', type: 'link' },
  { title: 'Queues', url: '/d/synqdrive-queues-workers', type: 'link' },
  { title: 'Billing', url: '/d/synqdrive-billing-payments', type: 'link' },
  { title: 'DIMO', url: '/d/synqdrive-dimo-integration', type: 'link' },
  { title: 'AI', url: '/d/synqdrive-ai-platform', type: 'link' },
  { title: 'Tenant', url: '/d/synqdrive-tenant-overview', type: 'link' },
  { title: 'Legacy Ops', url: '/d/synqdrive-ops', type: 'link' },
];

function baseDashboard({ uid, title, tags, description, links = DASHBOARD_LINKS }) {
  return {
    annotations: {
      list: [
        {
          builtIn: 1,
          datasource: '-- Grafana --',
          enable: true,
          hide: true,
          iconColor: 'rgba(0, 211, 255, 1)',
          name: 'Annotations & Alerts',
          type: 'dashboard',
        },
        {
          datasource: DS,
          enable: true,
          expr: 'ALERTS{alertstate="firing"}',
          iconColor: 'red',
          name: 'Prometheus firing alerts',
          step: '60s',
          tagKeys: 'alertname,severity',
          titleFormat: '{{alertname}}',
          type: 'dashboard',
        },
      ],
    },
    description,
    editable: true,
    fiscalYearStartMonth: 0,
    graphTooltip: 1,
    links,
    liveNow: false,
    panels: [],
    refresh: '30s',
    schemaVersion: 39,
    tags,
    templating: { list: [] },
    time: { from: 'now-24h', to: 'now' },
    timezone: 'browser',
    title,
    uid,
    version: 1,
  };
}

function row(id, title, y) {
  return { collapsed: false, gridPos: { h: 1, w: 24, x: 0, y }, id, panels: [], title, type: 'row' };
}

function stat(id, title, expr, pos, opts = {}) {
  const steps = opts.steps ?? [
    { color: 'red', value: null },
    { color: 'green', value: opts.okWhen ?? 1 },
  ];
  return {
    datasource: DS,
    description: opts.description,
    fieldConfig: {
      defaults: {
        decimals: opts.decimals,
        mappings: opts.mappings,
        thresholds: { mode: 'absolute', steps },
        unit: opts.unit ?? 'none',
      },
      overrides: [],
    },
    gridPos: pos,
    id,
    options: {
      colorMode: 'background',
      graphMode: opts.spark ? 'area' : 'none',
      justifyMode: 'center',
      orientation: 'auto',
      reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
      textMode: 'auto',
    },
    targets: [{ expr, refId: 'A' }],
    title,
    type: 'stat',
  };
}

function ts(id, title, targets, pos, opts = {}) {
  return {
    datasource: DS,
    description: opts.description,
    fieldConfig: {
      defaults: {
        custom: { drawStyle: 'line', fillOpacity: 8, lineWidth: 2, showPoints: 'never' },
        unit: opts.unit ?? 'short',
      },
      overrides: [],
    },
    gridPos: pos,
    id,
    options: {
      legend: { calcs: ['mean', 'max'], displayMode: 'table', placement: 'bottom', showLegend: true },
      tooltip: { mode: 'multi', sort: 'desc' },
    },
    targets: targets.map((t, i) => ({
      expr: t.expr,
      legendFormat: t.legend ?? t.legendFormat ?? `series ${i + 1}`,
      refId: String.fromCharCode(65 + i),
    })),
    title,
    type: 'timeseries',
  };
}

function table(id, title, expr, pos, opts = {}) {
  return {
    datasource: DS,
    fieldConfig: { defaults: {}, overrides: [] },
    gridPos: pos,
    id,
    options: {
      cellHeight: 'sm',
      footer: { show: false },
      showHeader: true,
      sortBy: [{ desc: true, displayName: 'Time' }],
    },
    targets: [{ expr, format: opts.format ?? 'table', instant: true, refId: 'A' }],
    title,
    transformations: opts.transformations ?? [],
    type: 'table',
  };
}

function alertStat(id, title, filter, pos) {
  return stat(
    id,
    title,
    `sum(ALERTS{alertstate="firing"${filter ? `, ${filter}` : ''}}) or vector(0)`,
    pos,
    { okWhen: 0, steps: [{ color: 'green', value: null }, { color: 'red', value: 1 }] },
  );
}

function buildPlatform() {
  const d = baseDashboard({
    uid: 'synqdrive-platform-overview',
    title: 'SynqDrive — Platform Overview',
    tags: ['synqdrive', 'platform', 'master-admin'],
    description: 'Executive platform health — dependency probes, scrape status, cross-domain KPIs, alert summary.',
  });
  let y = 0;
  d.panels.push(row(100, 'KPI — Platform health', y++));
  d.panels.push(
    stat(1, 'Backend scrape UP', 'up{job="synqdrive-backend"}', { h: 4, w: 4, x: 0, y }, { okWhen: 1 }),
    stat(2, 'Workers enabled', 'synqdrive_worker_runtime_enabled', { h: 4, w: 4, x: 4, y }, { okWhen: 1 }),
    stat(3, 'Postgres', 'synqdrive_dependency_up{dependency="postgres"}', { h: 4, w: 4, x: 8, y }, { okWhen: 1 }),
    stat(4, 'Redis', 'synqdrive_dependency_up{dependency="redis"}', { h: 4, w: 4, x: 12, y }, { okWhen: 1 }),
    stat(5, 'Queue broker', 'synqdrive_dependency_up{dependency="queue"}', { h: 4, w: 4, x: 16, y }, { okWhen: 1 }),
    stat(6, 'ClickHouse', 'synqdrive_clickhouse_available', { h: 4, w: 4, x: 20, y }, { okWhen: 1 }),
  );
  y += 4;
  d.panels.push(row(101, 'Alerts — firing summary', y++));
  d.panels.push(
    alertStat(10, 'Critical alerts', 'severity="critical"', { h: 4, w: 6, x: 0, y }),
    alertStat(11, 'Warning alerts', 'severity="warning"', { h: 4, w: 6, x: 6, y }),
    alertStat(12, 'App health alerts', 'alertname=~"SynqDrive.*"', { h: 4, w: 6, x: 12, y }),
    stat(13, 'Metrics scrape errors (1h)', 'sum(increase(synqdrive_metrics_endpoint_requests_total{result="error"}[1h])) or vector(0)', { h: 4, w: 6, x: 18, y }, { okWhen: 0 }),
  );
  y += 4;
  d.panels.push(row(102, 'Operations — throughput', y++));
  d.panels.push(
    ts(20, 'Trips finalized vs discarded', [
      { expr: 'sum(rate(synqdrive_trip_finalized_total[5m]))', legend: 'finalized' },
      { expr: 'sum(rate(synqdrive_trip_discarded_total[5m]))', legend: 'discarded' },
    ], { h: 8, w: 12, x: 0, y }),
    ts(21, 'Notifications lifecycle (rate)', [
      { expr: 'sum(rate(synqdrive_notifications_created_total[5m]))', legend: 'created' },
      { expr: 'sum(rate(synqdrive_notifications_resolved_total[5m]))', legend: 'resolved' },
      { expr: 'sum(rate(synqdrive_notification_dead_letters_total[5m]))', legend: 'dead letters' },
    ], { h: 8, w: 12, x: 12, y }),
  );
  y += 8;
  d.panels.push(row(103, 'Integrations — dependency map', y++));
  d.panels.push(
    ts(30, 'Application dependency_up', [
      { expr: 'synqdrive_dependency_up', legend: '{{dependency}}' },
    ], { h: 8, w: 24, x: 0, y }, { unit: 'none' }),
  );
  y += 8;
  d.panels.push(
    table(40, 'Firing Prometheus alerts (detail)', 'ALERTS{alertstate="firing"}', { h: 8, w: 24, x: 0, y }),
  );
  return d;
}

function buildInfrastructure() {
  const d = baseDashboard({
    uid: 'synqdrive-infrastructure',
    title: 'SynqDrive — Infrastructure',
    tags: ['synqdrive', 'infrastructure', 'master-admin'],
    description: 'Host, container, and edge signals. Exporter panels require node_exporter/cAdvisor/nginx_exporter (Phase 2F.3).',
  });
  let y = 0;
  d.panels.push(row(200, 'KPI — Host & scrape', y++));
  d.panels.push(
    stat(1, 'Backend UP', 'up{job="synqdrive-backend"}', { h: 4, w: 4, x: 0, y }, { okWhen: 1 }),
    stat(2, 'Node exporter', 'up{job="node"}', { h: 4, w: 4, x: 4, y }, { okWhen: 1, description: 'Requires node_exporter' }),
    stat(3, 'cAdvisor', 'up{job="cadvisor"}', { h: 4, w: 4, x: 8, y }, { okWhen: 1 }),
    stat(4, 'Nginx exporter', 'up{job="nginx"}', { h: 4, w: 4, x: 12, y }, { okWhen: 1 }),
    stat(5, 'Blackbox app', 'probe_success{job="blackbox",instance=~".*app.*"}', { h: 4, w: 4, x: 16, y }, { okWhen: 1 }),
    stat(6, 'Disk free %', '100 * node_filesystem_avail_bytes{mountpoint="/",fstype!="rootfs"} / node_filesystem_size_bytes{mountpoint="/",fstype!="rootfs"}', { h: 4, w: 4, x: 20, y }, { unit: 'percent', okWhen: 15 }),
  );
  y += 4;
  d.panels.push(row(201, 'Alerts', y++));
  d.panels.push(
    alertStat(10, 'Infra alerts firing', 'alertname=~"Node.*|Disk.*|Nginx.*|Blackbox.*"', { h: 4, w: 8, x: 0, y }),
    alertStat(11, 'App dependency alerts', 'alertname=~"SynqDrivePostgres.*|SynqDriveRedis.*"', { h: 4, w: 8, x: 8, y }),
  );
  y += 4;
  d.panels.push(row(202, 'Host resources', y++));
  d.panels.push(
    ts(20, 'CPU usage %', [{ expr: '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)', legend: 'cpu' }], { h: 8, w: 12, x: 0, y }, { unit: 'percent' }),
    ts(21, 'Memory available %', [{ expr: '100 * node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes', legend: 'mem avail' }], { h: 8, w: 12, x: 12, y }, { unit: 'percent' }),
  );
  y += 8;
  d.panels.push(
    ts(22, 'Disk usage % (root)', [{ expr: '100 - (100 * node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})', legend: 'disk used' }], { h: 8, w: 12, x: 0, y }, { unit: 'percent' }),
    ts(23, 'Container CPU (top)', [{ expr: 'topk(5, sum by (name) (rate(container_cpu_usage_seconds_total{name!=""}[5m])))', legend: '{{name}}' }], { h: 8, w: 12, x: 12, y }),
  );
  y += 8;
  d.panels.push(row(203, 'Nginx & probes', y++));
  d.panels.push(
    ts(30, 'Nginx connections', [
      { expr: 'nginx_connections_active', legend: 'active' },
      { expr: 'rate(nginx_connections_accepted[5m])', legend: 'accepted/s' },
    ], { h: 8, w: 12, x: 0, y }),
    ts(31, 'Blackbox probe duration', [{ expr: 'probe_duration_seconds{job="blackbox"}', legend: '{{instance}}' }], { h: 8, w: 12, x: 12, y }, { unit: 's' }),
  );
  return d;
}

function buildDatabases() {
  const d = baseDashboard({
    uid: 'synqdrive-databases',
    title: 'SynqDrive — Databases',
    tags: ['synqdrive', 'databases', 'master-admin'],
    description: 'PostgreSQL, Redis, ClickHouse — app probes + optional exporters.',
  });
  let y = 0;
  d.panels.push(row(300, 'KPI — Data stores', y++));
  d.panels.push(
    stat(1, 'Postgres probe', 'synqdrive_dependency_up{dependency="postgres"}', { h: 4, w: 4, x: 0, y }, { okWhen: 1 }),
    stat(2, 'Redis probe', 'synqdrive_dependency_up{dependency="redis"}', { h: 4, w: 4, x: 4, y }, { okWhen: 1 }),
    stat(3, 'ClickHouse probe', 'synqdrive_dependency_up{dependency="clickhouse"}', { h: 4, w: 4, x: 8, y }, { okWhen: 1 }),
    stat(4, 'CH schema status', 'synqdrive_clickhouse_schema_status', { h: 4, w: 4, x: 12, y }, { description: '3=available' }),
    stat(5, 'PG exporter', 'up{job="postgres"}', { h: 4, w: 4, x: 16, y }, { okWhen: 1 }),
    stat(6, 'Redis exporter', 'up{job="redis"}', { h: 4, w: 4, x: 20, y }, { okWhen: 1 }),
  );
  y += 4;
  d.panels.push(row(301, 'Alerts', y++));
  d.panels.push(
    alertStat(10, 'DB alerts', 'alertname=~"SynqDrivePostgres.*|SynqDriveRedis.*|ClickHouse.*"', { h: 4, w: 12, x: 0, y }),
  );
  y += 4;
  d.panels.push(row(302, 'PostgreSQL', y++));
  d.panels.push(
    ts(20, 'PG connections', [{ expr: 'pg_stat_activity_count', legend: '{{state}}' }], { h: 8, w: 12, x: 0, y }),
    ts(21, 'PG transactions', [{ expr: 'rate(pg_stat_database_xact_commit[5m])', legend: 'commit/s' }, { expr: 'rate(pg_stat_database_xact_rollback[5m])', legend: 'rollback/s' }], { h: 8, w: 12, x: 12, y }),
  );
  y += 8;
  d.panels.push(row(303, 'Redis', y++));
  d.panels.push(
    ts(30, 'Redis memory', [{ expr: 'redis_memory_used_bytes', legend: 'used' }], { h: 8, w: 12, x: 0, y }, { unit: 'bytes' }),
    ts(31, 'Redis commands/s', [{ expr: 'rate(redis_commands_processed_total[5m])', legend: 'cmds/s' }], { h: 8, w: 12, x: 12, y }),
  );
  y += 8;
  d.panels.push(row(304, 'ClickHouse (app metrics)', y++));
  d.panels.push(
    ts(40, 'CH query duration p95', [{ expr: 'histogram_quantile(0.95, sum by (le, query_type) (rate(synqdrive_clickhouse_query_duration_seconds_bucket[10m])))', legend: '{{query_type}}' }], { h: 8, w: 12, x: 0, y }, { unit: 's' }),
    ts(41, 'CH mirror writes', [{ expr: 'sum by (table, result) (rate(synqdrive_clickhouse_mirror_writes_total[5m]))', legend: '{{table}} {{result}}' }], { h: 8, w: 12, x: 12, y }),
    ts(42, 'CH table rows (active)', [{ expr: 'synqdrive_clickhouse_table_rows{status="active"}', legend: '{{table}}' }], { h: 8, w: 12, x: 0, y: y + 8 }),
    ts(43, 'CH analysis guard outcomes', [{ expr: 'sum by (outcome) (rate(synqdrive_clickhouse_analysis_guard_total[5m]))', legend: '{{outcome}}' }], { h: 8, w: 12, x: 12, y: y + 8 }),
  );
  return d;
}

function buildQueues() {
  const d = baseDashboard({
    uid: 'synqdrive-queues-workers',
    title: 'SynqDrive — Queues & Workers',
    tags: ['synqdrive', 'queues', 'workers', 'master-admin'],
    description: 'BullMQ depth, lag, failures, and worker runtime health.',
  });
  let y = 0;
  d.panels.push(row(400, 'KPI — Queue health', y++));
  d.panels.push(
    stat(1, 'Workers enabled', 'synqdrive_worker_runtime_enabled', { h: 4, w: 4, x: 0, y }, { okWhen: 1 }),
    stat(2, 'Queue broker', 'synqdrive_dependency_up{dependency="queue"}', { h: 4, w: 4, x: 4, y }, { okWhen: 1 }),
    stat(3, 'Total failed jobs', 'sum(synqdrive_queue_failed_jobs)', { h: 4, w: 4, x: 8, y }, { okWhen: 0 }),
    stat(4, 'Enrichment pending', 'synqdrive_enrichment_pending', { h: 4, w: 4, x: 12, y }),
    stat(5, 'Notif outbox', 'synqdrive_notification_outbox_pending', { h: 4, w: 4, x: 16, y }),
    stat(6, 'Task auto backlog', 'synqdrive_task_automation_outbox_backlog', { h: 4, w: 4, x: 20, y }),
  );
  y += 4;
  d.panels.push(row(401, 'Alerts', y++));
  d.panels.push(
    alertStat(10, 'Queue alerts', 'alertname=~"Queue.*|Notification.*Worker.*|DocumentExtraction.*Queue.*"', { h: 4, w: 12, x: 0, y }),
  );
  y += 4;
  d.panels.push(row(402, 'Backlog & failures', y++));
  d.panels.push(
    ts(20, 'Failed jobs by queue', [{ expr: 'synqdrive_queue_failed_jobs', legend: '{{queue}}' }], { h: 8, w: 12, x: 0, y }),
    ts(21, 'Queue lag p95', [{ expr: 'histogram_quantile(0.95, sum by (le, queue) (rate(synqdrive_queue_lag_seconds_bucket[10m])))', legend: '{{queue}}' }], { h: 8, w: 12, x: 12, y }, { unit: 's' }),
  );
  y += 8;
  d.panels.push(
    ts(22, 'Notification queue backlog', [{ expr: 'synqdrive_notification_queue_backlog', legend: '{{queue}}' }], { h: 8, w: 12, x: 0, y }),
    ts(23, 'Battery V2 DLQ', [{ expr: 'synqdrive_battery_v2_dead_letter_backlog', legend: 'dlq' }], { h: 8, w: 12, x: 12, y }),
  );
  y += 8;
  d.panels.push(row(403, 'Domain queues — drilldown', y++));
  d.panels.push(
    ts(30, 'DIMO snapshot poll rate', [{ expr: 'sum by (result) (rate(synqdrive_dimo_snapshot_poll_total[5m]))', legend: '{{result}}' }], { h: 8, w: 8, x: 0, y }),
    ts(31, 'Doc extraction active/age', [
      { expr: 'synqdrive_document_extraction_active_jobs', legend: 'active' },
      { expr: 'synqdrive_document_extraction_queue_age_seconds', legend: 'oldest wait (s)' },
    ], { h: 8, w: 8, x: 8, y }),
    ts(32, 'Voice webhook backlog', [{ expr: 'synqdrive_voice_webhook_backlog', legend: '{{status}}' }], { h: 8, w: 8, x: 16, y }),
  );
  return d;
}

function buildBilling() {
  const d = baseDashboard({
    uid: 'synqdrive-billing-payments',
    title: 'SynqDrive — Billing & Payments',
    tags: ['synqdrive', 'billing', 'payments', 'master-admin'],
    description: 'Stripe Connect payments, reconciliation, and SaaS billing dependency health.',
  });
  let y = 0;
  d.panels.push(row(500, 'KPI — Payments', y++));
  d.panels.push(
    stat(1, 'Stripe probe', 'synqdrive_dependency_up{dependency="stripe"}', { h: 4, w: 6, x: 0, y }, { okWhen: 1 }),
    stat(2, 'Connect webhook backlog', 'sum(synqdrive_payment_connect_webhook_backlog)', { h: 4, w: 6, x: 6, y }, { okWhen: 0 }),
    stat(3, 'Payment email DLQ', 'synqdrive_payment_email_dead_letter', { h: 4, w: 6, x: 12, y }, { okWhen: 0 }),
    stat(4, 'Reconciliation mismatches (1h)', 'sum(increase(synqdrive_payment_reconciliation_mismatch_total[1h])) or vector(0)', { h: 4, w: 6, x: 18, y }, { okWhen: 0 }),
  );
  y += 4;
  d.panels.push(row(501, 'Alerts', y++));
  d.panels.push(
    alertStat(10, 'Payment alerts', 'alertname=~"Payment.*|Stripe.*"', { h: 4, w: 12, x: 0, y }),
  );
  y += 4;
  d.panels.push(row(502, 'Checkout & webhooks', y++));
  d.panels.push(
    ts(20, 'Checkout creation', [{ expr: 'sum by (result) (rate(synqdrive_payment_checkout_creation_total[5m]))', legend: '{{result}}' }], { h: 8, w: 12, x: 0, y }),
    ts(21, 'Webhook processing', [{ expr: 'sum by (event_type, outcome) (rate(synqdrive_payment_webhook_processing_total[5m]))', legend: '{{event_type}} {{outcome}}' }], { h: 8, w: 12, x: 12, y }),
  );
  y += 8;
  d.panels.push(
    ts(22, 'Payment success vs failures', [
      { expr: 'sum(rate(synqdrive_payment_success_total[5m]))', legend: 'success' },
      { expr: 'sum(rate(synqdrive_payment_email_failure_total[5m]))', legend: 'email fail' },
      { expr: 'sum(rate(synqdrive_payment_refund_failure_total[5m]))', legend: 'refund fail' },
    ], { h: 8, w: 12, x: 0, y }),
    ts(23, 'Unknown connected accounts', [{ expr: 'sum(rate(synqdrive_payment_unknown_connected_account_total[5m]))', legend: 'unknown acct' }], { h: 8, w: 12, x: 12, y }),
  );
  return d;
}

function buildDimo() {
  const d = baseDashboard({
    uid: 'synqdrive-dimo-integration',
    title: 'SynqDrive — DIMO Integration',
    tags: ['synqdrive', 'dimo', 'telematics', 'master-admin'],
    description: 'DIMO snapshot polling, connectivity webhooks, and token health.',
  });
  let y = 0;
  d.panels.push(row(600, 'KPI — DIMO', y++));
  d.panels.push(
    stat(1, 'DIMO probe', 'synqdrive_dependency_up{dependency="dimo"}', { h: 4, w: 6, x: 0, y }, { okWhen: 1 }),
    stat(2, 'Snapshot success % (30m)', 'sum(rate(synqdrive_dimo_snapshot_poll_total{result="success"}[30m])) / clamp_min(sum(rate(synqdrive_dimo_snapshot_poll_total[30m])), 0.001) * 100', { h: 4, w: 6, x: 6, y }, { unit: 'percent', okWhen: 90 }),
    stat(3, 'Stale snapshots (1h)', 'sum(increase(synqdrive_stale_snapshots_total[1h])) or vector(0)', { h: 4, w: 6, x: 12, y }, { okWhen: 0 }),
    stat(4, 'Connectivity coverage', 'synqdrive_connectivity_coverage_ratio', { h: 4, w: 6, x: 18, y }, { unit: 'percentunit' }),
  );
  y += 4;
  d.panels.push(row(601, 'Alerts', y++));
  d.panels.push(
    alertStat(10, 'DIMO / snapshot alerts', 'alertname=~"Dimo.*|ConnectWebhook.*|Connectivity.*"', { h: 4, w: 12, x: 0, y }),
  );
  y += 4;
  d.panels.push(row(602, 'Snapshot polling', y++));
  d.panels.push(
    ts(20, 'Snapshot poll outcomes', [{ expr: 'sum by (result) (rate(synqdrive_dimo_snapshot_poll_total[5m]))', legend: '{{result}}' }], { h: 8, w: 12, x: 0, y }),
    ts(21, 'Empty / duplicate snapshots', [
      { expr: 'sum(rate(synqdrive_empty_snapshots_total[5m]))', legend: 'empty' },
      { expr: 'sum(rate(synqdrive_hv_snapshot_duplicates_discarded_total[5m]))', legend: 'hv dup discarded' },
    ], { h: 8, w: 12, x: 12, y }),
  );
  y += 8;
  d.panels.push(row(603, 'Connectivity webhooks', y++));
  d.panels.push(
    ts(30, 'Webhook received / failed', [
      { expr: 'sum by (result) (rate(synqdrive_connectivity_webhook_received_total[5m]))', legend: 'recv {{result}}' },
      { expr: 'sum(rate(synqdrive_connectivity_webhook_processing_failed_total[5m]))', legend: 'proc fail' },
    ], { h: 8, w: 12, x: 0, y }),
    ts(31, 'Episodes opened / resolved', [
      { expr: 'sum(rate(synqdrive_connectivity_episode_opened_total[5m]))', legend: 'opened' },
      { expr: 'sum(rate(synqdrive_connectivity_episode_resolved_total[5m]))', legend: 'resolved' },
    ], { h: 8, w: 12, x: 12, y }),
  );
  y += 8;
  d.panels.push(
    ts(32, 'Trip quality anomalies', [{ expr: 'sum by (kind) (rate(synqdrive_trip_quality_anomalies_total[5m]))', legend: '{{kind}}' }], { h: 8, w: 24, x: 0, y }),
  );
  return d;
}

function buildAi() {
  const d = baseDashboard({
    uid: 'synqdrive-ai-platform',
    title: 'SynqDrive — AI Platform',
    tags: ['synqdrive', 'ai', 'master-admin'],
    description: 'LLM dependency health, document AI pipeline, and Voice AI operations.',
  });
  let y = 0;
  d.panels.push(row(700, 'KPI — AI health', y++));
  d.panels.push(
    stat(1, 'AI provider probe', 'synqdrive_dependency_up{dependency="ai"}', { h: 4, w: 4, x: 0, y }, { okWhen: 1 }),
    stat(2, 'Doc extraction probe', 'synqdrive_dependency_up{dependency="documentExtraction"}', { h: 4, w: 4, x: 4, y }, { okWhen: 1 }),
    stat(3, 'OCR fail rate (30m)', 'sum(rate(synqdrive_document_ocr_failed_total[30m])) / clamp_min(sum(rate(synqdrive_document_ocr_total[30m])), 0.001)', { h: 4, w: 4, x: 8, y }, { okWhen: 0 }),
    stat(4, 'Voice webhook DLQ (24h)', 'sum(increase(synqdrive_voice_webhook_dlq_total[24h])) or vector(0)', { h: 4, w: 4, x: 12, y }, { okWhen: 0 }),
    stat(5, 'Voice MCP errors (1h)', 'sum(increase(synqdrive_voice_mcp_errors_total[1h])) or vector(0)', { h: 4, w: 4, x: 16, y }, { okWhen: 0 }),
    stat(6, 'Doc queue age (s)', 'synqdrive_document_extraction_queue_age_seconds', { h: 4, w: 4, x: 20, y }),
  );
  y += 4;
  d.panels.push(row(701, 'Alerts', y++));
  d.panels.push(
    alertStat(10, 'AI / doc / voice alerts', 'alertname=~"SynqDriveAi.*|Document.*|Voice.*"', { h: 4, w: 12, x: 0, y }),
  );
  y += 4;
  d.panels.push(row(702, 'Document AI pipeline', y++));
  d.panels.push(
    ts(20, 'Extraction jobs by status', [{ expr: 'sum by (status) (rate(synqdrive_document_extraction_jobs_total[5m]))', legend: '{{status}}' }], { h: 8, w: 12, x: 0, y }),
    ts(21, 'Stage latency p95', [{ expr: 'histogram_quantile(0.95, sum by (le, stage) (rate(synqdrive_document_extraction_duration_seconds_bucket[10m])))', legend: '{{stage}}' }], { h: 8, w: 12, x: 12, y }, { unit: 's' }),
  );
  y += 8;
  d.panels.push(row(703, 'Voice AI', y++));
  d.panels.push(
    ts(30, 'Voice webhook processing', [{ expr: 'sum by (outcome) (rate(synqdrive_voice_webhook_processing_total[5m]))', legend: '{{outcome}}' }], { h: 8, w: 12, x: 0, y }),
    ts(31, 'MCP tool calls', [{ expr: 'sum by (tool, outcome) (rate(synqdrive_voice_mcp_tool_calls_total[5m]))', legend: '{{tool}} {{outcome}}' }], { h: 8, w: 12, x: 12, y }),
  );
  y += 8;
  d.panels.push(
    ts(32, 'Document intake V2 upload funnel', [
      { expr: 'sum(rate(synqdrive_document_upload_total[5m]))', legend: 'uploads' },
      { expr: 'sum(rate(synqdrive_document_upload_rejected_total[5m]))', legend: 'rejected' },
    ], { h: 8, w: 24, x: 0, y }),
  );
  return d;
}

function buildTenant() {
  const d = baseDashboard({
    uid: 'synqdrive-tenant-overview',
    title: 'SynqDrive — Tenant Overview',
    tags: ['synqdrive', 'tenant', 'iam', 'master-admin'],
    description: 'Platform-wide tenant/IAM signals — aggregate only, no per-org labels.',
  });
  let y = 0;
  d.panels.push(row(800, 'KPI — Identity & fleet', y++));
  d.panels.push(
    stat(1, 'Login success (1h)', 'sum(increase(iam_login_success_total[1h])) or vector(0)', { h: 4, w: 4, x: 0, y }),
    stat(2, 'Login failures (1h)', 'sum(increase(iam_login_failure_total[1h])) or vector(0)', { h: 4, w: 4, x: 4, y }, { okWhen: 0 }),
    stat(3, 'Cross-tenant denials (1h)', 'sum(increase(iam_cross_tenant_denial_total[1h])) or vector(0)', { h: 4, w: 4, x: 8, y }, { okWhen: 0 }),
    stat(4, 'Orgs without admin', 'iam_organizations_without_admin_total', { h: 4, w: 4, x: 12, y }, { okWhen: 0 }),
    stat(5, 'Fleet ready share', 'synqdrive:fleet_health:ready_share', { h: 4, w: 4, x: 16, y }, { unit: 'percentunit' }),
    stat(6, 'Evaluations API p99', 'synqdrive:evaluations:api_request_p99_seconds', { h: 4, w: 4, x: 20, y }, { unit: 's' }),
  );
  y += 4;
  d.panels.push(row(801, 'Alerts', y++));
  d.panels.push(
    alertStat(10, 'Fleet / IAM alerts', 'alertname=~"FleetHealth.*|Iam.*"', { h: 4, w: 12, x: 0, y }),
  );
  y += 4;
  d.panels.push(row(802, 'IAM & access', y++));
  d.panels.push(
    ts(20, 'Login outcomes', [
      { expr: 'sum(rate(iam_login_success_total[5m]))', legend: 'success' },
      { expr: 'sum by (reason) (rate(iam_login_failure_total[5m]))', legend: 'fail {{reason}}' },
    ], { h: 8, w: 12, x: 0, y }),
    ts(21, 'Membership lifecycle', [{ expr: 'sum by (action) (rate(iam_membership_lifecycle_total[5m]))', legend: '{{action}}' }], { h: 8, w: 12, x: 12, y }),
  );
  y += 8;
  d.panels.push(row(803, 'Fleet Health Service SLO', y++));
  d.panels.push(
    ts(30, 'Fleet availability levels', [{ expr: 'sum by (level) (synqdrive_fleet_health_availability_total)', legend: '{{level}}' }], { h: 8, w: 12, x: 0, y }),
    ts(31, 'Rental health request p99', [{ expr: 'synqdrive:fleet_health:rental_health_request_p99_seconds', legend: 'p99' }], { h: 8, w: 12, x: 12, y }, { unit: 's' }),
  );
  y += 8;
  d.panels.push(row(804, 'Evaluations & insights', y++));
  d.panels.push(
    ts(40, 'Evaluations API duration p95', [{ expr: 'histogram_quantile(0.95, sum by (le, route) (rate(synqdrive_evaluations_api_request_duration_seconds_bucket[10m])))', legend: '{{route}}' }], { h: 8, w: 12, x: 0, y }, { unit: 's' }),
    ts(41, 'Insights runs', [{ expr: 'sum by (outcome) (rate(synqdrive_evaluations_insights_runs_total[5m]))', legend: '{{outcome}}' }], { h: 8, w: 12, x: 12, y }),
  );
  return d;
}

const dashboards = [
  ['synqdrive-platform-overview.json', buildPlatform()],
  ['synqdrive-infrastructure.json', buildInfrastructure()],
  ['synqdrive-databases.json', buildDatabases()],
  ['synqdrive-queues-workers.json', buildQueues()],
  ['synqdrive-billing-payments.json', buildBilling()],
  ['synqdrive-dimo-integration.json', buildDimo()],
  ['synqdrive-ai-platform.json', buildAi()],
  ['synqdrive-tenant-overview.json', buildTenant()],
];

mkdirSync(OUT_DIR, { recursive: true });
for (const [file, json] of dashboards) {
  const path = join(OUT_DIR, file);
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`Wrote ${path}`);
}
