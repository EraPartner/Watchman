const NEW_STYLE_MODELS: Readonly<Record<number, string>> = {
  0x00: 'Pi A',
  0x01: 'Pi B',
  0x02: 'Pi A+',
  0x03: 'Pi B+',
  0x04: 'Pi 2B',
  0x05: 'Pi Alpha',
  0x06: 'Pi CM1',
  0x08: 'Pi 3B',
  0x09: 'Pi Zero',
  0x0a: 'Pi CM3',
  0x0c: 'Pi Zero W',
  0x0d: 'Pi 3B+',
  0x0e: 'Pi 3A+',
  0x0f: 'Internal use',
  0x10: 'Pi CM3+',
  0x11: 'Pi 4B',
  0x12: 'Pi Zero 2 W',
  0x13: 'Pi 400',
  0x14: 'Pi CM4',
  0x15: 'Pi CM4S',
  0x17: 'Pi 5',
};

const OLD_STYLE_MODELS: Readonly<Record<string, string>> = {
  '0002': 'Pi B Rev 1.0',
  '0003': 'Pi B Rev 1.0',
  '0004': 'Pi B Rev 2.0',
  '0005': 'Pi B Rev 2.0',
  '0006': 'Pi B Rev 2.0',
  '0007': 'Pi A',
  '0008': 'Pi A',
  '0009': 'Pi A',
  '000d': 'Pi B Rev 2.0',
  '000e': 'Pi B Rev 2.0',
  '000f': 'Pi B Rev 2.0',
  '0010': 'Pi B+',
  '0011': 'Pi CM1',
  '0012': 'Pi A+',
  '0013': 'Pi B+',
  '0014': 'Pi CM1',
  '0015': 'Pi A+',
};

export function getPiModel(revision: number | null | undefined): string {
  if (!revision) return 'Unknown';
  if (revision & 0x800000) {
    const type = (revision >> 4) & 0xff;
    return NEW_STYLE_MODELS[type] ?? `Unknown (type ${type})`;
  }
  const hex = revision.toString(16).padStart(4, '0');
  return OLD_STYLE_MODELS[hex] ?? `Unknown (rev ${hex})`;
}
