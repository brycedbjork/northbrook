# shellcheck shell=bash

print_summary() {
  cat <<SUMMARY

${BOLD}${GREEN}Northbrook install complete.${RESET}

${BOLD}Paths${RESET}
- Config/workspace home: ${NORTHBROOK_HOME}
- Secrets config: ${NORTHBROOK_CONFIG_JSON}
- Workspace repo: ${NORTHBROOK_WORKSPACE}
- Runtime state: ${NORTHBROOK_STATE_HOME}
- Local runtime data: ${NORTHBROOK_DATA_HOME}

${BOLD}Platform overview${RESET}
- terminal: human command center for portfolio, risk, agents, and events
- broker: execution layer with risk controls, audit trail, and daemon runtime
- agents: background runtime for agent services (heartbeats/scheduler stubs + scheduled jobs)
- workspace: your instance-specific git repo for files like risk.json

${BOLD}Quickstart${RESET}
Next step: ${BOLD}nb${RESET}
1. Launch terminal + daemon: ${BOLD}nb${RESET}
2. Broker + agents daemons keep running in background; check with: ${BOLD}nb status${RESET}
3. Service controls: ${BOLD}nb start${RESET} / ${BOLD}nb stop${RESET} / ${BOLD}nb restart${RESET}
4. Scheduled jobs skill: ${BOLD}${ROOT_DIR}/agents/skills/scheduled-jobs/jobs.sh --help${RESET}
5. Rerun onboarding anytime: ${BOLD}nb setup${RESET}
6. Workspace repo for instance files: ${BOLD}${NORTHBROOK_WORKSPACE}${RESET}

${DIM}Tip: if 'nb' is not found, add ${NB_BIN_DIR} to PATH and reopen your shell.${RESET}
SUMMARY
}
