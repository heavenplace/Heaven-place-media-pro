#!/usr/bin/env bash
#
# Prepares a fresh Oracle Cloud Always Free VM to run docker-compose.prod.yml.
#
#   sudo ./deploy/oracle/vm-setup.sh              # do it
#   DRY_RUN=1 ./deploy/oracle/vm-setup.sh         # print what it would do, change nothing
#
# Oracle Cloud blocks this stack with two firewalls at once, which is why the app can
# answer on the VM itself and nowhere else:
#
#   - the VCN's security list, on the cloud side. This script cannot reach it: add ingress
#     TCP 80 and 443 from 0.0.0.0/0 in the console (deploy/oracle/README.md, step 2).
#   - the VM's own firewall. Oracle Linux images keep iptables rules that accept SSH and
#     reject the rest, reloaded at boot; Ubuntu images have none. This script is that half.
#
# It also installs Docker with the compose plugin, and swap when the shape has too little
# RAM for the web image's build. Safe to re-run: every step is a no-op the second time.
set -euo pipefail

DRY_RUN="${DRY_RUN:-0}"

say() { printf '==> %s\n' "$*"; }
run() {
  if [ "$DRY_RUN" = "1" ]; then
    printf '    would run: %s\n' "$*"
  else
    "$@"
  fi
}

[ "$(id -u)" = 0 ] || { echo "run me with sudo" >&2; exit 1; }

# --- 1. Docker and the compose plugin ---------------------------------------
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  say "docker and the compose plugin are already installed"
else
  say "installing docker (get.docker.com — Ubuntu, Debian, and the RHEL family)"
  if [ "$DRY_RUN" = "1" ]; then
    echo "    would run: curl -fsSL https://get.docker.com | sh"
  else
    curl -fsSL https://get.docker.com | sh
  fi
fi

run systemctl enable --now docker

if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != root ]; then
  run usermod -aG docker "$SUDO_USER"
  say "$SUDO_USER can use docker after logging out and back in"
fi

# --- 2. swap, when the shape has almost no RAM ------------------------------
# The AMD micro shape (1 GB) is inside the free tier but the web image builds the site with
# Vite, which wants more than that. The Ampere A1 shape has plenty and skips this.
mem_mb="$(awk '/^MemTotal:/ {print int($2 / 1024)}' /proc/meminfo)"
if [ "$mem_mb" -lt 2048 ] && [ ! -e /swapfile ]; then
  say "only ${mem_mb} MB of RAM — adding a 2 GB swap file so the image build has headroom"
  run fallocate -l 2G /swapfile
  run chmod 600 /swapfile
  run mkswap /swapfile
  run swapon /swapfile
  if [ "$DRY_RUN" = "1" ]; then
    echo "    would add /swapfile to /etc/fstab"
  else
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
fi

# --- 3. the host firewall ---------------------------------------------------
open_port() {
  port="$1"
  changed=0

  # Ubuntu, and anything else running one of these.
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q '^Status: active'; then
    run ufw allow "$port/tcp"
    changed=1
  fi

  # Oracle Linux 8/9 images, which is where the port really does get dropped.
  if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
    run firewall-cmd --permanent --add-port="$port/tcp"
    changed=1
  fi

  # Those images also keep a persistent iptables ruleset — accept SSH, reject the rest —
  # that is reloaded at boot, so the accept goes in ahead of the reject, as Oracle's own
  # documentation does it.
  if command -v iptables >/dev/null 2>&1; then
    if iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null; then
      changed=1
    elif iptables -S INPUT 2>/dev/null | grep -qE '^-A INPUT .*(-j (REJECT|DROP)|--reject-with)'; then
      run iptables -I INPUT 6 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
      changed=1
    fi
  fi

  [ "$changed" = 1 ] || printf '    %s/tcp: nothing to open here — this image has no active local firewall\n' "$port"
}

open_port 80
open_port 443

if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
  run firewall-cmd --reload
fi
if command -v netfilter-persistent >/dev/null 2>&1; then
  run netfilter-persistent save
elif command -v iptables-save >/dev/null 2>&1 && [ -d /etc/iptables ]; then
  run sh -c 'iptables-save > /etc/iptables/rules.v4'
fi

say "80 and 443 are open on this VM"

# --- 4. what is left, and only you can do it --------------------------------
cat <<'EOF'

Still to do:

  1. Cloud side — the VCN's security list. Until this is done the site only answers on
     this machine:

       Networking -> Virtual Cloud Networks -> your VCN -> Security Lists ->
       Default Security List -> Add Ingress Rules

       Source 0.0.0.0/0   IP Protocol TCP   Destination Port Range 80    Stateless: No
       Source 0.0.0.0/0   IP Protocol TCP   Destination Port Range 443   Stateless: No

  2. Reserve this instance's public IP (Instances -> your instance -> Attached VNICs ->
     the VNIC -> Edit -> Reserved public IP), so the name you publish on keeps pointing
     here after a stop.

  3. Start the app. Leave SITE_ADDRESS and PUBLIC_ORIGIN blank in .env.prod and deploy.sh
     will publish it on <this VM's public ip>.sslip.io:

       cd ~/streamcast-pro
       ./deploy/deploy.sh          # first run writes .env.prod and stops
       nano .env.prod              # passwords, ADMIN_EMAIL
       ./deploy/deploy.sh

  deploy/oracle/README.md walks through all of it.
EOF
