const fs = require('node:fs');
const si = require('systeminformation');

const TTL_MS = 2000;
let cache = { at: 0, data: null };
let inflight = null;

const readNum = (file) => {
  try {
    const v = fs.readFileSync(file, 'utf8').trim();
    return v === 'max' ? null : Number(v);
  } catch {
    return null;
  }
};

// Optional: a JSON file like {"percent": 82, "charging": true, "updatedAt": "..."} written by something
// on the phone itself (e.g. Termux:API). The VM cannot see the phone's battery on its own.
function readBatteryFile() {
  const file = process.env.BATTERY_FILE;
  if (!file) return null;
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { percent: j.percent, charging: !!j.charging, source: 'file', updatedAt: j.updatedAt ?? null };
  } catch {
    return null;
  }
}

async function collect() {
  const [load, mem, fsSize, battery, time] = await Promise.all([
    si.currentLoad(), si.mem(), si.fsSize(), si.battery(), si.time(),
  ]);

  const seen = new Set();
  const disks = fsSize
    .filter((d) => (d.mount === '/' || d.mount.startsWith('/mnt')) && !seen.has(d.mount) && seen.add(d.mount))
    .map((d) => ({ mount: d.mount, size: d.size, used: d.used, percent: Math.round(d.use) }));

  const cgLimit = readNum('/sys/fs/cgroup/memory.max');
  const cgUsed = readNum('/sys/fs/cgroup/memory.current');

  return {
    at: Date.now(),
    cpu: {
      percent: Math.round(load.currentLoad),
      cores: load.cpus.map((c) => Math.round(c.load)),
    },
    memory: {
      total: mem.total,
      used: mem.active,
      percent: Math.round((mem.active / mem.total) * 100),
    },
    container: cgLimit && cgUsed != null
      ? { memoryLimit: cgLimit, memoryUsed: cgUsed, percent: Math.round((cgUsed / cgLimit) * 100) }
      : null,
    disks,
    battery: battery.hasBattery
      ? { percent: battery.percent, charging: battery.isCharging, source: 'vm' }
      : readBatteryFile(),
    uptimeSeconds: time.uptime,
  };
}

// Cached and de-duplicated so several open tabs don't multiply the work on a slow CPU
async function getStats() {
  if (cache.data && Date.now() - cache.at < TTL_MS) return cache.data;
  inflight ??= collect()
    .then((data) => { cache = { at: Date.now(), data }; return data; })
    .finally(() => { inflight = null; });
  return inflight;
}

module.exports = { getStats };
