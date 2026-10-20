export function buildPlist(obj: Record<string, any>): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    buildNode(obj),
    '</plist>',
  ].join('\n');
}

function buildNode(value: any): string {
  if (value === null || value === undefined) return '<string></string>';
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return `<data>${btoa(binary)}</data>`;
  }
  if (value instanceof Date) {
    return `<date>${value.toISOString()}</date>`;
  }
  if (typeof value === 'string') return `<string>${escapeXml(value)}</string>`;
  if (typeof value === 'number') {
    return Number.isInteger(value) ? `<integer>${value}</integer>` : `<real>${value}</real>`;
  }
  if (typeof value === 'boolean') return value ? '<true/>' : '<false/>';
  if (Array.isArray(value)) return `<array>${value.map(buildNode).join('')}</array>`;
  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([k, v]) => `<key>${escapeXml(k)}</key>${buildNode(v)}`)
      .join('');
    return `<dict>${entries}</dict>`;
  }
  return `<string>${escapeXml(String(value))}</string>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Native browser plist parser — avoids @xmldom/xmldom bundling issues
export function parsePlist(xml: string): any {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const root = doc.documentElement;
  if (root.nodeName !== 'plist') {
    throw new Error('Invalid plist: root element is not <plist>');
  }
  const firstChild = root.firstElementChild;
  if (!firstChild) {
    throw new Error('Invalid plist: empty <plist> element');
  }
  return parseNode(firstChild);
}

function parseNode(node: Element): any {
  switch (node.nodeName) {
    case 'dict': {
      const result: Record<string, any> = {};
      const children = Array.from(node.children);
      for (let i = 0; i < children.length; i += 2) {
        if (children[i].nodeName !== 'key') continue;
        const key = children[i].textContent || '';
        const value = i + 1 < children.length ? parseNode(children[i + 1]) : null;
        result[key] = value;
      }
      return result;
    }
    case 'array':
      return Array.from(node.children).map(parseNode);
    case 'string':
      return node.textContent || '';
    case 'integer':
      return parseInt(node.textContent || '0', 10);
    case 'real':
      return parseFloat(node.textContent || '0');
    case 'true':
      return true;
    case 'false':
      return false;
    case 'date':
      return new Date(node.textContent || '');
    case 'data': {
      const b64 = (node.textContent || '').trim();
      const binaryStr = atob(b64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return bytes;
    }
    default:
      return node.textContent || '';
  }
}
