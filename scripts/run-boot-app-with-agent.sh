#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./scripts/run-boot-app-with-agent.sh /path/to/app.jar [options] [-- <extra spring args>]

Options:
  --backend-url URL      Collector base URL or ingest URL. Default: http://127.0.0.1:9000
  --service-name NAME    Logical service name shown in DevTrace. Default: jar filename
  --app-packages LIST    Comma-separated package prefixes to treat as application code
  --agent-jar PATH       Override the Java agent jar path
  --server-port PORT     Convenience flag that appends --server.port=PORT
  --api-key KEY          API key for authenticating with the collector
  -h, --help             Show this help

Examples:
  ./scripts/run-boot-app-with-agent.sh ~/apps/orders.jar --service-name orders-api --app-packages com.acme.orders
  ./scripts/run-boot-app-with-agent.sh ~/apps/orders.jar --server-port 18081 -- --spring.profiles.active=dev
EOF
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
backend_url="${DEVTRACE_BACKEND_URL:-http://127.0.0.1:9000}"
service_name=""
app_packages=""
agent_jar=""
api_key="${DEVTRACE_API_KEY:-}"
server_port=""
app_jar=""
extra_args=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend-url)
      backend_url="${2:-}"
      shift 2
      ;;
    --service-name)
      service_name="${2:-}"
      shift 2
      ;;
    --app-packages)
      app_packages="${2:-}"
      shift 2
      ;;
    --agent-jar)
      agent_jar="${2:-}"
      shift 2
      ;;
    --api-key)
      api_key="${2:-}"
      shift 2
      ;;
    --server-port)
      server_port="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      extra_args+=("$@")
      break
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
    *)
      if [[ -z "$app_jar" ]]; then
        app_jar="$1"
      else
        extra_args+=("$1")
      fi
      shift
      ;;
  esac
done

if [[ -z "$app_jar" ]]; then
  echo "Missing Spring Boot jar path." >&2
  usage
  exit 1
fi

if [[ ! -f "$app_jar" ]]; then
  echo "Application jar not found: $app_jar" >&2
  exit 1
fi

if [[ -z "$agent_jar" ]]; then
  agent_jar="$(find "$repo_root/java-agent/target" -maxdepth 1 -type f -name 'java-agent-*.jar' ! -name '*sources.jar' ! -name '*javadoc.jar' | sort | head -n 1)"
fi

if [[ -z "$agent_jar" || ! -f "$agent_jar" ]]; then
  echo "DevTrace agent jar not found. Build the repo first with: mvn -DskipTests package" >&2
  exit 1
fi

if [[ -z "$service_name" ]]; then
  service_name="$(basename "$app_jar" .jar)"
fi

if [[ -n "$server_port" ]]; then
  extra_args+=("--server.port=${server_port}")
fi

agent_args=(
  "backendUrl=${backend_url}"
  "serviceName=${service_name}"
)

if [[ -n "$app_packages" ]]; then
  agent_args+=("appPackages=${app_packages}")
fi

if [[ -n "$api_key" ]]; then
  agent_args+=("apiKey=${api_key}")
fi

if [[ -n "${DEVTRACE_OTLP_ENDPOINT:-}" ]]; then
  agent_args+=("otlpEndpoint=${DEVTRACE_OTLP_ENDPOINT}")
fi

if [[ -n "${DEVTRACE_INSTANCE_ID:-}" ]]; then
  agent_args+=("instanceId=${DEVTRACE_INSTANCE_ID}")
fi

if [[ -n "${DEVTRACE_RUNTIME_HOOKS_ENABLED:-}" ]]; then
  agent_args+=("runtimeHooksEnabled=${DEVTRACE_RUNTIME_HOOKS_ENABLED}")
fi

joined_agent_args="$(IFS=';'; echo "${agent_args[*]}")"

command=(
  java
  "-javaagent:${agent_jar}=${joined_agent_args}"
  "-Ddevtrace.backend-url=${backend_url}"
  "-Ddevtrace.service-name=${service_name}"
  -jar
  "$app_jar"
)

if [[ ${#extra_args[@]} -gt 0 ]]; then
  command+=("${extra_args[@]}")
fi

echo "Launching ${service_name} with DevTrace"
echo "  app jar:    ${app_jar}"
echo "  agent jar:  ${agent_jar}"
echo "  backend:    ${backend_url}"
if [[ -n "$app_packages" ]]; then
  echo "  app code:   ${app_packages}"
fi
if [[ ${#extra_args[@]} -gt 0 ]]; then
  echo "  app args:   ${extra_args[*]}"
fi

exec "${command[@]}"
