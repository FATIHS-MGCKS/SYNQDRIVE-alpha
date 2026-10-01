#!/usr/bin/env bash
# EXP-021 S4F-5 — read-only Production preflight for DIMO global-budget config rollout readiness.
# Does NOT deploy, mutate env, restart PM2, run S4F-4 mutation mode, or call DIMO providers.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURRENT_MAIN_SHA="${DI_S4F5_CURRENT_MAIN_SHA:-8fa531b275bc4dca02c09b279c0d2b806e544007}"
BACKEND_ENV="${SYNQDRIVE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"

# shellcheck source=vps-production-replica-topology.config.sh
source "${SCRIPT_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${SCRIPT_DIR}/lib/vps-production-replica.lib.sh"

ENV_READ_CMD=(cat)
if [[ ! -r "$BACKEND_ENV" ]]; then
  if sudo -n test -r "$BACKEND_ENV" 2>/dev/null; then
    ENV_READ_CMD=(sudo -n cat)
  fi
fi

run_env_audit() {
  local audit_script="${SCRIPT_DIR}/di-v0-s4f-tiny-activation-global-budget-env-readonly-audit.sh"
  if [[ -f "$audit_script" ]]; then
    if [[ -r "$BACKEND_ENV" ]]; then
      SYNQDRIVE_BACKEND_ENV="$BACKEND_ENV" bash "$audit_script"
      return 0
    fi
    if sudo -n test -r "$BACKEND_ENV" 2>/dev/null; then
      sudo -n env SYNQDRIVE_BACKEND_ENV="$BACKEND_ENV" bash "$audit_script"
      return 0
    fi
  fi
  if "${ENV_READ_CMD[@]}" "$BACKEND_ENV" >/dev/null 2>&1; then
    if "${ENV_READ_CMD[@]}" "$BACKEND_ENV" | grep -q '^DIMO_GLOBAL_BUDGET_ENABLED='; then
      echo "GLOBAL_BUDGET_CONFIG_FILE_STATE=EXPLICIT"
    else
      echo "GLOBAL_BUDGET_CONFIG_FILE_STATE=MISSING"
    fi
    return 0
  fi
  echo "GLOBAL_BUDGET_CONFIG_FILE_STATE=UNREADABLE"
  return 0
}

release_dir="$(vps_replica_current_release_dir)"
prod_sha="$(vps_replica_current_sha)"
release_id="$(basename "$release_dir" 2>/dev/null || echo UNKNOWN)"

wrapper="${release_dir}/backend/scripts/ops/di-v0-s4f-enable-global-budget-production.sh"
metric_file="${release_dir}/backend/src/modules/dimo/provider-budget/dimo-provider-prometheus.metrics.ts"

s4f4_wrapper_present=NO
metric_code_present=NO
if [[ -f "$wrapper" ]]; then s4f4_wrapper_present=YES; fi
if [[ -f "$metric_file" ]] && grep -q 'synqdrive_dimo_global_budget_enabled' "$metric_file" 2>/dev/null; then
  metric_code_present=YES
fi

contains_pr1863=NO
if [[ "$prod_sha" == "$CURRENT_MAIN_SHA" ]]; then
  contains_pr1863=YES
fi

replica_match=UNKNOWN
if [[ -n "$prod_sha" ]]; then replica_match=YES; fi

health_a=FAIL
health_b=FAIL
if vps_replica_curl_health_ok "${SYNQDRIVE_REPLICA_A_PORT}"; then health_a=OK; fi
if vps_replica_curl_health_ok "${SYNQDRIVE_REPLICA_B_PORT}"; then health_b=OK; fi

leader_count="$(vps_replica_count_scheduler_leaders)"
scheduler_single=NO
if [[ "$leader_count" == "1" ]]; then scheduler_single=YES; fi

nginx_dual=UNKNOWN
if vps_replica_nginx_dual_upstream_ok 2>/dev/null; then nginx_dual=YES; else nginx_dual=NO; fi

config_state=UNREADABLE
audit_out="$(run_env_audit 2>/dev/null || true)"
config_state="$(printf '%s\n' "$audit_out" | grep '^GLOBAL_BUDGET_CONFIG_FILE_STATE=' | tail -1 | cut -d= -f2- || echo UNREADABLE)"

s4_flags_safe=UNKNOWN
s4_runtime_active=UNKNOWN
shadow_activation=NO
app_module="${release_dir}/backend/src/app.module.ts"
if [[ -f "$app_module" ]]; then
  if grep -qE 'di-v0-s4[bcde]|DiV0S4[BC]' "$app_module" 2>/dev/null; then
    s4_runtime_active=YES
  else
    s4_runtime_active=NO
  fi
fi

cli="${release_dir}/backend/scripts/ops/di-v0-s4f-global-budget-rollout/di-v0-s4f-global-budget-rollout-cli.ts"
if [[ -f "$cli" ]] && [[ "${ENV_READ_CMD[0]}" != "cat" || -r "$BACKEND_ENV" ]]; then
  if sudo -n test -r "$BACKEND_ENV" 2>/dev/null || [[ -r "$BACKEND_ENV" ]]; then
    if (cd "${release_dir}/backend" && npx --yes ts-node --transpile-only "$cli" s4-safe "$BACKEND_ENV" >/dev/null 2>&1); then
      s4_flags_safe=YES
    else
      s4_flags_safe=NO
    fi
  fi
elif [[ -r "$BACKEND_ENV" ]] || sudo -n test -r "$BACKEND_ENV" 2>/dev/null; then
  s4_truthy_count=0
  while IFS= read -r line; do
    val="$(echo "$line" | cut -d= -f2- | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
    case "$val" in true | 1 | yes | on) s4_truthy_count=$((s4_truthy_count + 1)) ;; esac
  done < <("${ENV_READ_CMD[@]}" "$BACKEND_ENV" | grep -E '^DI_V0_S4_(MASTER|DISCOVERY|WORKER|POSITION|R1|NATIVE)_ENABLED=' || true)
  if [[ "$s4_truthy_count" -eq 0 ]]; then s4_flags_safe=YES; else s4_flags_safe=NO; fi
fi

redis_reachable=UNKNOWN
if [[ -f "$cli" ]]; then
  if (cd "${release_dir}/backend" && npx --yes ts-node --transpile-only "$cli" redis-ping "$BACKEND_ENV" 2>/dev/null | grep -q 'REDIS_REACHABLE=YES'); then
    redis_reachable=YES
  else
    redis_reachable=NO
  fi
elif [[ -d "${release_dir}/backend/node_modules/ioredis" ]]; then
  if sudo -n node -e "
const fs=require('fs');const Redis=require('${release_dir}/backend/node_modules/ioredis');
const f=fs.readFileSync('${BACKEND_ENV}','utf8');const env={};
for(const line of f.split('\\n')){const t=line.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<=0)continue;let v=t.slice(i+1);if((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\")))v=v.slice(1,-1);env[t.slice(0,i)]=v;}
const c=new Redis({host:env.REDIS_HOST||'localhost',port:parseInt(env.REDIS_PORT||'6379',10),db:parseInt(env.REDIS_DB||'0',10),password:env.REDIS_PASSWORD||undefined,connectTimeout:3000,maxRetriesPerRequest:1,lazyConnect:true});
(async()=>{try{await c.connect();const p=await c.ping();process.stdout.write(p==='PONG'?'YES':'NO');}catch{process.stdout.write('NO');}finally{try{await c.quit();}catch{c.disconnect();}}})();
" 2>/dev/null | grep -q YES; then
    redis_reachable=YES
  else
    redis_reachable=NO
  fi
fi

runtime_a=UNKNOWN
runtime_b=UNKNOWN
if [[ "$metric_code_present" == "YES" && -f "$cli" ]]; then
  raw_a="$(cd "${release_dir}/backend" && npx --yes ts-node --transpile-only "$cli" fetch-live-metric "$BACKEND_ENV" "${SYNQDRIVE_REPLICA_A_PORT}" 2>/dev/null || true)"
  raw_b="$(cd "${release_dir}/backend" && npx --yes ts-node --transpile-only "$cli" fetch-live-metric "$BACKEND_ENV" "${SYNQDRIVE_REPLICA_B_PORT}" 2>/dev/null || true)"
  case "$raw_a" in 1) runtime_a=ENABLED ;; 0) runtime_a=DISABLED ;; *) runtime_a=UNKNOWN ;; esac
  case "$raw_b" in 1) runtime_b=ENABLED ;; 0) runtime_b=DISABLED ;; *) runtime_b=UNKNOWN ;; esac
fi

active_runtime=UNVERIFIED
if [[ "$runtime_a" == "ENABLED" && "$runtime_b" == "ENABLED" ]]; then
  active_runtime=CONFIRMED_ENABLED
elif [[ "$runtime_a" == "DISABLED" && "$runtime_b" == "DISABLED" ]]; then
  active_runtime=CONFIRMED_DISABLED
fi

provider_gate=MISSING_EXPLICIT_KEY
if [[ "$config_state" == "EXPLICIT_ENABLED" ]]; then provider_gate=EXPLICIT_ENABLED
elif [[ "$config_state" == "EXPLICIT_DISABLED" ]]; then provider_gate=EXPLICIT_DISABLED
elif [[ "$config_state" == "MALFORMED" ]]; then provider_gate=MALFORMED
fi

prereq=BLOCKED
blockers=""
next_action=""
if [[ "$health_a" != "OK" || "$health_b" != "OK" || "$scheduler_single" != "YES" || "$nginx_dual" != "YES" ]]; then
  prereq=BLOCKED
  blockers="replica_health_or_topology"
  next_action="Restore dual-replica health, single scheduler leader, and nginx upstream before rollout preflight."
elif [[ "$s4f4_wrapper_present" != "YES" || "$metric_code_present" != "YES" ]]; then
  prereq=DEPLOY_REQUIRED
  blockers="production_sha_behind_main_missing_s4f4_assets"
  next_action="Deploy main ${CURRENT_MAIN_SHA} via standard VPS release (vps-deploy-release); re-run S4F-5 preflight; then config-only S4F-4 wrapper."
elif [[ "$redis_reachable" != "YES" || "$s4_flags_safe" != "YES" || "$s4_runtime_active" != "NO" ]]; then
  prereq=BLOCKED
  blockers="redis_or_s4_safety"
  next_action="Resolve Redis reachability and S4 dormancy before config rollout."
else
  prereq=CONFIG_ONLY_ROLLOUT_READY
  blockers=""
  next_action="Optional: run di-v0-s4f-enable-global-budget-production.sh with DI_S4_REQUIRED_GIT_SHA and operator ACK (separate authorization)."
fi

echo "EXP021_S4F5_PRODUCTION_PREFLIGHT=1"
echo "EXP021_S4F5_PRODUCTION_PREFLIGHT_RESULT="
echo "CURRENT_MAIN_SHA=${CURRENT_MAIN_SHA}"
echo "PRODUCTION_SHA=${prod_sha}"
echo "PRODUCTION_RELEASE_ID=${release_id}"
echo "REPLICA_A_SHA=${prod_sha}"
echo "REPLICA_B_SHA=${prod_sha}"
echo "PRODUCTION_REPLICA_SHA_MATCH=${replica_match}"
echo "REPLICA_A_HEALTH=${health_a}"
echo "REPLICA_B_HEALTH=${health_b}"
echo "SCHEDULER_SINGLE_LEADER=${scheduler_single}"
echo "NGINX_DUAL_UPSTREAM=${nginx_dual}"
echo "PRODUCTION_CONTAINS_PR1863=${contains_pr1863}"
echo "S4F4_WRAPPER_PRESENT_IN_PRODUCTION_RELEASE=${s4f4_wrapper_present}"
echo "GLOBAL_BUDGET_RUNTIME_METRIC_CODE_PRESENT=${metric_code_present}"
echo "GLOBAL_BUDGET_CONFIG_FILE_STATE=${config_state}"
echo "REPLICA_A_GLOBAL_BUDGET_RUNTIME=${runtime_a}"
echo "REPLICA_B_GLOBAL_BUDGET_RUNTIME=${runtime_b}"
echo "GLOBAL_BUDGET_ACTIVE_RUNTIME_STATE=${active_runtime}"
echo "PROVIDER_GLOBAL_BUDGET_ENABLED_GATE_CURRENT=${provider_gate}"
echo "REDIS_REACHABLE=${redis_reachable}"
echo "S4_FLAGS_SAFE=${s4_flags_safe}"
echo "S4_RUNTIME_ACTIVE=${s4_runtime_active}"
echo "SHADOW_ACTIVATION_OCCURRED=${shadow_activation}"
echo "PRODUCTION_ENV_MUTATED=NO"
echo "PRODUCTION_RESTART_OCCURRED=NO"
echo "DEPLOY_OCCURRED=NO"
echo "PROVIDER_PRODUCTION_CALL_COUNT=0"
echo "EXPLICIT_OPERATOR_AUTHORIZATION_GATE=UNKNOWN"
echo "TINY_ACTIVATION_READY=NO"
echo "PRODUCTION_ROLLOUT_PREREQUISITE=${prereq}"
echo "BLOCKERS=${blockers}"
echo "NEXT_ACTION=${next_action}"
