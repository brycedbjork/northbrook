# shellcheck shell=bash

print_summary() {
  cat <<SUMMARY

${BOLD}${GREEN}Broker Install Complete${RESET}

Config: ${BROKER_CONFIG_JSON}
Runtime state: ${BROKER_STATE_HOME}
Runtime data: ${BROKER_DATA_HOME}

Try:
  ${BOLD}broker --help${RESET}
  ${BOLD}broker daemon start --paper${RESET}
  ${BOLD}broker daemon status${RESET}
SUMMARY
}
