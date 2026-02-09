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

BROKER_CONFIG_HOME="${XDG_CONFIG_HOME:-${HOME}/.config}/broker"
BROKER_CONFIG_JSON="${BROKER_CONFIG_JSON:-${BROKER_CONFIG_HOME}/config.json}"
BROKER_STATE_HOME="${XDG_STATE_HOME:-${HOME}/.local/state}/broker"
BROKER_DATA_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}/broker"
BROKER_SOURCE_DIR="${BROKER_SOURCE_DIR:-${BROKER_DATA_HOME}/source}"
BROKER_REPO="${BROKER_REPO:-https://github.com/brycedbjork/northbrook.git}"
ORIG_ARGS=("$@")
ORIG_ARGC=$#

export PATH="/opt/homebrew/bin:/usr/local/bin:/home/linuxbrew/.linuxbrew/bin:${PATH}"

PYTHON_VERSION="${PYTHON_VERSION:-3.12}"
INSTALL_IB_APP="${BROKER_INSTALL_IB_APP:-1}"
IB_CHANNEL="${BROKER_IB_CHANNEL:-stable}"
IB_INSTALL_DIR="${BROKER_IB_INSTALL_DIR:-/Applications/IB Gateway}"
IBC_RELEASE_TAG="${BROKER_IBC_RELEASE_TAG:-latest}"
IBC_INSTALL_DIR="${BROKER_IBC_INSTALL_DIR:-${BROKER_DATA_HOME}/ibc}"
BROKER_BIN_DIR="${BROKER_BIN_DIR:-${HOME}/.local/bin}"
LOG_DIR="$(mktemp -d /tmp/broker-install.XXXXXX)"
STEP_INDEX=0
STEP_TOTAL=9
INTERACTIVE=0
SKIP_ONBOARDING=0
ONBOARDING_ONLY=0

export BROKER_CONFIG_HOME BROKER_CONFIG_JSON BROKER_STATE_HOME BROKER_DATA_HOME
export BROKER_SOURCE_DIR BROKER_REPO IBC_RELEASE_TAG IBC_INSTALL_DIR
export BROKER_RUNTIME_PID_FILE="${BROKER_STATE_HOME}/broker-daemon.pid"
export BROKER_RUNTIME_SOCKET_PATH="${BROKER_STATE_HOME}/broker.sock"
export BROKER_LOGGING_AUDIT_DB="${BROKER_STATE_HOME}/audit.db"
export BROKER_LOGGING_LOG_FILE="${BROKER_STATE_HOME}/broker.log"
export BROKER_IBC_PATH="${IBC_INSTALL_DIR}"
export BROKER_IBC_INI="${BROKER_IBC_PATH}/config.ini"
export BROKER_IBC_LOG_FILE="${BROKER_STATE_HOME}/logs/ibc-launch.log"
export BROKER_IB_SETTINGS_DIR="${BROKER_STATE_HOME}/ib-settings"

for arg in "$@"; do
  case "${arg}" in
    --skip-onboarding)
      SKIP_ONBOARDING=1
      ;;
    --onboarding-only)
      ONBOARDING_ONLY=1
      ;;
  esac
done

if [[ "${SKIP_ONBOARDING}" -eq 0 ]]; then
  STEP_TOTAL=$((STEP_TOTAL + 1))
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

if [[ ! -d "${ROOT_DIR}/daemon" || ! -d "${ROOT_DIR}/cli" || ! -d "${ROOT_DIR}/sdk" ]]; then
  ensure_source_checkout
fi

if [[ "${ONBOARDING_ONLY}" -eq 1 ]]; then
  STEP_INDEX=0
  STEP_TOTAL=3
  banner
  run_step "Preparing broker directories" prepare_broker_home
  run_step "Creating broker config (${BROKER_CONFIG_JSON})" ensure_broker_config
  run_step_interactive "Interactive Brokers credential setup" run_onboarding_wizard
  rm -rf "${LOG_DIR}"
  print_summary
  exit 0
fi

banner
run_step "Preparing broker config/state/data directories" prepare_broker_home
run_step "Bootstrapping system tooling (Homebrew, uv)" bootstrap_tooling
run_step "Creating broker config (${BROKER_CONFIG_JSON})" ensure_broker_config
run_step "Interactive Brokers Gateway setup" install_ib_app
run_step "Installing IBC automation package" install_ibc
run_step "Creating Python runtime" create_python_runtime
run_step "Installing broker Python packages" install_python_packages
run_step "Binding broker CLI command" bind_broker_command
if [[ "${SKIP_ONBOARDING}" -eq 0 ]]; then
  run_step_interactive "Interactive Brokers credential setup" run_onboarding_wizard
fi
run_step "Opening Interactive Brokers Gateway app" launch_ib_gateway_app

rm -rf "${LOG_DIR}"
print_summary
