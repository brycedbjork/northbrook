#!/usr/bin/env bash
set -euo pipefail

SCRIPT_SOURCE="${BASH_SOURCE[0]}"
while [[ -L "${SCRIPT_SOURCE}" ]]; do
  SCRIPT_DIR="$(cd -P "$(dirname "${SCRIPT_SOURCE}")" && pwd)"
  SCRIPT_SOURCE="$(readlink "${SCRIPT_SOURCE}")"
  if [[ "${SCRIPT_SOURCE}" != /* ]]; then
    SCRIPT_SOURCE="${SCRIPT_DIR}/${SCRIPT_SOURCE}"
  fi
done
INSTALL_DIR="$(cd -P "$(dirname "${SCRIPT_SOURCE}")" && pwd)"
ROOT_DIR="$(cd -P "${INSTALL_DIR}/.." && pwd)"

NORTHBROOK_HOME="${NORTHBROOK_HOME:-${HOME}/.northbrook}"
NORTHBROOK_CONFIG_JSON="${NORTHBROOK_CONFIG_JSON:-${NORTHBROOK_HOME}/northbrook.json}"
NORTHBROOK_WORKSPACE="${NORTHBROOK_WORKSPACE:-${NORTHBROOK_HOME}/workspace}"
NORTHBROOK_STATE_HOME="${XDG_STATE_HOME:-${HOME}/.local/state}/northbrook"
NORTHBROOK_DATA_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}/northbrook"
NORTHBROOK_SOURCE_DIR="${NORTHBROOK_SOURCE_DIR:-${NORTHBROOK_DATA_HOME}/source}"
NORTHBROOK_REPO="${NORTHBROOK_REPO:-https://github.com/brycedbjork/northbrook.git}"
ORIG_ARGS=("$@")

export PATH="/opt/homebrew/bin:/usr/local/bin:/home/linuxbrew/.linuxbrew/bin:${HOME}/.bun/bin:${PATH}"

BROKER_DIR="${ROOT_DIR}/broker"
PYTHON_VERSION="${PYTHON_VERSION:-3.12}"
INSTALL_IB_APP="${BROKER_INSTALL_IB_APP:-1}"
IB_CHANNEL="${BROKER_IB_CHANNEL:-stable}"
IB_INSTALL_DIR="${BROKER_IB_INSTALL_DIR:-${HOME}/Applications/IB Gateway}"
IBC_RELEASE_TAG="${BROKER_IBC_RELEASE_TAG:-latest}"
IBC_INSTALL_DIR="${BROKER_IBC_INSTALL_DIR:-${NORTHBROOK_DATA_HOME}/ibc}"
NB_BIN_DIR="${NB_BIN_DIR:-${HOME}/.local/bin}"
PI_NPM_PACKAGE="${PI_NPM_PACKAGE:-@mariozechner/pi-coding-agent}"
LOG_DIR="$(mktemp -d /tmp/northbrook-install.XXXXXX)"
STEP_INDEX=0
STEP_TOTAL=13
INTERACTIVE=0
SKIP_ONBOARDING=0
ONBOARDING_ONLY=0
ONBOARDING_INTERACTIVE=0

export NORTHBROOK_HOME NORTHBROOK_CONFIG_JSON NORTHBROOK_WORKSPACE NORTHBROOK_STATE_HOME NORTHBROOK_DATA_HOME
export NORTHBROOK_SOURCE_DIR NORTHBROOK_REPO IBC_RELEASE_TAG IBC_INSTALL_DIR
export NORTHBROOK_AGENTS_HOME="${NORTHBROOK_STATE_HOME}/agents"
export NORTHBROOK_AGENTS_PID_FILE="${NORTHBROOK_AGENTS_HOME}/agents-daemon.pid"
export NORTHBROOK_AGENTS_STATUS_FILE="${NORTHBROOK_AGENTS_HOME}/agents-daemon.status.json"
export NORTHBROOK_AGENTS_LOG_FILE="${NORTHBROOK_AGENTS_HOME}/agents-daemon.log"
export NORTHBROOK_AGENTS_EXECUTIONS_LOG_FILE="${NORTHBROOK_AGENTS_HOME}/scheduled-job-executions.jsonl"
export BROKER_RUNTIME_PID_FILE="${NORTHBROOK_STATE_HOME}/broker-daemon.pid"
export BROKER_RUNTIME_SOCKET_PATH="${NORTHBROOK_STATE_HOME}/broker.sock"
export BROKER_LOGGING_AUDIT_DB="${NORTHBROOK_STATE_HOME}/audit.db"
export BROKER_LOGGING_LOG_FILE="${NORTHBROOK_STATE_HOME}/broker.log"
export BROKER_IBC_PATH="${IBC_INSTALL_DIR}"
export BROKER_IBC_INI="${BROKER_IBC_PATH}/config.ini"
export BROKER_IBC_LOG_FILE="${NORTHBROOK_STATE_HOME}/logs/ibc-launch.log"
export BROKER_IB_SETTINGS_DIR="${NORTHBROOK_STATE_HOME}/ib-settings"

if [[ -t 0 && -t 1 ]]; then
  ONBOARDING_INTERACTIVE=1
fi

for arg in "${ORIG_ARGS[@]}"; do
  case "${arg}" in
    --skip-onboarding)
      SKIP_ONBOARDING=1
      ;;
    --onboarding-only)
      ONBOARDING_ONLY=1
      ;;
  esac
done

if [[ "${SKIP_ONBOARDING}" -eq 0 && "${ONBOARDING_INTERACTIVE}" -eq 1 ]]; then
  STEP_TOTAL=14
fi

if [[ -t 1 ]]; then
  INTERACTIVE=1
  BOLD="$(printf '\033[1m')"
  DIM="$(printf '\033[2m')"
  BLUE="$(printf '\033[34m')"
  GREEN="$(printf '\033[32m')"
  YELLOW="$(printf '\033[33m')"
  RED="$(printf '\033[31m')"
  RESET="$(printf '\033[0m')"
else
  BOLD=""
  DIM=""
  BLUE=""
  GREEN=""
  YELLOW=""
  RED=""
  RESET=""
fi

INSTALL_STEPS_DIR="${ROOT_DIR}/install/steps"
source "${INSTALL_STEPS_DIR}/output.sh"
source "${INSTALL_STEPS_DIR}/secrets.sh"
source "${INSTALL_STEPS_DIR}/bootstrap.sh"
source "${INSTALL_STEPS_DIR}/workspace.sh"
source "${INSTALL_STEPS_DIR}/onboarding.sh"
source "${INSTALL_STEPS_DIR}/broker.sh"
source "${INSTALL_STEPS_DIR}/runtime.sh"
source "${INSTALL_STEPS_DIR}/summary.sh"

if [[ ! -d "${BROKER_DIR}" ]]; then
  ensure_source_checkout
fi

if [[ "${ONBOARDING_ONLY}" -eq 1 ]]; then
  banner
  prepare_northbrook_home
  ensure_northbrook_secrets_config
  run_onboarding_wizard
  if [[ "${ONBOARDING_INTERACTIVE}" -eq 1 ]]; then
    echo
    echo "Starting background services..."
    start_services_after_onboarding
  fi
  rm -rf "${LOG_DIR}"
  exit 0
fi

banner
run_step "Preparing Northbrook config/workspace + runtime directories" prepare_northbrook_home
run_step "Bootstrapping system tooling (Homebrew, uv, bun)" bootstrap_tooling
run_step "Initializing workspace git repository" init_workspace_repo
run_step "Creating secrets config (${NORTHBROOK_CONFIG_JSON})" ensure_northbrook_secrets_config
run_step "Interactive Brokers Gateway setup" install_ib_app
run_step "Installing IBC automation package" install_ibc
run_step "Creating Python runtime" create_python_runtime
run_step "Installing Python packages" install_python_packages
run_step "Installing TypeScript packages (bun)" install_typescript_packages
run_step "Installing pi CLI" install_pi_cli
run_step "Running Python test suite" run_python_tests
run_step "Running TypeScript typechecks" run_typescript_typechecks
run_step "Finalizing CLI command binding" bind_nb_command

if [[ "${SKIP_ONBOARDING}" -eq 0 ]]; then
  run_onboarding_wizard
  if [[ "${ONBOARDING_INTERACTIVE}" -eq 1 ]]; then
    run_step "Starting background services" start_services_after_onboarding
  fi
fi

rm -rf "${LOG_DIR}"
print_summary
