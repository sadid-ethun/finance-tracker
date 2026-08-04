#!/usr/bin/env bash
#
# One-time setup for a fresh Oracle Cloud Ampere VM (Ubuntu 22.04/24.04 arm64).
# Run once, by hand, as the default `ubuntu` user. Deploys afterwards go
# through infra/scripts/deploy.sh.
#
#   curl -fsSL https://raw.githubusercontent.com/<you>/finance-tracker/main/infra/scripts/provision-oracle.sh | bash
#
# or just clone the repo first and run it from there.
#
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/sadid-ethun/finance-tracker.git}"
APP_DIR="${HOME}/finance-tracker"

echo "==> Installing Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "${USER}"
fi

echo "==> Opening 80 and 443 in the host firewall"
# Oracle's Ubuntu images ship an iptables ruleset whose INPUT chain ends in a
# REJECT, so opening the ports in the cloud Security List is only half the job:
# packets arrive at the VM and are dropped locally. This is the single most
# common reason a working container is unreachable from the internet, and it
# costs people hours because nothing logs it.
#
# The rules are inserted *before* the trailing REJECT, then persisted.
sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent netfilter-persistent
sudo netfilter-persistent save

echo "==> Adding swap"
# 12GB is comfortable for running the stack, but `pnpm --filter web build`
# spikes hard and an OOM kill mid-build leaves a confusing half-built image.
# Swap is insurance, not a plan to rely on.
if [[ ! -f /swapfile ]]; then
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "==> Enabling unattended security updates"
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Cloning the repository"
if [[ ! -d "${APP_DIR}" ]]; then
  git clone "${REPO_URL}" "${APP_DIR}"
fi

cd "${APP_DIR}"
if [[ ! -f .env ]]; then
  cp .env.production.example .env
  chmod 600 .env
  echo
  echo "  Created ${APP_DIR}/.env from the example."
  echo "  Fill in every value before deploying, then run:"
  echo "    cd ${APP_DIR} && ./infra/scripts/deploy.sh"
fi

echo
echo "==> Provisioning complete."
echo "    Log out and back in so the docker group membership takes effect."
echo
echo "    Still to do, in the Oracle console:"
echo "      * VCN -> Security List -> add ingress rules for TCP 80 and 443"
echo "        from 0.0.0.0/0. The iptables rules above are the host half;"
echo "        this is the cloud half. Both are required."
echo "      * Point your domain's A record at this VM's public IP before"
echo "        the first deploy, or Caddy cannot complete the ACME challenge."
