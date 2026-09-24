const BLE_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const BLE_RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const BLE_TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

const CMD = { DEVICE_QUERY: 0x16, GET_CUSTOM_VARS: 0x28, SET_CUSTOM_VAR: 0x29 };
const RESP = { OK: 0x00, ERROR: 0x01, DEVICE_INFO: 0x0d, CUSTOM_VARS: 0x15 };

const el = {
  status: document.querySelector("#status"),
  connect: document.querySelector("#connectButton"),
  disconnect: document.querySelector("#disconnectButton"),
  enabled: document.querySelector("#autopongEnabled"),
  location: document.querySelector("#locationInput"),
  save: document.querySelector("#saveButton"),
  hint: document.querySelector("#supportHint"),
  version: document.querySelector("#moduleVersion"),
};

const state = { device: null, server: null, rx: null, tx: null, waiters: [] };

async function loadVersion() {
  try {
    const metadata = await fetch("version.json", { cache: "no-store" }).then((response) => response.json());
    el.version.textContent = `v${metadata.version}`;
  } catch {}
}

function setStatus(text, type = "") {
  el.status.textContent = text;
  el.status.className = `status ${type}`;
}

function updateUi(connected = Boolean(state.rx)) {
  el.connect.disabled = connected || !("bluetooth" in navigator);
  el.disconnect.disabled = !connected;
  el.enabled.disabled = !connected;
  el.location.disabled = !connected;
  el.save.disabled = !connected;
}

function waitFor(codes, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const waiter = { codes, resolve, reject, timer: 0 };
    waiter.timer = window.setTimeout(() => {
      state.waiters = state.waiters.filter((entry) => entry !== waiter);
      reject(new Error("Keine Antwort vom MeshCore-Geraet."));
    }, timeout);
    state.waiters.push(waiter);
  });
}

function handleNotification(event) {
  const packet = new Uint8Array(event.target.value.buffer, event.target.value.byteOffset, event.target.value.byteLength);
  const index = state.waiters.findIndex((waiter) => waiter.codes.includes(packet[0]) || packet[0] === RESP.ERROR);
  if (index < 0) return;
  const [waiter] = state.waiters.splice(index, 1);
  window.clearTimeout(waiter.timer);
  if (packet[0] === RESP.ERROR) waiter.reject(new Error(`Firmware lehnt die Anfrage ab (Fehler ${packet[1] ?? "?"}).`));
  else waiter.resolve(packet);
}

async function send(payload) {
  if (!state.rx) throw new Error("Nicht verbunden.");
  if (typeof state.rx.writeValueWithResponse === "function") await state.rx.writeValueWithResponse(payload);
  else await state.rx.writeValue(payload);
}

function encodeCommand(command, value = "") {
  const bytes = new TextEncoder().encode(value);
  const packet = new Uint8Array(1 + bytes.length);
  packet[0] = command;
  packet.set(bytes, 1);
  return packet;
}

function parseVariables(packet) {
  const text = new TextDecoder().decode(packet.slice(1)).replace(/\0+$/g, "");
  return Object.fromEntries(text.split(",").filter(Boolean).map((entry) => {
    const separator = entry.indexOf(":");
    return [entry.slice(0, separator), entry.slice(separator + 1)];
  }));
}

async function readSettings() {
  const response = waitFor([RESP.CUSTOM_VARS]);
  await send(Uint8Array.of(CMD.GET_CUSTOM_VARS));
  const variables = parseVariables(await response);
  if (!("autopong" in variables) || !("autopong_loc" in variables)) {
    throw new Error("Firmware ohne Auto-Pong-Custom-Variables. Bitte autoreply-v1.0.5 oder neuer flashen.");
  }
  el.enabled.checked = variables.autopong === "1";
  el.location.value = variables.autopong_loc;
}

async function setVariable(name, value) {
  const response = waitFor([RESP.OK]);
  await send(encodeCommand(CMD.SET_CUSTOM_VAR, `${name}:${value}`));
  await response;
}

async function connect() {
  try {
    if (!window.isSecureContext) throw new Error("Web Bluetooth benoetigt localhost, 127.0.0.1 oder HTTPS.");
    setStatus("Bluetooth-Geraet auswaehlen ...");
    const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [BLE_SERVICE_UUID] }], optionalServices: [BLE_SERVICE_UUID] });
    state.device = device;
    device.addEventListener("gattserverdisconnected", disconnected, { once: true });
    state.server = await device.gatt.connect();
    const service = await state.server.getPrimaryService(BLE_SERVICE_UUID);
    state.rx = await service.getCharacteristic(BLE_RX_UUID);
    state.tx = await service.getCharacteristic(BLE_TX_UUID);
    state.tx.addEventListener("characteristicvaluechanged", handleNotification);
    await state.tx.startNotifications();

    const deviceInfo = waitFor([RESP.DEVICE_INFO]);
    await send(Uint8Array.of(CMD.DEVICE_QUERY, 0x03));
    await deviceInfo;
    await readSettings();
    updateUi(true);
    setStatus(`${device.name || "MeshCore"} verbunden`, "connected");
  } catch (error) {
    if (error.name === "NotFoundError") setStatus("Keine Bluetooth-Verbindung ausgewaehlt.");
    else setStatus(error.message || "Bluetooth-Verbindung fehlgeschlagen.", "error");
    if (state.device?.gatt?.connected) state.device.gatt.disconnect();
  }
}

function disconnected() {
  state.tx?.removeEventListener("characteristicvaluechanged", handleNotification);
  for (const waiter of state.waiters.splice(0)) {
    window.clearTimeout(waiter.timer);
    waiter.reject(new Error("Bluetooth-Verbindung getrennt."));
  }
  state.server = null;
  state.rx = null;
  state.tx = null;
  updateUi(false);
  setStatus("Nicht verbunden");
}

async function save() {
  try {
    el.save.disabled = true;
    setStatus("Speichere Einstellungen ...");
    await setVariable("autopong", el.enabled.checked ? "1" : "0");
    await setVariable("autopong_loc", el.location.value.trim() || "clear");
    setStatus("Einstellungen gespeichert", "connected");
  } catch (error) {
    setStatus(error.message || "Speichern fehlgeschlagen.", "error");
  } finally {
    el.save.disabled = !state.rx;
  }
}

if (!("bluetooth" in navigator)) {
  el.hint.textContent = "Dieser Browser unterstuetzt Web Bluetooth nicht. Bitte Chrome oder Edge verwenden.";
  setStatus("Web Bluetooth nicht verfuegbar", "error");
}

el.connect.addEventListener("click", connect);
el.disconnect.addEventListener("click", () => state.device?.gatt?.disconnect());
el.save.addEventListener("click", save);
loadVersion();
updateUi(false);
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("service-worker.js").catch(() => {});
