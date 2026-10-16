# AegisGrid

AegisGrid is a browser console for BIOS and hardware diagnostics. It reads the machine that is running the server, shows firmware and component inventory, and runs a short non-destructive suite.

The checks cover SMBIOS identity, firmware date, UEFI versus legacy boot, online CPUs, a compute sample, kernel speculative-execution status, memory headroom, a 32 MiB pattern sample, root filesystem space, a 1 MiB disk round trip, link state, and the default route.

AegisGrid does not flash firmware, wipe disks, or walk every DIMM. Use a vendor offline tool when you need a full memory or surface scan.

## Run

```bash
npm install
npm run dev -- --hostname 0.0.0.0 --port 43117
```

Open [http://127.0.0.1:43117](http://127.0.0.1:43117).

```bash
npm test
npm run lint
```

## Where the data comes from

| Area | Source |
| --- | --- |
| BIOS / system | `/sys/class/dmi/id`, or `dmidecode` when passwordless sudo is allowed |
| Boot mode | `/sys/firmware/efi` |
| CPU | `lscpu` |
| Memory | `/proc/meminfo` plus an in-process pattern |
| Disks | `lsblk`, `df`, and a temp-file hash |
| Network | `/sys/class/net` and `/proc/net/route` |

Virtual machines often hide SMBIOS. Those checks report as warnings instead of pretending a BIOS version was found. Run AegisGrid on the bare-metal host you want to diagnose.
