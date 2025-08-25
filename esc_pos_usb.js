
export class EscPosDeviceFingerprint {
  constructor(vendorId, productId, serialNumber = null, label) {
    this.vendorId = vendorId;
    this.productId = productId;
    this.serialNumber = serialNumber;
    this.label = label;
  }
}

export async function selectEscPosUsbDevice() {
  if (!('usb' in navigator)) throw new Error('Browser does not support WebUSB');

  const filters = [
    { classCode: 0x07 },
    { classCode: 0x07, subclassCode: 0x01 },
    { classCode: 0x07, subclassCode: 0x01, protocolCode: 0x01 },
    { classCode: 0x07, subclassCode: 0x01, protocolCode: 0x02 },
  ];

  try {
    const device = await navigator.usb.requestDevice({ filters: [{}] })
//    const device = await navigator.usb.requestDevice({ filters });
    const label = [device.manufacturerName, device.productName].filter(Boolean).join(' ') || `SN_${device.serialNumber}`;
    return new EscPosDeviceFingerprint(
      device.vendorId,
      device.productId,
      device.serialNumber || null,
      label,
    );
  } catch (e) {
    throw new Error(`Device selection cancelled or failed: ${e?.message || e}`);
  }
}

export class EscPosUsbConnector {
  #usbEventsRegistered = false;
  #device = null;
  #iface = null;
  #outEp = null;
  #outPacketSize = 64;

  #onLog = null;
  #onConnected = null;
  #onDisconnected = null;

  #onUsbConnectHandler = null;
  #onUsbDisconnectHandler = null;

  constructor({ onLog = null, onConnected = null, onDisconnected = null } = {}) {
    this.#onLog = onLog;
    this.#onConnected = onConnected;
    this.#onDisconnected = onDisconnected;

  }

  log(msg) {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    if (typeof this.#onLog === 'function') {
      this.#onLog(line);
    } else {
      console.log(line);
    }
  }

  isConnected() {
    return !!(this.#device && this.#iface != null && this.#outEp != null);
  }

  async connectWithFingerprint(fp) {
    this.log('connectWithFingerprint');
    if (!(fp instanceof EscPosDeviceFingerprint)) {
      throw new Error('Fingerprint must be an instance of EscPosDeviceFingerprint');
    }
    if (this.isConnected()) {
      this.log('Already connected');
      return;
    }
    if (!('usb' in navigator)) throw new Error('Browser does not support WebUSB');

    if (!this.#usbEventsRegistered) {
      this.#onUsbConnectHandler = async (event) => {
        if (this.#device) return;
        if (this.#isSameDevice(event.device, fp)) {
          try {
            this.log('Saved ESC/POS device connected; auto-initializing…');
            await this.#initializeDevice(event.device);
          } catch (e) {
            this.log(`Connect event init failed: ${e?.message || e}`);
          }
        }
      };

      this.#onUsbDisconnectHandler = async (event) => {
        if (event.device === this.#device) {
          this.log('Device disconnected');
          await this.#disposeDevice();
        }
      };

      navigator.usb.addEventListener('connect', this.#onUsbConnectHandler);
      navigator.usb.addEventListener('disconnect', this.#onUsbDisconnectHandler);
      this.#usbEventsRegistered = true;
    }

    const devices = await navigator.usb.getDevices();
    const match = devices.find(d => this.#isSameDevice(d, fp));
    if (!match) throw new Error('No previously authorized device matching the fingerprint. Call requestDevice() first.');

    await this.#initializeDevice(match);
  }

  async disconnect() {
    this.log('disconnect');
    await this.#disposeDevice();
    if (this.#usbEventsRegistered) {
      try {
        if (this.#onUsbConnectHandler) {
          navigator.usb.removeEventListener('connect', this.#onUsbConnectHandler);
        }
        if (this.#onUsbDisconnectHandler) {
          navigator.usb.removeEventListener('disconnect', this.#onUsbDisconnectHandler);
        }
      } finally {
        this.#onUsbConnectHandler = null;
        this.#onUsbDisconnectHandler = null;
        this.#usbEventsRegistered = false;
      }
    }
  }

  async #initializeDevice(device) {
    this.log('initializeDevice');
    await device.open();
    try {
      this.#dumpInterfaces(device);

      if (device.configuration == null) {
        await device.selectConfiguration(1);
      }

      const { configuration } = device;
      let chosenIface = null;
      let chosenAlt = null;
      let outEp = null;
      //let outPacketSize = null;

      this.log('initializeDevice find interface');
      if (configuration?.interfaces) {
        let found = false;
        for (const iface of configuration.interfaces) {
          for (const alt of iface.alternates) {
            const bulkOut = alt.endpoints?.find(ep => ep.direction === 'out' && ep.type === 'bulk');
            if (bulkOut) {
              chosenIface = iface.interfaceNumber;
              outEp = bulkOut.endpointNumber;
              //outPacketSize = bulkOut.packetSize || 64;
              chosenAlt = alt;
              found = true;
              break;
            }
          }
          if (found) break;
        }
      }

      if (chosenIface == null || outEp == null) {
        throw new Error('No suitable interface with bulk OUT endpoint found.');
      }

      this.log('initializeDevice claim interface');
      await device.claimInterface(chosenIface);
      if (chosenAlt?.alternateSetting != null) {
        await device.selectAlternateInterface(chosenIface, chosenAlt.alternateSetting);
      }

      this.#device = device;
      this.#iface = chosenIface;
      this.#outEp = outEp;
      //this.#outPacketSize = outPacketSize;

      this.log(`Connected. Interface ${this.#iface}, OUT endpoint ${this.#outEp}`);
      if (typeof this.#onConnected === 'function') this.#onConnected({ device });
      try { await this.send(new Uint8Array([0x1B, 0x40])); } catch {  }
    } catch (e) {
      this.log('initializeDevice error');
      try { this.log(`ERROR: ${e?.name || ''} ${e?.message || e}`); } catch {  }
      try { await device.close(); } catch {}
      throw e;
    }
  }

  #dumpInterfaces(device) {
    try {
      const cfg = device.configuration;
      if (!cfg) { this.log('No active USB configuration'); return; }

      this.log(
        `USB device: vid=0x${device.vendorId?.toString(16)} pid=0x${device.productId?.toString(16)} ` +
        `${device.manufacturerName || ''} ${device.productName || ''} SN=${device.serialNumber || '-'}`
      );
      this.log(`Config ${cfg.configurationValue} has ${cfg.interfaces?.length || 0} interface(s)`);

      for (const iface of cfg.interfaces || []) {
        this.log(`iface ${iface.interfaceNumber}`);
        let i = 0;
        for (const alt of iface.alternates || []) {
          const eps = (alt.endpoints || []).map(e =>
            `ep#${e.endpointNumber} ${e.direction}/${e.type} size=${e.packetSize}`
          ).join(', ');
          this.log(
            `  alt[${i++}] class=0x${(alt.interfaceClass ?? 0).toString(16)} ` +
            `sub=0x${(alt.interfaceSubclass ?? 0).toString(16)} proto=0x${(alt.interfaceProtocol ?? 0).toString(16)} ` +
            `-> [${eps || 'no endpoints'}]`
          );
        }
      }
    } catch (e) {
      this.log(`dumpInterfaces error: ${e?.message || e}`);
    }
  }

  async #disposeDevice() {
    this.log('disposeDevice');
    const d = this.#device;
    const iface = this.#iface;
    this.#device = null;
    this.#iface = null;
    this.#outEp = null;

    if (d) {
      try { if (iface != null) await d.releaseInterface(iface); } catch {}
      try { await d.close(); } catch {}
    }

    if (typeof this.#onDisconnected === 'function') this.#onDisconnected();
  }

  async sendHex(hexString) {
    this.log('sendHex');
    const bytes = this.#hexToBytes(hexString);
    if (bytes.length === 0) throw new Error('No valid hex bytes to send');
    await this.send(bytes);
  }

  async send(data) {
    if (!this.isConnected()) throw new Error('Printer not connected');

    let payload;
    if (data instanceof ArrayBuffer) {
      payload = new Uint8Array(data);
    } else if (ArrayBuffer.isView(data)) {
      payload = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } else {
      payload = new Uint8Array(data);
    }

    const packetSize = this.#outPacketSize || 64;
    let out = payload;

    if ((payload.byteLength % packetSize) === 0) {
      const padded = new Uint8Array(payload.byteLength + 1);
      padded.set(payload);
      padded[padded.length - 1] = 0x00;
      out = padded;
    }

    const res = await this.#device.transferOut(this.#outEp, out);
    if (res.status !== 'ok') throw new Error(`USB transfer failed: ${res.status}`);
  }

  #isSameDevice(device, fp) {
    const vendorMatches = device.vendorId === fp.vendorId;
    const productMatches = device.productId === fp.productId;
    const serialMatches = fp.serialNumber == null || device.serialNumber === fp.serialNumber;
    return vendorMatches && productMatches && serialMatches;
  }

  #hexToBytes(input) {
    const noLineComments = input.replace(/\/\/.*$/gm, '');
    const noBlockComments = noLineComments.replace(/\/\*[\s\S]*?\*\//g, '');
    const tokens = noBlockComments.trim().split(/[\s,;]+/).filter(Boolean);

    const out = [];
    for (let t of tokens) {
      t = t.replace(/^0x/i, '');
      if (!/^[0-9a-fA-F]+$/.test(t)) continue;
      if (t.length % 2 === 1) t = '0' + t;
      for (let i = 0; i < t.length; i += 2) {
        out.push(parseInt(t.slice(i, i + 2), 16));
      }
    }
    return new Uint8Array(out);
  }

}






