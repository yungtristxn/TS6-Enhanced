// Optional TS6 Enhanced features. Stored in this renderer's local storage only;
// a missing, unknown or unreadable value leaves the feature enabled.
(() => {
  window.__tsixFeatures?.dispose();
  const storageKey = 'tsix.layout.features';
  const definitions = [
    {
      id: 'clickFocus',
      group: 'Streams',
      label: 'Click to focus a stream',
      detail: 'Click a stream to focus it; click it again to return to the grid.'
    },
    {
      id: 'volumeBoost',
      group: 'Streams',
      label: 'Stream volume up to 300%',
      detail: 'Replaces the stream volume slider with one that can amplify quiet streams.'
    },
    {
      id: 'volumeMemory',
      group: 'Streams',
      label: 'Remember volume per streamer',
      detail: 'Reapplies your last volume for each person when you watch them again.',
      requires: 'volumeBoost'
    },
    {
      id: 'chatCompactEvents',
      group: 'Chat',
      label: 'Slim system messages',
      detail: 'Shows joins, leaves and other events as single lines with the time beside the text.'
    },
    {
      id: 'chatGroupEvents',
      group: 'Chat',
      label: 'Group repeated join and leave messages',
      detail: 'Folds three or more consecutive events into one expandable line.'
    },
    {
      id: 'chatDays',
      group: 'Chat',
      label: 'Day separators',
      detail: 'Starts each day with a dated line, so message times show only the hour.'
    },
    {
      id: 'chatWidth',
      group: 'Chat',
      label: 'Limit chat line length',
      detail: 'Keeps long messages readable in wide windows.'
    }
  ];
  const known = new Set(definitions.map(definition => definition.id));
  let values = {};
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved))
      for (const [id, value] of Object.entries(saved))
        if (known.has(id) && typeof value === 'boolean') values[id] = value;
  } catch {
    values = {};
  }
  const own = id => values[id] !== false;
  const enabled = id => {
    const definition = definitions.find(item => item.id === id);
    if (!definition) return true;
    return own(id) && (!definition.requires || enabled(definition.requires));
  };
  // CSS-only features read this attribute; JavaScript features call enabled().
  const paint = () => {
    const off = definitions.filter(definition => !enabled(definition.id)).map(definition => definition.id);
    if (off.length) document.documentElement.setAttribute('data-tsix-off', off.join(' '));
    else document.documentElement.removeAttribute('data-tsix-off');
  };
  paint();
  window.__tsixFeatures = {
    version: '1.0.0',
    definitions: () => definitions.map(definition => ({ ...definition, value: own(definition.id) })),
    enabled,
    set(id, value) {
      if (!known.has(id) || typeof value !== 'boolean') throw Error('Unknown feature');
      if (value) delete values[id];
      else values[id] = false;
      try {
        if (Object.keys(values).length) localStorage.setItem(storageKey, JSON.stringify(values));
        else localStorage.removeItem(storageKey);
      } catch {
        /* Keep the choice for this session if storage is unavailable. */
      }
      paint();
      window.dispatchEvent(new CustomEvent('tsix-features', { detail: { id, value } }));
    },
    dispose() {
      document.documentElement.removeAttribute('data-tsix-off');
      delete window.__tsixFeatures;
    }
  };
  return { features: definitions.length };
})();
