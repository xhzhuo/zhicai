document.addEventListener('zhicai-snapshot', () => {
  try { document.documentElement.setAttribute('data-zhicai-snapshot', JSON.stringify(ZhicaiPlaza.snapshot())); }
  catch(e) { document.documentElement.setAttribute('data-zhicai-snapshot', JSON.stringify({error:e.message})); }
});
