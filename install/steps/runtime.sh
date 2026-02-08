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
