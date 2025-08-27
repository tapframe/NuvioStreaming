type Listener = (hidden: boolean) => void;

let currentHidden = false;
const listeners: Listener[] = [];

export const HeaderVisibility = {
  setHidden(hidden: boolean) {
    if (currentHidden === hidden) return;
    currentHidden = hidden;
    listeners.slice().forEach(l => {
      try { l(currentHidden); } catch {}
    });
  },
  subscribe(listener: Listener) {
    listeners.push(listener);
    // Immediate call to sync initial state
    try { listener(currentHidden); } catch {}
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  },
  isHidden() {
    return currentHidden;
  }
};


