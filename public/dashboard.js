(() => {
  const $ = (id) => document.getElementById(id);
  const POLL_MS = 3000;

  const level = (p) => (p >= 90 ? 'high' : p >= 70 ? 'mid' : 'low');
  const clamp = (p) => Math.max(0, Math.min(100, p));
  const setBar = (el, p) => { el.style.width = clamp(p) + '%'; el.dataset.level = level(p); };

  const fmtBytes = (n) => {
    if (n == null) return '–';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return n.toFixed(i > 1 ? 1 : 0) + ' ' + units[i];
  };
  const fmtUptime = (s) => {
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  };

  function renderCores(cores) {
    const wrap = $('cores');
    if (wrap.children.length !== cores.length) {
      wrap.replaceChildren(...cores.map((_, i) => {
        const el = document.createElement('div');
        el.className = 'core';
        const fill = document.createElement('div');
        fill.className = 'core-fill';
        const label = document.createElement('span');
        label.textContent = 'Core ' + (i + 1);
        el.append(fill, label);
        return el;
      }));
    }
    cores.forEach((p, i) => {
      const fill = wrap.children[i].firstChild;
      fill.style.height = clamp(p) + '%';
      fill.dataset.level = level(p);
    });
  }

  function renderDisks(disks) {
    $('disks').replaceChildren(...disks.map((d) => {
      const row = document.createElement('div');
      row.className = 'row';
      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = 'Disk ' + d.mount;
      const meter = document.createElement('div');
      meter.className = 'meter';
      const bar = document.createElement('i');
      setBar(bar, d.percent);
      meter.append(bar);
      const v = document.createElement('span');
      v.className = 'v';
      v.textContent = `${fmtBytes(d.used)} of ${fmtBytes(d.size)}`;
      row.append(k, meter, v);
      return row;
    }));
  }

  function render(s) {
    $('cpu-total').textContent = s.cpu.percent + '%';
    $('cpu-count').textContent = s.cpu.cores.length;
    renderCores(s.cpu.cores);

    setBar($('mem-bar'), s.memory.percent);
    $('mem-text').textContent = `${fmtBytes(s.memory.used)} of ${fmtBytes(s.memory.total)}`;

    $('ctr-row').hidden = !s.container;
    if (s.container) {
      setBar($('ctr-bar'), s.container.percent);
      $('ctr-text').textContent = `${fmtBytes(s.container.memoryUsed)} of ${fmtBytes(s.container.memoryLimit)}`;
    }

    renderDisks(s.disks);

    $('bat-row').hidden = !s.battery;
    if (s.battery) {
      // Low battery is the bad case, so invert the level colors
      setBar($('bat-bar'), s.battery.percent);
      $('bat-bar').dataset.level = s.battery.percent <= 15 ? 'high' : s.battery.percent <= 30 ? 'mid' : 'low';
      $('bat-text').textContent = `${s.battery.percent}%${s.battery.charging ? ', charging' : ''}`;
    }

    $('uptime').textContent = fmtUptime(s.uptimeSeconds);
  }

  async function tick() {
    try {
      const res = await fetch('/api/stats', { cache: 'no-store' });
      if (res.status === 401) return location.reload();
      if (!res.ok) throw new Error('HTTP ' + res.status);
      render(await res.json());
      $('status').textContent = 'Updated ' + new Date().toLocaleTimeString();
      $('status').classList.remove('error');
    } catch {
      $('status').textContent = 'Connection lost. Retrying.';
      $('status').classList.add('error');
    }
    schedule();
  }

  let timer;
  function schedule() {
    clearTimeout(timer);
    // Pause while the tab is hidden so a backgrounded tab doesn't keep a slow CPU busy
    if (!document.hidden) timer = setTimeout(tick, POLL_MS);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  tick();
})();
