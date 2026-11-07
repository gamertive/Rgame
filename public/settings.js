const Settings = (() => {
  const defaults = {
    musicVol: 30, sfxVol: 70,
    sensitivity: 100,
    particles: true, musicOn: true,
  };
  let data = { ...defaults };
  try {
    const saved = localStorage.getItem('rs_settings');
    if (saved) data = { ...defaults, ...JSON.parse(saved) };
  } catch(e){}

  function save() {
    try { localStorage.setItem('rs_settings', JSON.stringify(data)); } catch(e){}
  }

  return {
    get: (k) => data[k],
    set: (k, v) => { data[k] = v; save(); },
    getAll: () => ({ ...data }),
  };
})();