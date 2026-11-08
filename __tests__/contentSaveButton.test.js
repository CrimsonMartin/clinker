/**
 * @jest-environment jsdom
 */

// Tests the real content script (content.ts): the "Save to Clinker" button lives in a closed
// shadow root, only reacts to trusted clicks, and never stores remote image URLs.

let storage;
global.chrome = {
  storage: {
    local: {
      get: jest.fn((keys, cb) => {
        const result = {};
        if (typeof keys === 'string') {
          if (storage[keys] !== undefined) result[keys] = storage[keys];
        } else {
          for (const [k, def] of Object.entries(keys)) result[k] = storage[k] !== undefined ? storage[k] : def;
        }
        cb(JSON.parse(JSON.stringify(result)));
      }),
      set: jest.fn((items, cb) => {
        Object.assign(storage, items);
        cb();
      })
    },
    onChanged: { addListener: jest.fn() }
  },
  runtime: {
    sendMessage: jest.fn((msg, cb) => cb({ success: true })),
    lastError: null
  }
};

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise(resolve => setTimeout(resolve, 0));
};

// Capture the closed shadow root and the button's click listener as the script creates them.
const shadowRoots = [];
const realAttachShadow = Element.prototype.attachShadow;
Element.prototype.attachShadow = function (init) {
  const root = realAttachShadow.call(this, init);
  shadowRoots.push({ host: this, root, mode: init.mode });
  return root;
};
const clickListeners = [];
const realAddEventListener = EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener = function (type, listener, options) {
  if (type === 'click' && this instanceof HTMLButtonElement) clickListeners.push(listener);
  return realAddEventListener.call(this, type, listener, options);
};

if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () => ({ left: 10, top: 10, right: 110, bottom: 30, width: 100, height: 20 });
}

beforeAll(() => {
  global.console = { ...global.console, log: jest.fn(), warn: jest.fn() };
  require('../content.ts');
});

afterAll(() => {
  Element.prototype.attachShadow = realAttachShadow;
  EventTarget.prototype.addEventListener = realAddEventListener;
});

beforeEach(() => {
  storage = { extensionActive: true, citationTree: { nodes: [], currentNodeId: null }, nodeCounter: 0 };
  chrome.storage.local.set.mockClear();
});

function selectParagraph(html) {
  document.body.querySelectorAll('p').forEach(p => p.remove());
  const p = document.createElement('p');
  p.innerHTML = html;
  document.body.appendChild(p);
  const range = document.createRange();
  range.selectNodeContents(p);
  // test-setup.js replaces getSelection with a stub; point it at this range.
  window.getSelection = () => ({ rangeCount: 1, toString: () => p.textContent, getRangeAt: () => range });
  return p;
}

async function showButton(html = 'Some selected text') {
  selectParagraph(html);
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  await flush();
}

const savedNodes = () => (storage.citationTree ? storage.citationTree.nodes : []);
const trustedClick = async () => {
  await clickListeners[clickListeners.length - 1]({ isTrusted: true });
  await flush();
};

describe('Save to Clinker button', () => {
  it('is rendered inside a closed shadow root on a host the page cannot see into', async () => {
    await showButton();
    expect(shadowRoots).toHaveLength(1);
    const { host, root, mode } = shadowRoots[0];
    expect(mode).toBe('closed');
    expect(host.shadowRoot).toBeNull();
    expect(document.body.contains(host)).toBe(true);
    // The page sees no button in its DOM.
    expect(document.querySelector('button')).toBeNull();
    const button = root.querySelector('button');
    expect(button.textContent).toBe('Save to Clinker');
    expect(host.style.getPropertyValue('display')).toBe('block');
    expect(host.style.getPropertyPriority('display')).toBe('important');
  });

  it('reuses the same host on later selections', async () => {
    await showButton('again');
    expect(shadowRoots).toHaveLength(1);
  });

  it('ignores synthetic (untrusted) clicks', async () => {
    await showButton();
    const button = shadowRoots[0].root.querySelector('button');
    button.click();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(savedNodes()).toHaveLength(0);
  });

  it('saves the selection on a trusted click and hides itself', async () => {
    await showButton('Important finding');
    await trustedClick();
    expect(savedNodes()).toHaveLength(1);
    expect(savedNodes()[0].text).toBe('Important finding');
    expect(shadowRoots[0].host.style.getPropertyValue('display')).toBe('none');
  });

  describe('images in the selection', () => {
    const realGetContext = HTMLCanvasElement.prototype.getContext;
    const realToDataURL = HTMLCanvasElement.prototype.toDataURL;
    afterEach(() => {
      HTMLCanvasElement.prototype.getContext = realGetContext;
      HTMLCanvasElement.prototype.toDataURL = realToDataURL;
    });

    it('stores readable images as data: URLs', async () => {
      HTMLCanvasElement.prototype.getContext = () => ({ drawImage: () => {} });
      HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
      await showButton('text <img src="https://example.com/a.png" width="10" height="10"> more');
      await trustedClick();
      expect(savedNodes()[0].images).toEqual(['data:image/png;base64,AAAA']);
    });

    it('drops cross-origin images instead of storing their remote URL', async () => {
      HTMLCanvasElement.prototype.getContext = () => ({
        drawImage: () => {
          throw new DOMException('Tainted canvases may not be exported.', 'SecurityError');
        }
      });
      await showButton('text <img src="https://tracker.example.net/pixel.png" width="10" height="10"> more');
      await trustedClick();
      const node = savedNodes()[0];
      expect(node.text).toContain('text');
      expect(node.images).toBeUndefined();
      expect(JSON.stringify(storage)).not.toContain('tracker.example.net');
    });
  });
});
