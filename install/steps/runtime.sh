# shellcheck shell=bash

create_python_runtime() {
  cd "${ROOT_DIR}"
  uv venv --python "${PYTHON_VERSION}" --seed --allow-existing
}

install_python_packages() {
  cd "${ROOT_DIR}"
  .venv/bin/python -m pip install -e './daemon' -e './sdk/python' -e './cli'
}

bind_broker_command() {
  local broker_cli="${ROOT_DIR}/.venv/bin/broker"
  local broker_path="${BROKER_BIN_DIR}/broker"

  [[ -x "${broker_cli}" ]] || fail "Broker CLI executable not found at ${broker_cli}"

  mkdir -p "${BROKER_BIN_DIR}"
  ln -sfn "${broker_cli}" "${broker_path}"
}
