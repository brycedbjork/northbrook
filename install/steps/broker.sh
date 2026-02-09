# shellcheck shell=bash

is_valid_gateway_app_bundle() {
  local app_path="$1"
  [[ -d "${app_path}" ]] || return 1
  local name
  name="$(basename "${app_path}")"
  case "${name}" in
    IB\ Gateway*.app)
      case "${name}" in
        *Installer.app|*Uninstaller.app) return 1 ;;
      esac
      return 0
      ;;
  esac
  return 1
}

resolve_app_bundle_executable() {
  local app_path="$1"
  local macos_dir="${app_path}/Contents/MacOS"
  [[ -d "${macos_dir}" ]] || return 1

  local stub="${macos_dir}/JavaApplicationStub"
  if [[ -x "${stub}" ]]; then
    printf '%s\n' "${stub}"
    return 0
  fi

  local plist_path="${app_path}/Contents/Info.plist"
  if [[ -f "${plist_path}" && -x "/usr/libexec/PlistBuddy" ]]; then
    local bundle_executable=""
    bundle_executable="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "${plist_path}" 2>/dev/null || true)"
    if [[ -n "${bundle_executable}" && -x "${macos_dir}/${bundle_executable}" ]]; then
      printf '%s\n' "${macos_dir}/${bundle_executable}"
      return 0
    fi
  fi

  local candidate=""
  for candidate in "${macos_dir}"/*; do
    if [[ -f "${candidate}" && -x "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  return 1
}

find_ib_gateway_installer_executable() {
  local mount_point="$1"
  [[ -d "${mount_point}" ]] || return 1

  local executable=""
  if executable="$(resolve_app_bundle_executable "${mount_point}/IB Gateway Installer.app")"; then
    printf '%s\n' "${executable}"
    return 0
  fi

  local app_path=""
  local app_name=""
  while IFS= read -r -d '' app_path; do
    app_name="$(basename "${app_path}")"
    case "${app_name}" in
      *Uninstaller.app)
        continue
        ;;
      *Installer.app|Install*.app|*IB*Gateway*.app)
        if executable="$(resolve_app_bundle_executable "${app_path}")"; then
          printf '%s\n' "${executable}"
          return 0
        fi
        ;;
    esac
  done < <(find "${mount_point}" -maxdepth 3 -type d -name "*.app" -print0 2>/dev/null)

  return 1
}

resolve_ib_gateway_app_from_root() {
  local root="$1"
  [[ -d "${root}" ]] || return 1

  local install_prop="${root}/.install4j/install.prop"
  if [[ -f "${install_prop}" ]]; then
    local launcher0=""
    launcher0="$(sed -n 's/^launcher0=//p' "${install_prop}" | head -n 1)"
    if [[ -n "${launcher0}" ]]; then
      local app_path="${launcher0%/Contents/MacOS/JavaApplicationStub}"
      if is_valid_gateway_app_bundle "${app_path}"; then
        printf '%s\n' "${app_path}"
        return 0
      fi
    fi
  fi

  local response_varfile="${root}/.install4j/response.varfile"
  if [[ -f "${response_varfile}" ]]; then
    local exe_name=""
    exe_name="$(sed -n 's/^exeName=//p' "${response_varfile}" | head -n 1)"
    if [[ -n "${exe_name}" ]]; then
      local app_path="${root}/${exe_name}"
      if is_valid_gateway_app_bundle "${app_path}"; then
        printf '%s\n' "${app_path}"
        return 0
      fi
    fi
  fi

  local direct="${root}/IB Gateway.app"
  if is_valid_gateway_app_bundle "${direct}"; then
    printf '%s\n' "${direct}"
    return 0
  fi

  return 1
}

find_installed_ib_gateway_app() {
  local app_path=""

  for app_path in "/Applications/IB Gateway.app" "${HOME}/Applications/IB Gateway.app"; do
    if is_valid_gateway_app_bundle "${app_path}"; then
      printf '%s\n' "${app_path}"
      return 0
    fi
  done

  local root=""
  for root in \
    "${IB_INSTALL_DIR}" \
    "/Applications/IB Gateway" \
    "${HOME}/Applications/IB Gateway"; do
    if app_path="$(resolve_ib_gateway_app_from_root "${root}")"; then
      printf '%s\n' "${app_path}"
      return 0
    fi
  done

  return 1
}

find_target_ib_gateway_app() {
  local app_path=""

  if is_valid_gateway_app_bundle "${IB_INSTALL_DIR}"; then
    printf '%s\n' "${IB_INSTALL_DIR}"
    return 0
  fi

  if app_path="$(resolve_ib_gateway_app_from_root "${IB_INSTALL_DIR}")"; then
    printf '%s\n' "${app_path}"
    return 0
  fi

  local target_parent
  target_parent="$(dirname "${IB_INSTALL_DIR}")"
  local target_base
  target_base="$(basename "${IB_INSTALL_DIR}")"
  local target_bundle="${target_parent}/${target_base}.app"
  if is_valid_gateway_app_bundle "${target_bundle}"; then
    printf '%s\n' "${target_bundle}"
    return 0
  fi

  return 1
}

snapshot_desktop_entries() {
  local snapshot_file="$1"
  : >"${snapshot_file}"
  local desktop_dir="${HOME}/Desktop"
  [[ -d "${desktop_dir}" ]] || return 0

  local path=""
  while IFS= read -r -d '' path; do
    basename "${path}" >>"${snapshot_file}"
  done < <(find "${desktop_dir}" -maxdepth 1 -mindepth 1 -print0 2>/dev/null)
}

cleanup_new_ib_desktop_shortcuts() {
  local snapshot_file="$1"
  local desktop_dir="${HOME}/Desktop"
  [[ -d "${desktop_dir}" ]] || return 0
  [[ -f "${snapshot_file}" ]] || return 0

  local path=""
  local name=""
  while IFS= read -r -d '' path; do
    name="$(basename "${path}")"
    case "${name}" in
      IB\ Gateway*|Interactive\ Brokers*)
        if grep -Fxq "${name}" "${snapshot_file}"; then
          continue
        fi
        rm -rf "${path}" >/dev/null 2>&1 || true
        ;;
    esac
  done < <(find "${desktop_dir}" -maxdepth 1 -mindepth 1 -print0 2>/dev/null)
}

install_ib_app() {
  case "$(printf '%s' "${INSTALL_IB_APP}" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|on) ;;
    0|false|no|off)
      return 0
      ;;
    *)
      ;;
  esac

  if [[ "$(uname -s)" != "Darwin" ]]; then
    return 0
  fi

  local existing_app=""
  if existing_app="$(find_installed_ib_gateway_app)"; then
    if find_target_ib_gateway_app >/dev/null 2>&1; then
      return 0
    fi
    warn "IB Gateway already exists at ${existing_app}, but target is ${IB_INSTALL_DIR}; installing to target path."
  fi

  local ib_arch=""
  if [[ "$(uname -m)" == "arm64" ]]; then
    ib_arch="macos-arm"
  elif [[ "$(uname -m)" == "x86_64" ]]; then
    ib_arch="macos-x64"
  else
    fail "Unsupported macOS architecture: $(uname -m). Install IB Gateway manually."
  fi

  case "${IB_CHANNEL}" in
    stable|latest) ;;
    *) fail "Invalid BROKER_IB_CHANNEL='${IB_CHANNEL}' (expected stable|latest)." ;;
  esac

  command -v curl >/dev/null 2>&1 || fail "curl is required to download IB Gateway installer."
  command -v hdiutil >/dev/null 2>&1 || fail "hdiutil is required to mount the IB Gateway installer DMG."

  local dmg_url="https://download2.interactivebrokers.com/installers/ibgateway/${IB_CHANNEL}-standalone/ibgateway-${IB_CHANNEL}-standalone-${ib_arch}.dmg"
  local tmp_dir
  tmp_dir="$(mktemp -d /tmp/broker-ibgateway.XXXXXX)"
  local dmg_path="${tmp_dir}/ibgateway.dmg"
  local mount_point="${tmp_dir}/mnt"
  mkdir -p "${mount_point}"

  if ! curl --fail --location --retry 3 --connect-timeout 20 --output "${dmg_path}" "${dmg_url}"; then
    rm -rf "${tmp_dir}"
    fail "Failed to download IB Gateway installer from ${dmg_url}"
  fi

  if ! hdiutil attach "${dmg_path}" -mountpoint "${mount_point}" -nobrowse -quiet; then
    rm -rf "${tmp_dir}"
    fail "Failed to mount installer DMG."
  fi

  local installer_stub=""
  installer_stub="$(find_ib_gateway_installer_executable "${mount_point}" || true)"

  if [[ -z "${installer_stub}" || ! -x "${installer_stub}" ]]; then
    local discovered=""
    discovered="$(find "${mount_point}" -maxdepth 3 \( -name "*.app" -o -name "*.pkg" \) -print 2>/dev/null | sed "s|^${mount_point}/||" || true)"
    hdiutil detach "${mount_point}" -quiet || true
    rm -rf "${tmp_dir}"
    fail "Could not locate an IB Gateway installer executable in mounted DMG (${mount_point}). Found: ${discovered:-<none>}"
  fi

  local install_parent
  install_parent="$(dirname "${IB_INSTALL_DIR}")"
  local desktop_snapshot
  desktop_snapshot="$(mktemp /tmp/broker-desktop-before.XXXXXX)"
  snapshot_desktop_entries "${desktop_snapshot}"

  local -a install_cmd=(
    "${installer_stub}"
    -q
    -overwrite
    -dir "${IB_INSTALL_DIR}"
    '-VcreateDesktopLinkAction$Boolean=false'
    '-VdesktopShortcutAction$Boolean=false'
    '-VaddDesktopLauncherAction$Boolean=false'
    '-VcreateLauncherInDockAction$Boolean=false'
  )

  if mkdir -p "${install_parent}" 2>/dev/null; then
    if ! "${install_cmd[@]}"; then
      rm -f "${desktop_snapshot}"
      hdiutil detach "${mount_point}" -quiet || true
      rm -rf "${tmp_dir}"
      fail "Silent IB Gateway install failed."
    fi
  else
    if ! command -v sudo >/dev/null 2>&1; then
      rm -f "${desktop_snapshot}"
      hdiutil detach "${mount_point}" -quiet || true
      rm -rf "${tmp_dir}"
      fail "Installing IB Gateway into ${IB_INSTALL_DIR} requires admin rights, but sudo is unavailable."
    fi
    if [[ ! -t 0 || ! -t 1 ]]; then
      rm -f "${desktop_snapshot}"
      hdiutil detach "${mount_point}" -quiet || true
      rm -rf "${tmp_dir}"
      fail "Installing IB Gateway into ${IB_INSTALL_DIR} requires admin rights and an interactive terminal."
    fi

    printf '%s\n' "IB Gateway will be installed into ${IB_INSTALL_DIR}."
    printf '%s\n' "Administrator privileges are required to write into ${install_parent}."
    printf '%s\n' "macOS will now prompt for your password."

    if ! sudo -p "Broker installer needs admin access to install IB Gateway to ${install_parent}. Password: " mkdir -p "${install_parent}"; then
      rm -f "${desktop_snapshot}"
      hdiutil detach "${mount_point}" -quiet || true
      rm -rf "${tmp_dir}"
      fail "Could not create install target parent with sudo: ${install_parent}"
    fi
    if ! sudo -p "Broker installer needs admin access to install IB Gateway to ${install_parent}. Password: " "${install_cmd[@]}"; then
      rm -f "${desktop_snapshot}"
      hdiutil detach "${mount_point}" -quiet || true
      rm -rf "${tmp_dir}"
      fail "IB Gateway install with sudo failed."
    fi
  fi

  cleanup_new_ib_desktop_shortcuts "${desktop_snapshot}"
  rm -f "${desktop_snapshot}"

  hdiutil detach "${mount_point}" -quiet || true
  rm -rf "${tmp_dir}"

  if ! find_target_ib_gateway_app >/dev/null 2>&1; then
    fail "Install finished but IB Gateway app was not found under ${IB_INSTALL_DIR}. Set BROKER_IB_INSTALL_DIR and rerun."
  fi
}

install_ibc() {
  local os_name
  os_name="$(uname -s)"
  local asset_name=""
  case "${os_name}" in
    Darwin)
      asset_name="IBCMacos"
      ;;
    Linux)
      asset_name="IBCLinux"
      ;;
    *)
      return 0
      ;;
  esac

  command -v curl >/dev/null 2>&1 || fail "curl is required to download IBC."
  command -v unzip >/dev/null 2>&1 || fail "unzip is required to install IBC."
  command -v python3 >/dev/null 2>&1 || fail "python3 is required to resolve IBC release assets."

  local api_url=""
  if [[ "${IBC_RELEASE_TAG}" == "latest" ]]; then
    api_url="https://api.github.com/repos/IbcAlpha/IBC/releases/latest"
  else
    api_url="https://api.github.com/repos/IbcAlpha/IBC/releases/tags/${IBC_RELEASE_TAG}"
  fi

  local tmp_dir
  tmp_dir="$(mktemp -d /tmp/broker-ibc.XXXXXX)"
  local release_json="${tmp_dir}/release.json"
  local zip_path="${tmp_dir}/ibc.zip"

  if ! curl --fail --location --retry 3 --connect-timeout 20 --output "${release_json}" "${api_url}"; then
    rm -rf "${tmp_dir}"
    fail "Failed to resolve IBC release metadata from ${api_url}"
  fi

  local resolved_url=""
  resolved_url="$(python3 - "${release_json}" "${asset_name}" <<'PY'
import json
import sys
from pathlib import Path

release_path = Path(sys.argv[1])
asset_prefix = sys.argv[2]
payload = json.loads(release_path.read_text(encoding="utf-8"))
assets = payload.get("assets")
if not isinstance(assets, list):
    sys.exit(1)
for asset in assets:
    if not isinstance(asset, dict):
        continue
    name = asset.get("name")
    url = asset.get("browser_download_url")
    if not isinstance(name, str) or not isinstance(url, str):
        continue
    if name.startswith(asset_prefix + "-") and name.endswith(".zip"):
        print(url)
        sys.exit(0)
sys.exit(1)
PY
  )" || {
    rm -rf "${tmp_dir}"
    fail "Could not find ${asset_name} release asset for IBC (${IBC_RELEASE_TAG})."
  }

  if ! curl --fail --location --retry 3 --connect-timeout 20 --output "${zip_path}" "${resolved_url}"; then
    rm -rf "${tmp_dir}"
    fail "Failed to download IBC archive from ${resolved_url}"
  fi

  rm -rf "${IBC_INSTALL_DIR}"
  mkdir -p "${IBC_INSTALL_DIR}"
  unzip -q "${zip_path}" -d "${IBC_INSTALL_DIR}"
  chmod +x "${IBC_INSTALL_DIR}"/*.sh >/dev/null 2>&1 || true
  chmod +x "${IBC_INSTALL_DIR}/scripts"/*.sh >/dev/null 2>&1 || true

  if [[ ! -f "${IBC_INSTALL_DIR}/config.ini" ]]; then
    rm -rf "${tmp_dir}"
    fail "IBC install is missing config.ini at ${IBC_INSTALL_DIR}."
  fi
  chmod 700 "${IBC_INSTALL_DIR}"
  chmod 600 "${IBC_INSTALL_DIR}/config.ini"

  rm -rf "${tmp_dir}"
}

launch_ib_gateway_app() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    return 0
  fi

  local app_path=""
  if ! app_path="$(find_installed_ib_gateway_app)"; then
    warn "IB Gateway app is not installed in the expected locations; skipping launch."
    return 0
  fi

  local auto_login=""
  auto_login="$(read_broker_config_value "ibkrAutoLogin" | tr '[:upper:]' '[:lower:]' || true)"
  local username=""
  username="$(read_broker_config_value "ibkrUsername" || true)"
  local password=""
  password="$(read_broker_config_value "ibkrPassword" || true)"
  local mode=""
  mode="$(read_broker_config_value "ibkrGatewayMode" | tr '[:upper:]' '[:lower:]' || true)"
  if [[ "${mode}" != "paper" && "${mode}" != "live" ]]; then
    mode="paper"
  fi

  if [[ "${auto_login}" == "true" && -n "${username}" && -n "${password}" ]]; then
    launch_ib_gateway_with_ibc_autologin "${app_path}" "${mode}" "${username}" "${password}"
    return 0
  fi

  if [[ "${auto_login}" == "true" ]]; then
    warn "IBC auto login is enabled but username/password are missing; opening IB Gateway app directly."
  fi

  if ! command -v open >/dev/null 2>&1; then
    warn "macOS 'open' command is unavailable; skipping Gateway launch."
    return 0
  fi

  open -a "${app_path}" >/dev/null 2>&1 || warn "Failed to launch ${app_path}."
}

resolve_ibc_tws_major_version() {
  local app_path="$1"
  local name
  name="$(basename "${app_path}" .app)"
  if [[ "${name}" =~ ([0-9]+\.[0-9]+) ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
    return 0
  fi

  local root
  root="$(dirname "${app_path}")"
  local jar
  jar="$(find "${root}/jars" -maxdepth 1 -type f -name "twslaunch-*.jar" 2>/dev/null | head -n 1 || true)"
  if [[ "${jar}" =~ twslaunch-([0-9]{4})\.jar$ ]]; then
    local digits="${BASH_REMATCH[1]}"
    printf '%s\n' "${digits:0:2}.${digits:2:2}"
    return 0
  fi

  return 1
}

ensure_ibc_launch_ini() {
  local mode="$1"
  if [[ "${mode}" != "paper" && "${mode}" != "live" ]]; then
    mode="paper"
  fi

  if ! command -v python3 >/dev/null 2>&1; then
    fail "python3 is required to prepare IBC launch config."
  fi

  mkdir -p "$(dirname "${BROKER_IBC_INI}")"
  mkdir -p "${BROKER_IB_SETTINGS_DIR}"

  if [[ ! -f "${BROKER_IBC_INI}" && -f "${IBC_INSTALL_DIR}/config.ini" ]]; then
    cp "${IBC_INSTALL_DIR}/config.ini" "${BROKER_IBC_INI}"
  fi
  [[ -f "${BROKER_IBC_INI}" ]] || fail "IBC config not found at ${BROKER_IBC_INI}"

  python3 - "${BROKER_IBC_INI}" "${mode}" "${BROKER_IB_SETTINGS_DIR}" <<'PY'
import sys
from pathlib import Path

config_path = Path(sys.argv[1]).expanduser()
trading_mode = (sys.argv[2] or "paper").strip().lower()
ib_dir = sys.argv[3]

if trading_mode not in {"paper", "live"}:
    trading_mode = "paper"

if config_path.exists():
    lines = config_path.read_text(encoding="utf-8", errors="ignore").splitlines()
else:
    lines = []

updates = {
    "TradingMode": trading_mode,
    "AcceptNonBrokerageAccountWarning": "yes",
    "ReloginAfterSecondFactorAuthenticationTimeout": "restart",
    "IbDir": ib_dir,
}

seen = {key: False for key in updates}
out_lines = []
for line in lines:
    replaced = False
    for key, value in updates.items():
        if line.startswith(f"{key}="):
            out_lines.append(f"{key}={value}")
            seen[key] = True
            replaced = True
            break
    if not replaced:
        out_lines.append(line)

for key, value in updates.items():
    if not seen[key]:
        out_lines.append(f"{key}={value}")

config_path.write_text("\n".join(out_lines).rstrip() + "\n", encoding="utf-8")
PY
  chmod 600 "${BROKER_IBC_INI}" >/dev/null 2>&1 || true
}

launch_ib_gateway_with_ibc_autologin() {
  local app_path="$1"
  local mode="$2"
  local username="$3"
  local password="$4"

  local ibc_start="${IBC_INSTALL_DIR}/scripts/ibcstart.sh"
  [[ -x "${ibc_start}" ]] || fail "IBC launcher is missing at ${ibc_start}"

  local tws_major=""
  if ! tws_major="$(resolve_ibc_tws_major_version "${app_path}")"; then
    fail "Could not determine IB Gateway major version for IBC from ${app_path}."
  fi

  ensure_ibc_launch_ini "${mode}"

  local tws_path
  tws_path="$(dirname "${app_path}")"

  mkdir -p "$(dirname "${BROKER_IBC_LOG_FILE}")"
  nohup \
    "${ibc_start}" \
    "${tws_major}" \
    --gateway \
    "--tws-path=${tws_path}" \
    "--ibc-path=${IBC_INSTALL_DIR}" \
    "--ibc-ini=${BROKER_IBC_INI}" \
    "--mode=${mode}" \
    "--on2fatimeout=restart" \
    "--user=${username}" \
    "--pw=${password}" \
    >"${BROKER_IBC_LOG_FILE}" 2>&1 &
}
