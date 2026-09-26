const BLE_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const BLE_RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const BLE_TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

const CMD = {
  APP_START: 0x01,
  DEVICE_QUERY: 0x16,
  GET_CUSTOM_VARS: 0x28,
  SET_CUSTOM_VAR: 0x29,
  GET_ALLOWED_REPEAT_FREQ: 0x3c,
  GET_AUTO_REPLY_RULE: 0x42,
  SET_AUTO_REPLY_RULE: 0x43,
};
const RESP = {
  OK: 0x00,
  ERROR: 0x01,
  SELF_INFO: 0x05,
  DEVICE_INFO: 0x0d,
  CUSTOM_VARS: 0x15,
  ALLOWED_REPEAT_FREQ: 0x1a,
  AUTO_REPLY_RULE: 0x1e,
};

const el = {
  status: document.querySelector("#status"),
  connect: document.querySelector("#connectButton"),
  disconnect: document.querySelector("#disconnectButton"),
  enabled: document.querySelector("#autopongEnabled"),
  location: document.querySelector("#locationInput"),
  save: document.querySelector("#saveButton"),
  ruleList: document.querySelector("#ruleList"),
  saveRules: document.querySelector("#saveRulesButton"),
  hint: document.querySelector("#supportHint"),
  version: document.querySelector("#moduleVersion"),
  locationCounter: document.querySelector("#locationCounter"),
  repeaterPanel: document.querySelector("#repeaterPanel"),
  repeaterState: document.querySelector("#repeaterState"),
  repeaterBadge: document.querySelector("#repeaterBadge"),
  repeaterHint: document.querySelector("#repeaterHint"),
  radioProfile: document.querySelector("#radioProfile"),
  allowedRepeatFrequencies: document.querySelector("#allowedRepeatFrequencies"),
};

const state = {
  device: null,
  server: null,
  rx: null,
  tx: null,
  waiters: [],
  repeatEnabled: null,
  repeatSupported: null,
  currentRadio: null,
  allowedRepeatRanges: [],
  rules: Array.from({ length: 4 }, () => ({ channel: "", keyword: "", text: "" })),
};

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
  el.saveRules.disabled = !connected;
  el.ruleList.querySelectorAll("input, button").forEach((control) => { control.disabled = !connected; });
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

function buildAppStart() {
  const name = new TextEncoder().encode("Auto-Pong Location");
  const packet = new Uint8Array(8 + name.length);
  packet[0] = CMD.APP_START;
  packet[1] = 0x01;
  packet.set(name, 8);
  return packet;
}

function readU32(packet, offset) {
  if (offset + 3 >= packet.length) return null;
  return (packet[offset] | (packet[offset + 1] << 8) | (packet[offset + 2] << 16) | (packet[offset + 3] << 24)) >>> 0;
}

function parseDeviceInfo(packet) {
  state.repeatEnabled = packet.length > 80 ? packet[80] !== 0 : null;
  renderRepeaterStatus();
}

function parseSelfInfo(packet) {
  const freq = readU32(packet, 48);
  const bw = readU32(packet, 52);
  const sf = packet[56];
  const cr = packet[57];
  state.currentRadio = freq ? { freq, bw, sf, cr } : null;
  renderRepeaterStatus();
}

function parseAllowedRepeatFrequencies(packet) {
  const ranges = [];
  for (let offset = 1; offset + 7 < packet.length; offset += 8) {
    const lower = readU32(packet, offset);
    const upper = readU32(packet, offset + 4);
    if (lower != null && upper != null) ranges.push({ lower, upper });
  }
  state.allowedRepeatRanges = ranges;
  state.repeatSupported = true;
  renderRepeaterStatus();
}

function formatFrequency(khz) {
  return `${(khz / 1000).toLocaleString("de-DE", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} MHz`;
}

function formatAllowedRanges() {
  return state.allowedRepeatRanges.map(({ lower, upper }) => lower === upper
    ? formatFrequency(lower)
    : `${formatFrequency(lower)}–${formatFrequency(upper)}`
  ).join(", ");
}

function renderRepeaterStatus() {
  const connected = Boolean(state.rx);
  const currentFrequency = state.currentRadio?.freq;
  const currentAllowed = currentFrequency == null || !state.allowedRepeatRanges.length
    || state.allowedRepeatRanges.some(({ lower, upper }) => currentFrequency >= lower && currentFrequency <= upper);
  let status = "unknown";
  let label = connected ? "Wird gelesen …" : "Nicht verbunden";
  let badge = "Status";
  let hint = connected ? "Repeater-Status wird aus der Firmware gelesen." : "Nach dem Verbinden wird der Status direkt aus der Companion-Firmware gelesen.";

  if (connected && state.repeatEnabled === true) {
    status = currentAllowed ? "active" : "misconfigured";
    label = currentAllowed ? "Aktiv" : "Aktiv, Profil prüfen";
    badge = currentAllowed ? "Ein" : "Warnung";
    hint = currentAllowed
      ? "Der Companion leitet geeignete Mesh-Pakete weiter."
      : `Die aktuelle Frequenz ${formatFrequency(currentFrequency)} liegt nicht im freigegebenen Bereich.`;
  } else if (connected && state.repeatEnabled === false) {
    status = "inactive";
    label = "Aus";
    badge = "Bereit";
    hint = "Der Repeater kann in der MeshCore-App zugeschaltet werden.";
  } else if (connected && state.repeatSupported === false) {
    status = "unsupported";
    label = "Nicht verfügbar";
    badge = "Firmware";
    hint = "Diese Firmware meldet keine erlaubten Repeater-Frequenzen.";
  }

  el.repeaterPanel.dataset.state = status;
  el.repeaterState.textContent = label;
  el.repeaterBadge.textContent = badge;
  el.repeaterHint.textContent = hint;
  el.radioProfile.textContent = state.currentRadio
    ? `${formatFrequency(state.currentRadio.freq)}, BW ${(state.currentRadio.bw / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} kHz, SF${state.currentRadio.sf}, CR${state.currentRadio.cr}`
    : "–";
  el.allowedRepeatFrequencies.textContent = state.allowedRepeatRanges.length ? formatAllowedRanges() : "–";
}

async function readRepeaterStatus() {
  try {
    const selfInfo = waitFor([RESP.SELF_INFO]);
    await send(buildAppStart());
    parseSelfInfo(await selfInfo);
  } catch {
    state.repeatSupported = false;
    renderRepeaterStatus();
    return;
  }

  try {
    const allowed = waitFor([RESP.ALLOWED_REPEAT_FREQ]);
    await send(Uint8Array.of(CMD.GET_ALLOWED_REPEAT_FREQ));
    parseAllowedRepeatFrequencies(await allowed);
  } catch {
    state.repeatSupported = false;
    renderRepeaterStatus();
  }
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
  updateLocationCounter();
}

async function setVariable(name, value) {
  const response = waitFor([RESP.OK]);
  await send(encodeCommand(CMD.SET_CUSTOM_VAR, `${name}:${value}`));
  await response;
}

function decodeCString(packet, start) {
  const end = packet.indexOf(0, start);
  return { value: new TextDecoder().decode(packet.slice(start, end < 0 ? packet.length : end)), next: end < 0 ? packet.length : end + 1 };
}

function renderRules() {
  el.ruleList.innerHTML = state.rules.map((rule, index) => `
    <article class="rule" data-slot="${index + 1}">
      <div class="rule-head"><strong>Regel ${index + 1}</strong><button class="rule-delete" type="button" data-delete-slot="${index + 1}">Leeren</button></div>
      <div class="rule-grid">
        <label class="form-field"><span class="field-label">Kanal</span><input data-field="channel" maxlength="31" placeholder="z. B. public" autocomplete="off" value="${escapeAttribute(rule.channel)}"><span class="field-meta"><span>Ohne führendes # möglich</span><span data-counter>${rule.channel.length} / 31</span></span></label>
        <label class="form-field"><span class="field-label">Schlüsselwort</span><input data-field="keyword" maxlength="31" placeholder="z. B. hallo" autocomplete="off" value="${escapeAttribute(rule.keyword)}"><span class="field-meta"><span>Groß-/Kleinschreibung egal</span><span data-counter>${rule.keyword.length} / 31</span></span></label>
        <label class="form-field rule-text"><span class="field-label">Antworttext</span><input data-field="text" maxlength="95" placeholder="z. B. Hallo {name}, Standort {plz}." autocomplete="off" value="${escapeAttribute(rule.text)}"><span class="field-meta"><span>Platzhalter sind erlaubt</span><span data-counter>${rule.text.length} / 95</span></span></label>
      </div>
    </article>`).join("");
  updateUi(Boolean(state.rx));
}

function updateLocationCounter() {
  el.locationCounter.textContent = `${el.location.value.length} / ${el.location.maxLength}`;
}

function updateRuleCounter(input) {
  const counter = input.closest(".form-field")?.querySelector("[data-counter]");
  if (counter) counter.textContent = `${input.value.length} / ${input.maxLength}`;
}

function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function readRulesFromForm() {
  return [...el.ruleList.querySelectorAll(".rule")].map((row) => ({
    channel: row.querySelector('[data-field="channel"]').value.trim().replace(/^#/, ""),
    keyword: row.querySelector('[data-field="keyword"]').value.trim(),
    text: row.querySelector('[data-field="text"]').value.trim(),
  }));
}

function validateRuleForm(rules) {
  let firstMissing = null;
  [...el.ruleList.querySelectorAll(".rule")].forEach((row, index) => {
    const inputs = [...row.querySelectorAll("input[data-field]")];
    const values = Object.values(rules[index]);
    const incomplete = values.some(Boolean) && !values.every(Boolean);
    inputs.forEach((input) => {
      const missing = incomplete && !input.value.trim();
      input.toggleAttribute("aria-invalid", missing);
      input.setCustomValidity(missing ? "Bitte alle drei Felder dieser Regel ausfüllen." : "");
      if (missing && !firstMissing) firstMissing = input;
    });
  });
  if (!firstMissing) return true;
  firstMissing.reportValidity();
  firstMissing.focus();
  return false;
}

async function getRule(slot) {
  const response = waitFor([RESP.AUTO_REPLY_RULE]);
  await send(Uint8Array.of(CMD.GET_AUTO_REPLY_RULE, slot));
  const packet = await response;
  if (packet[1] !== slot) throw new Error(`Unerwartete Antwort für Regel ${slot}.`);
  const channel = decodeCString(packet, 2);
  const keyword = decodeCString(packet, channel.next);
  const text = decodeCString(packet, keyword.next);
  return { channel: channel.value, keyword: keyword.value, text: text.value };
}

async function loadRules() {
  const rules = [];
  for (let slot = 1; slot <= 4; slot += 1) rules.push(await getRule(slot));
  state.rules = rules;
  renderRules();
}

async function setRule(slot, rule) {
  if (!rule.channel && !rule.keyword && !rule.text) {
    const response = waitFor([RESP.OK]);
    await send(Uint8Array.of(CMD.SET_AUTO_REPLY_RULE, slot));
    await response;
    return;
  }
  if (!rule.channel || !rule.keyword || !rule.text) throw new Error(`Regel ${slot}: Kanal, Schlüsselwort und Antworttext müssen gesetzt sein.`);
  const values = [rule.channel, rule.keyword, rule.text];
  const encoded = values.map((value) => new TextEncoder().encode(value));
  const packet = new Uint8Array(2 + encoded.reduce((length, value) => length + value.length + 1, 0));
  packet[0] = CMD.SET_AUTO_REPLY_RULE;
  packet[1] = slot;
  let offset = 2;
  for (const value of encoded) {
    packet.set(value, offset);
    offset += value.length + 1;
  }
  const response = waitFor([RESP.OK]);
  await send(packet);
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
    parseDeviceInfo(await deviceInfo);
    await readRepeaterStatus();
    await readSettings();
    await loadRules();
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
  state.repeatEnabled = null;
  state.repeatSupported = null;
  state.currentRadio = null;
  state.allowedRepeatRanges = [];
  renderRepeaterStatus();
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

async function saveRules() {
  try {
    el.saveRules.disabled = true;
    setStatus("Speichere Auto-Reply-Regeln ...");
    const rules = readRulesFromForm();
    if (!validateRuleForm(rules)) {
      setStatus("Unvollständige Regel: Bitte Kanal, Schlüsselwort und Antworttext ausfüllen.", "error");
      return;
    }
    for (let index = 0; index < rules.length; index += 1) await setRule(index + 1, rules[index]);
    state.rules = rules;
    setStatus("Auto-Reply-Regeln gespeichert", "connected");
  } catch (error) {
    setStatus(error.message || "Regeln konnten nicht gespeichert werden.", "error");
  } finally {
    el.saveRules.disabled = !state.rx;
  }
}

if (!("bluetooth" in navigator)) {
  el.hint.textContent = "Dieser Browser unterstuetzt Web Bluetooth nicht. Bitte Chrome oder Edge verwenden.";
  setStatus("Web Bluetooth nicht verfuegbar", "error");
}

el.connect.addEventListener("click", connect);
el.disconnect.addEventListener("click", () => state.device?.gatt?.disconnect());
el.save.addEventListener("click", save);
el.saveRules.addEventListener("click", saveRules);
el.location.addEventListener("input", updateLocationCounter);
el.ruleList.addEventListener("input", (event) => {
  if (event.target.matches("input[data-field]")) {
    event.target.removeAttribute("aria-invalid");
    event.target.setCustomValidity("");
    updateRuleCounter(event.target);
  }
});
el.ruleList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-slot]");
  if (!button) return;
  const row = button.closest(".rule");
  row.querySelectorAll("input").forEach((input) => {
    input.value = "";
    updateRuleCounter(input);
  });
});
loadVersion();
renderRules();
updateUi(false);
updateLocationCounter();
renderRepeaterStatus();
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("service-worker.js").catch(() => {});
