#!/usr/bin/env bash
set -euo pipefail

BROKER_DATA_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}/broker"
BROKER_SOURCE_DIR="${BROKER_SOURCE_DIR:-${BROKER_DATA_HOME}/source}"
BROKER_REPO="${BROKER_REPO:-https://github.com/brycedbjork/northbrook.git}"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required to bootstrap broker." >&2
  echo "Install git (for example: brew install git) and rerun this command." >&2
  exit 1
fi

mkdir -p "$(dirname "${BROKER_SOURCE_DIR}")"

if [[ -d "${BROKER_SOURCE_DIR}/.git" ]]; then
  git -C "${BROKER_SOURCE_DIR}" fetch --depth=1 origin main || true
  git -C "${BROKER_SOURCE_DIR}" reset --hard origin/main || true
else
  rm -rf "${BROKER_SOURCE_DIR}"
  git clone --depth=1 "${BROKER_REPO}" "${BROKER_SOURCE_DIR}"
fi

exec "${BROKER_SOURCE_DIR}/install/main.sh" "$@"
