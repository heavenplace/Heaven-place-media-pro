# An Oracle Cloud Always Free VM for this stack

`docker-compose.prod.yml` needs a machine that stays up, has root and runs Docker. Oracle
Cloud's **Always Free** tier is the free option that actually gives you one — a normal VM,
not a hosting panel:

| Always Free | What it is | Enough? |
| --- | --- | --- |
| Ampere A1 (ARM) | up to 4 OCPUs / 24 GB RAM | **Yes — use this shape.** |
| AMD micro | 1/8 OCPU / 1 GB RAM (two of them) | Works, but the web image's Vite build wants more; `vm-setup.sh` adds swap |
| Block storage | the default ~50 GB boot volume | Fits the app, its database and its media |
| Outbound data | 10 TB/month | More than a small station moves |

Signing up asks for a card to verify identity (a small temporary authorisation, not a
charge). Staying inside the Always Free shapes is what keeps it free.

The two files beside this one:

- `vm-setup.sh` — run on the VM: installs Docker, opens the *host* firewall, prints what
  is left. `DRY_RUN=1 sudo ./deploy/oracle/vm-setup.sh` changes nothing and just prints.
- `cloud-init.yaml` — optional; paste it at instance creation so Docker is already there
  when you first log in.

## 1. Create the instance

Console → **Compute → Instances → Create instance**

- **Image**: Ubuntu 24.04 (the aarch64 build, for the Ampere shape).
- **Shape**: *Ampere* → `VM.Standard.A1.Flex`, 2 OCPU / 12 GB is comfortable (the free
  allowance is 4 OCPU / 24 GB).
- **Networking**: leave the default VCN, and keep **Assign a public IPv4 address** on.
- **SSH keys**: upload your public key, or let it generate one and download the private key.
- **Boot volume**: default.
- Optional: **Show advanced options → Management → Cloud-init script** → paste
  `cloud-init.yaml`.

Then log in:

```bash
chmod 600 ~/Downloads/ssh-key-*.key
ssh -i ~/Downloads/ssh-key-*.key ubuntu@<public ip>
```

*"Out of host capacity"* on the Ampere shape is common and temporary — try another
availability domain in the same region, or retry later.

## 2. Open 80 and 443 on the cloud side

This is the most common reason a deploy "does nothing" on Oracle Cloud, because the
provider filters a port before your VM ever sees the packet.

Console → **Networking → Virtual Cloud Networks** → your VCN → **Security Lists** →
**Default Security List** → **Add Ingress Rules**, twice:

| Source | IP Protocol | Destination Port Range | Stateless |
| --- | --- | --- | --- |
| `0.0.0.0/0` | TCP | `80` | No |
| `0.0.0.0/0` | TCP | `443` | No |

(If the instance uses a Network Security Group instead, put the same two rules there.)

Port 22 is already open, which is why SSH works while the site does not. Nothing else
needs a public port: Postgres and the API live only on the compose network behind Caddy.

## 3. Prepare the host

The second half of the same problem: Oracle Linux images ship a firewall that accepts SSH
and drops 80/443 even when the security list allows them, and the rules come back at boot.
Ubuntu images have no local firewall, but the script handles either.

```bash
git clone https://github.com/heavenplace/Heaven-place-media-pro streamcast-pro
cd streamcast-pro
sudo ./deploy/oracle/vm-setup.sh
```

Clone over SSH, or with a personal access token, if the repository is private.

It installs Docker with the compose plugin, opens 80 and 443 in `firewalld` / `ufw` /
`iptables` and saves the rules, adds a swap file when the shape has under 2 GB of RAM, and
prints what remains. Re-running it is a no-op.

## 4. A name to publish on

The VM has no public hostname, and `streamcastpro.ct.ws` cannot be repointed — `ct.ws` is
InfinityFree's own domain, served from their nameservers (see `AGENTS.md`). Three ways out,
easiest first:

- **Let `deploy.sh` do it.** Leave `SITE_ADDRESS` and `PUBLIC_ORIGIN` blank in `.env.prod`
  and it fills them in as `<public ip>.sslip.io` — a free name that resolves to whatever IP
  it is asked about, and that Let's Encrypt issues a certificate for. Good for a first live
  test, and the site, the API and the APKs all work on it.
- **A nicer free name**: sign in at <https://www.duckdns.org>, create `streamcastpro`, put
  this VM's public IP against it, then use `streamcastpro.duckdns.org`.
- **A domain you own**: add an A record (say `stream.yourdomain.com`) pointing at the VM's
  public IP.

Whichever you choose, the two lines in `.env.prod` are the bare name and the same name with
its scheme:

```
SITE_ADDRESS=stream.yourdomain.com
PUBLIC_ORIGIN=https://stream.yourdomain.com
```

Do this **before** the first start: Caddy asks Let's Encrypt for a certificate for exactly
that name, and the challenge only passes once the name resolves here.

Also **reserve the public IP** (Instances → your instance → *Resources → Attached VNICs* →
the VNIC → **Edit** → *Reserved public IP*) — an ephemeral address is released if the
instance is stopped, and the name would stop pointing here.

## 5. Start the stack

```bash
./deploy/deploy.sh          # first run writes .env.prod and stops
nano .env.prod              # fill in the passwords, ADMIN_EMAIL, and the name from step 4
./deploy/deploy.sh          # validate, build, start, health-check
```

The first run builds the images on the VM — a few minutes on the A1 shape. When it finishes
it health-checks all three services and fetches `http://<name>/`, then prints the handful of
things it cannot do for you. Confirm it independently:

```bash
curl -s https://<name>/api/config
```

## 6. Once it is up

- **APKs**: build them against the deployed origin on a desktop (the Android toolchain image
  is x86-64 only, so it does not run on the ARM VM) and copy them in:
  `API_BASE_URL=https://<name> docker compose -f docker-compose.mobile.yml run --rm android`,
  then `scp web/public/downloads/*.apk ubuntu@<ip>:~/streamcast-pro/web/public/downloads/`
  and `./deploy/deploy.sh` again. Without them the download buttons 404.
- **Google**: add `https://<name>` to the OAuth client's authorized JavaScript origins.
- **Stripe**: point the webhook at `https://<name>/api/payments/webhook`.
- **Existing data**: `./deploy/migrate-data.sh export <dir>` in the sandbox, copy `<dir>`
  over, `./deploy/migrate-data.sh import <dir>` on the VM.
- **Sign in** as `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env.prod`, then change the password.

## Worth knowing

- **ARM is a non-issue here.** Every image the stack uses publishes an arm64 build
  (`node:22-alpine`, `caddy:2-alpine`, `postgres:16-alpine`), `api/` has no native
  dependencies, and the web lockfile carries the arm64 `rollup` and `esbuild` builds, so an
  A1 instance builds and runs this stack unchanged.
- **Updates**: `git pull && ./deploy/deploy.sh` — the data lives in the `db_data` and
  `uploads` Docker volumes and survives rebuilds.
- **Backup**: everything the app owns is in those two volumes; snapshot the boot volume
  (Compute → Boot Volumes → Create Manual Backup) before anything invasive.
- **Idle reclaim**: Oracle documents that an Always Free instance sitting under 10% CPU
  (95th percentile) for seven days can be stopped and reclaimed. A station that is used is
  far above that; during a long quiet stretch, keep an eye on the instance.
- **Region**: pick one near your listeners — the free shapes are available in all regions,
  but capacity for the Ampere shape varies.
