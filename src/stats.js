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

// The VM cannot see the phone's battery, so the phone pushes it (see phone/battery-push.sh -> POST /api/battery)
let pushed = null;
function setBattery(reading) {
  pushed = { ...reading, receivedAt: Date.now() };
  cache.at = 0; // next /api/stats call reflects it immediately
}

function batteryInfo(vm) {
  if (vm.hasBattery) {
    return { percent: vm.percent, charging: vm.isCharging, temperature: null, source: 'vm', ageSeconds: 0 };
  }
  if (!pushed) return null;
  return {
    percent: pushed.percent,
    charging: pushed.charging,
    temperature: pushed.temperature,
    source: 'phone',
    ageSeconds: Math.round((Date.now() - pushed.receivedAt) / 1000),
  };
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
    battery: batteryInfo(battery),
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

module.exports = { getStats, setBattery };
