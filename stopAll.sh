#!/usr/bin/env bash

set -euo pipefail

usage() {
    cat <<'EOF'
Usage: ./stopAll.sh [--db]

Stops and removes all non-database containers/resources. Add --db to include
the database containers (keycloakdb, opentdfdb, synapsedb, usersdb, nextcloud-db,
nextcloud-redis, redis_messaging, mongo_db) and prune persistent volumes.
EOF
}

STOP_DATABASES=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --db)
            STOP_DATABASES=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage
            exit 1
            ;;
    esac
done

is_database_container() {
    local name="$1"
    case "$name" in
        keycloakdb*|opentdfdb*|synapsedb*|usersdb*|nextcloud-db*|nextcloud_db*|nextcloud-redis*|nextcloud_redis*|redis_messaging*|mongo_db*)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

stop_targets=()
while read -r id name; do
    [[ -z "$id" ]] && continue
    if ! $STOP_DATABASES && is_database_container "$name"; then
        echo "Skipping running database container: $name"
        continue
    fi
    stop_targets+=("$id")
done < <(docker ps --format '{{.ID}} {{.Names}}')

if ((${#stop_targets[@]})); then
    echo "Stopping containers: ${stop_targets[*]}"
    docker stop "${stop_targets[@]}"
else
    echo "No containers to stop (or only database containers were running)."
fi

remove_targets=()
while read -r id name; do
    [[ -z "$id" ]] && continue
    if ! $STOP_DATABASES && is_database_container "$name"; then
        echo "Skipping database container: $name"
        continue
    fi
    remove_targets+=("$id")
done < <(docker ps -a --format '{{.ID}} {{.Names}}')

if ((${#remove_targets[@]})); then
    echo "Removing containers: ${remove_targets[*]}"
    docker rm "${remove_targets[@]}"
else
    echo "No containers to remove."
fi

if $STOP_DATABASES; then
    mapfile -t volumes < <(docker volume ls -q)
    if ((${#volumes[@]})); then
        echo "Removing volumes: ${volumes[*]}"
        docker volume rm "${volumes[@]}"
    else
        echo "No volumes to remove."
    fi
else
    echo "Skipping volume removal; use --db to remove database volumes."
fi

echo "Pruning unused networks..."
docker network prune -f >/dev/null || true
