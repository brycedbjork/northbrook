# shellcheck shell=bash

ensure_source_checkout() {
  if [[ -d "${ROOT_DIR}/daemon" && -d "${ROOT_DIR}/cli" && -d "${ROOT_DIR}/sdk" ]]; then
    return 0
  fi

  if ! command -v git >/dev/null 2>&1; then
    ensure_homebrew
    ensure_brew_package "git"
  fi
  if ! command -v git >/dev/null 2>&1; then
    fail "git is required for bootstrap installs but could not be installed."
  fi

  mkdir -p "$(dirname "${BROKER_SOURCE_DIR}")"

  if [[ -d "${BROKER_SOURCE_DIR}/.git" ]]; then
    git -C "${BROKER_SOURCE_DIR}" fetch --depth=1 origin main || true
    git -C "${BROKER_SOURCE_DIR}" reset --hard origin/main || true
  else
    rm -rf "${BROKER_SOURCE_DIR}"
    git clone --depth=1 --filter=blob:none --sparse "${BROKER_REPO}" "${BROKER_SOURCE_DIR}"
    git -C "${BROKER_SOURCE_DIR}" sparse-checkout set --no-cone '/*' '!website/'
  fi

  if [[ "${ORIG_ARGC:-0}" -gt 0 ]]; then
    exec "${BROKER_SOURCE_DIR}/install/main.sh" "${ORIG_ARGS[@]}"
  fi
  exec "${BROKER_SOURCE_DIR}/install/main.sh"
}

ensure_homebrew() {
  if command -v brew >/dev/null 2>&1; then
    return 0
  fi

  if ! command -v curl >/dev/null 2>&1; then
    fail "curl is required to install Homebrew."
  fi

  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  if [[ -x "/opt/homebrew/bin/brew" ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x "/usr/local/bin/brew" ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  elif [[ -x "/home/linuxbrew/.linuxbrew/bin/brew" ]]; then
    eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
  fi

  if ! command -v brew >/dev/null 2>&1; then
    fail "Homebrew installation finished but 'brew' is still not on PATH."
  fi
}

ensure_brew_package() {
  local pkg="$1"
  if brew list --versions "${pkg}" >/dev/null 2>&1; then
    return 0
  fi
  brew install "${pkg}"
}

bootstrap_tooling() {
  ensure_homebrew
  ensure_brew_package "git"
  ensure_brew_package "uv"
}
