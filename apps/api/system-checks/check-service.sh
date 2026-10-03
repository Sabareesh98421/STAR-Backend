#!/bin/bash
# check-service.sh - verify systemd units are enabled and running, repair if not.
# usage: check-service.sh <unit> [unit...]

set -u

# root needs no sudo; dev boxes prompt; servers use a NOPASSWD rule
SUDO=""
[ "$(id -u)" -eq 0 ] || SUDO=sudo

enable_service() {
    if $SUDO systemctl enable "$1"
    then
        echo "$1 is now enabled"
        return 0
    else
        echo "$1 could not be enabled - MANUAL INTERVENTION REQUIRED."
        return 1
    fi
}

check_is_service_enabled() {
    if systemctl is-enabled --quiet "$1"
    then
        return 0
    else
        echo "$1 is not enabled, now enabling"
        if enable_service "$1"
        then
            return 0
        fi
        return 1
    fi
}

restart_service() {
    if $SUDO systemctl restart "$1"
    then
        echo "$1 restarted"
        return 0
    else
        echo "Failed to restart $1 - check it is installed and you have privilege."
        return 1
    fi
}

check_service_status() {
    if ! check_is_service_enabled "$1"
    then
        return 1
    fi
    if systemctl is-active --quiet "$1"
    then
        echo "$1 is up"
        return 0
    fi
    echo "$1 is down, repairing"
    if ! restart_service "$1"
    then
        return 1
    fi
    # a repair only counts if the unit is actually up afterwards
    if systemctl is-active --quiet "$1"
    then
        echo "$1 is up (repaired)"
        return 0
    fi
    echo "$1 still down after restart - MANUAL INTERVENTION REQUIRED."
    return 1
}

if [ $# -eq 0 ]
then
    echo "usage: $0 <unit> [unit...]" >&2
    exit 2
fi

status=0
for unit in "$@"
do
    if ! check_service_status "$unit"
    then
        status=1
    fi
done
exit $status
