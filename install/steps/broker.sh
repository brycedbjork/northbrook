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
    return 0
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
  if [[ -x "${mount_point}/IB Gateway Installer.app/Contents/MacOS/JavaApplicationStub" ]]; then
    installer_stub="${mount_point}/IB Gateway Installer.app/Contents/MacOS/JavaApplicationStub"
  fi

  if [[ -z "${installer_stub}" || ! -x "${installer_stub}" ]]; then
    hdiutil detach "${mount_point}" -quiet || true
    rm -rf "${tmp_dir}"
    fail "Could not locate installer at ${mount_point}/IB Gateway Installer.app/Contents/MacOS/JavaApplicationStub"
  fi

  mkdir -p "$(dirname "${IB_INSTALL_DIR}")"
  if ! "${installer_stub}" -q -overwrite -dir "${IB_INSTALL_DIR}"; then
    hdiutil detach "${mount_point}" -quiet || true
    rm -rf "${tmp_dir}"
    fail "Silent IB Gateway install failed."
  fi

  hdiutil detach "${mount_point}" -quiet || true
  rm -rf "${tmp_dir}"

  if ! find_installed_ib_gateway_app >/dev/null 2>&1; then
    fail "Install finished but IB Gateway app was not found in expected locations. Set BROKER_IB_INSTALL_DIR and rerun."
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
  tmp_dir="$(mktemp -d /tmp/northbrook-ibc.XXXXXX)"
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
