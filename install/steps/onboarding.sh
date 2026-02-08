# shellcheck shell=bash

run_onboarding_wizard() {
  if ! command -v bun >/dev/null 2>&1; then
    fail "bun is required for onboarding."
  fi
  if [[ ! -f "${ROOT_DIR}/terminal/wizard/main.tsx" ]]; then
    fail "terminal onboarding wizard not found at ${ROOT_DIR}/terminal/wizard/main.tsx"
  fi

  (
    cd "${ROOT_DIR}/terminal"
    bun run wizard -- --config "${NORTHBROOK_CONFIG_JSON}"
  )
}

start_services_after_onboarding() {
  if [[ ! -x "${ROOT_DIR}/broker/start.sh" ]]; then
    fail "broker/start.sh not found or not executable at ${ROOT_DIR}/broker/start.sh"
  fi
  if [[ ! -x "${ROOT_DIR}/agents/daemon/start.sh" ]]; then
    fail "agents/daemon/start.sh not found or not executable at ${ROOT_DIR}/agents/daemon/start.sh"
  fi

  load_northbrook_secrets

  local broker_args=()
  broker_args+=("$(default_daemon_mode_arg)")

  local broker_log
  broker_log="$(mktemp /tmp/northbrook-onboarding-broker.XXXXXX.log)"
  if ! run_broker_start "${broker_args[@]}" >"${broker_log}" 2>&1; then
    echo "Failed to start broker daemon after onboarding." >&2
    tail -n 40 "${broker_log}" >&2 || true
    rm -f "${broker_log}"
    return 1
  fi
  rm -f "${broker_log}"

  local agents_log
  agents_log="$(mktemp /tmp/northbrook-onboarding-agents.XXXXXX.log)"
  if ! run_agents_start >"${agents_log}" 2>&1; then
    echo "Failed to start agents daemon after onboarding." >&2
    tail -n 40 "${agents_log}" >&2 || true
    rm -f "${agents_log}"
    return 1
  fi
  rm -f "${agents_log}"

  return 0
}
