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
  rm -f "${broker_path}"
  cat >"${broker_path}" <<EOF
#!/usr/bin/env bash
set -euo pipefail

BROKER_ROOT="${ROOT_DIR}"
BROKER_CLI="\${BROKER_ROOT}/.venv/bin/broker"

if [[ \$# -ge 2 && "\$1" == "daemon" && "\$2" == "start" ]]; then
  shift 2
  exec "\${BROKER_ROOT}/start.sh" "\$@"
fi

exec "\${BROKER_CLI}" "\$@"
EOF
  chmod +x "${broker_path}"

  local resolved=""
  resolved="$(command -v broker || true)"
  if [[ "${resolved}" == "${broker_path}" ]]; then
    return 0
  fi
  if [[ -n "${resolved}" ]]; then
    warn "Another 'broker' command exists at ${resolved}; installed this project's wrapper at ${broker_path}."
    return 0
  fi

  if [[ ":${PATH}:" == *":${BROKER_BIN_DIR}:"* ]]; then
    return 0
  fi

  local global_bin="/usr/local/bin"
  local global_path="${global_bin}/broker"
  if mkdir -p "${global_bin}" 2>/dev/null && ln -sfn "${broker_path}" "${global_path}" 2>/dev/null; then
    return 0
  fi

  if command -v sudo >/dev/null 2>&1 && [[ -t 0 && -t 1 ]]; then
    printf '%s\n' "The install wrapper was created at ${broker_path}, but ${BROKER_BIN_DIR} is not on PATH."
    printf '%s\n' "Creating a symlink at ${global_path} so 'broker' works immediately."
    if sudo -p "Broker installer needs admin access to link ${global_path}. Password: " mkdir -p "${global_bin}" && \
      sudo -p "Broker installer needs admin access to link ${global_path}. Password: " ln -sfn "${broker_path}" "${global_path}"; then
      return 0
    fi
  fi

  warn "Installed broker wrapper at ${broker_path}, but 'broker' is not on PATH. Add ${BROKER_BIN_DIR} to PATH or run ${broker_path}."
}
