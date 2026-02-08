# shellcheck shell=bash

banner() {
  cat <<BANNER
${BOLD}${BLUE}========================================${RESET}
${BOLD}${BLUE}  Northbrook Platform Installer${RESET}
${BOLD}${BLUE}========================================${RESET}
BANNER
}

success() {
  printf "${GREEN}%s${RESET}\n" "$1"
}

warn() {
  printf "${YELLOW}%s${RESET}\n" "$1"
}

fail() {
  printf "${RED}%s${RESET}\n" "$1" >&2
  exit 1
}

run_step() {
  local label="$1"
  shift
  STEP_INDEX=$((STEP_INDEX + 1))

  local prefix
  prefix=$(printf "[%d/%d]" "${STEP_INDEX}" "${STEP_TOTAL}")
  local log_file="${LOG_DIR}/step-${STEP_INDEX}.log"

  if [[ "${INTERACTIVE}" -eq 1 ]]; then
    local frames=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
    local frame_index=0
    "$@" >"${log_file}" 2>&1 &
    local pid=$!

    while kill -0 "${pid}" >/dev/null 2>&1; do
      printf "\r  ${DIM}%s${RESET} ${BLUE}%s${RESET} %s" \
        "${prefix}" "${frames[frame_index]}" "${label}"
      frame_index=$(((frame_index + 1) % ${#frames[@]}))
      sleep 0.1
    done

    local rc
    if wait "${pid}"; then
      rc=0
    else
      rc=$?
    fi

    if [[ "${rc}" -eq 0 ]]; then
      printf "\r  ${DIM}%s${RESET} ${GREEN}✔${RESET} %s\n" "${prefix}" "${label}"
      rm -f "${log_file}"
      return 0
    fi

    printf "\r  ${DIM}%s${RESET} ${RED}✖${RESET} %s\n" "${prefix}" "${label}" >&2
    printf "    ${RED}Step failed.${RESET} Log: %s\n" "${log_file}" >&2
    tail -n 40 "${log_file}" >&2 || true
    return "${rc}"
  fi

  printf "${BOLD}%s${RESET} %s\n" "${prefix}" "${label}"
  if "$@" >"${log_file}" 2>&1; then
    success "  ${label}"
    rm -f "${log_file}"
    return 0
  fi

  printf "${RED}Step failed.${RESET} Log: %s\n" "${log_file}" >&2
  tail -n 40 "${log_file}" >&2 || true
  return 1
}
