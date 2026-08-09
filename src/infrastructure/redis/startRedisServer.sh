#!/bin/bash
# startRedisServer.sh
is_db_server_up=0
is_db_installed=0;
#Reality checks

if command -v redis-server > /dev/null 2>&1 ;then
    $is_db_installed=1;
fi

# --- detect package manager (for messaging/auto-install only) ---
detect_pkg_manager() {
    if command -v dnf >/dev/null 2>&1; then
        echo "dnf install ${DB_NAME}"
    elif command -v apt >/dev/null 2>&1; then
        echo "apt install ${DB_NAME}-server"
    elif command -v pacman >/dev/null 2>&1; then
        echo "pacman -S ${DB_NAME}"
    elif command -v brew >/dev/null 2>&1; then
        echo "brew install ${DB_NAME}"
    else
        echo "<install ${DB_NAME} using your system's package manager>"
    fi
}
if command -v redis-server >/dev/null 2>&1; then
    is_db_installed=1
fi

if [0 -eq $is_db_installed]; then 
    echo "The database is not installed please allow me to install it"
    install_hint = $(detect_pkg_manager)
    echo "The DB is not installed ino your package for now , allow me to install it"
    echi "if I can't automattically, try: sudo ${install_hint}"