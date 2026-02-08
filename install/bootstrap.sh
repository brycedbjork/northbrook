#!/usr/bin/env bash
set -euo pipefail

NORTHBROOK_DATA_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}/northbrook"
NORTHBROOK_SOURCE_DIR="${NORTHBROOK_SOURCE_DIR:-${NORTHBROOK_DATA_HOME}/source}"
NORTHBROOK_REPO="${NORTHBROOK_REPO:-https://github.com/brycedbjork/northbrook.git}"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required to bootstrap Northbrook." >&2
  echo "Install git (for example: brew install git) and rerun this command." >&2
  exit 1
fi

mkdir -p "$(dirname "${NORTHBROOK_SOURCE_DIR}")"

if [[ -d "${NORTHBROOK_SOURCE_DIR}/.git" ]]; then
  git -C "${NORTHBROOK_SOURCE_DIR}" fetch --depth=1 origin main || true
  git -C "${NORTHBROOK_SOURCE_DIR}" reset --hard origin/main || true
else
  rm -rf "${NORTHBROOK_SOURCE_DIR}"
  git clone --depth=1 "${NORTHBROOK_REPO}" "${NORTHBROOK_SOURCE_DIR}"
fi

exec "${NORTHBROOK_SOURCE_DIR}/install/main.sh" "$@"
