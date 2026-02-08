# shellcheck shell=bash

create_python_runtime() {
  cd "${BROKER_DIR}"
  uv venv --python "${PYTHON_VERSION}" --seed --allow-existing
}

install_python_packages() {
  cd "${BROKER_DIR}"
  .venv/bin/python -m pip install -e './daemon[dev]' -e './sdk/python[dev]' -e './cli[dev]'
  if command -v direnv >/dev/null 2>&1; then
    direnv allow "${BROKER_DIR}" >/dev/null 2>&1 || true
  fi
}

install_typescript_packages() {
  (
    cd "${BROKER_DIR}/sdk/typescript"
    bun install
  )
  (
    cd "${ROOT_DIR}/agents"
    bun install
  )
  (
    cd "${ROOT_DIR}/terminal"
    bun install
  )
}

install_pi_cli() {
  if command -v pi >/dev/null 2>&1; then
    local existing_pi
    existing_pi="$(command -v pi)"
    if [[ "${existing_pi}" == "${NB_BIN_DIR}/pi" ]]; then
      return 0
    fi
    mkdir -p "${NB_BIN_DIR}"
    ln -sfn "${existing_pi}" "${NB_BIN_DIR}/pi"
    return 0
  fi

  local package="${PI_NPM_PACKAGE:-@mariozechner/pi-coding-agent}"

  if command -v bun >/dev/null 2>&1; then
    bun install -g "${package}"
  elif command -v npm >/dev/null 2>&1; then
    npm install -g "${package}"
  else
    fail "Cannot install pi CLI: neither bun nor npm is available."
  fi

  local resolved_pi=""
  if command -v pi >/dev/null 2>&1; then
    resolved_pi="$(command -v pi)"
  elif [[ -x "${HOME}/.bun/bin/pi" ]]; then
    resolved_pi="${HOME}/.bun/bin/pi"
  elif command -v npm >/dev/null 2>&1; then
    local npm_prefix=""
    npm_prefix="$(npm config get prefix 2>/dev/null || true)"
    if [[ -n "${npm_prefix}" && -x "${npm_prefix}/bin/pi" ]]; then
      resolved_pi="${npm_prefix}/bin/pi"
    fi
  fi

  if [[ -z "${resolved_pi}" ]]; then
    fail "pi CLI install completed but 'pi' is still missing. Set NORTHBROOK_PI_BIN to the executable path."
  fi

  mkdir -p "${NB_BIN_DIR}"
  ln -sfn "${resolved_pi}" "${NB_BIN_DIR}/pi"
}

run_python_tests() {
  cd "${BROKER_DIR}"
  .venv/bin/python -m pytest daemon/tests cli/tests sdk/python/tests -q
}

run_typescript_typechecks() {
  (
    cd "${BROKER_DIR}/sdk/typescript"
    bun run typecheck
  )
  (
    cd "${ROOT_DIR}/agents"
    bun run typecheck
  )
  (
    cd "${ROOT_DIR}/terminal"
    bun run typecheck
  )
}
