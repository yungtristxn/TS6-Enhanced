// Optional TS6 Enhanced features. Stored in this renderer's local storage only;
// a missing, unknown or unreadable value leaves the feature at its default
// (on, unless the definition says `default: false`). Only changes are stored.
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
      id: 'evenGrid',
      group: 'Streams',
      label: 'Balanced stream grid',
      detail:
        'Gives every stream in the grid the same size, as large as the stage allows, stacking them when that is bigger.'
    },
    {
      id: 'streamZoom',
      group: 'Streams',
      label: 'Scroll to zoom',
      detail:
        'Scroll over a focused or fullscreen stream to zoom in on the spot under the pointer, drag to look around, scroll back to zoom out.'
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
      id: 'chatBottom',
      group: 'Chat',
      label: 'Messages start at the bottom',
      detail: 'A short chat history sits on the message box, as in most chat apps.',
      default: false
    },
    {
      id: 'pokeSound',
      group: 'Chat',
      label: 'Poke sound',
      detail: 'Plays the poke sound even when message sounds are off, you are away or your speakers are muted.'
    },
    {
      id: 'pokeFlash',
      group: 'Chat',
      label: 'Flash taskbar on any poke',
      detail: 'Flashes TeamSpeak in the taskbar when a poke arrives in the background, from any server tab.'
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
  const fallback = id => definitions.find(definition => definition.id === id)?.default !== false;
  const own = id => (id in values ? values[id] : fallback(id));
  const enabled = id => {
    const definition = definitions.find(item => item.id === id);
    if (!definition) return true;
    return own(id) && (!definition.requires || enabled(definition.requires));
  };
  // CSS-only features read these attributes; JavaScript features call enabled().
  // data-tsix-off lists disabled features; data-tsix-on lists enabled features
  // that are off by default, so their CSS stays inactive without this runtime.
  const paint = () => {
    for (const [name, ids] of [
      ['data-tsix-off', definitions.filter(definition => definition.default !== false && !enabled(definition.id))],
      ['data-tsix-on', definitions.filter(definition => definition.default === false && enabled(definition.id))]
    ]) {
      const value = ids.map(definition => definition.id).join(' ');
      if (value) document.documentElement.setAttribute(name, value);
      else document.documentElement.removeAttribute(name);
    }
  };
  paint();
  window.__tsixFeatures = {
    version: '1.0.0',
    definitions: () => definitions.map(definition => ({ ...definition, value: own(definition.id) })),
    enabled,
    set(id, value) {
      if (!known.has(id) || typeof value !== 'boolean') throw Error('Unknown feature');
      if (value === fallback(id)) delete values[id];
      else values[id] = value;
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
      document.documentElement.removeAttribute('data-tsix-on');
      delete window.__tsixFeatures;
    }
  };
  return { features: definitions.length };
})();
