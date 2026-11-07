/* Ground Station Zero: deterministic synthetic training rules. No network I/O. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GSZEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TRAINING_KEY = 'GSZ-TRAINING-KEY-DO-NOT-USE-IN-PRODUCTION';
  const MAX_RECORDS = 5000;
  const DATASET_FIELDS = new Set(['schemaVersion', 'scenarioId', 'title', 'simulated', 'referenceTime', 'records']);
  const RECORD_FIELDS = new Set(['timestamp', 'station_id', 'sequence', 'event_type', 'signal_dbm', 'battery_pct', 'temperature_c', 'command', 'auth_result', 'message', 'signature']);
  const EVENT_TYPES = new Set(['telemetry', 'command', 'auth', 'analyst_note']);
  const AUTH_RESULTS = new Set(['allowed', 'denied', 'none']);
  const ALLOWED_COMMANDS = new Set(['PING', 'STATUS', 'SET_BEACON']);
  const CSV_FIELDS = ['timestamp', 'station_id', 'sequence', 'event_type', 'signal_dbm', 'battery_pct', 'temperature_c', 'command', 'auth_result', 'message', 'signature'];
  const keyCache = new Map();

  function fail(path, reason) { throw new Error(path + ': ' + reason); }
  function object(value, path) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.prototype.toString.call(value) !== '[object Object]') fail(path, 'must be an object, not an array or null');
  }
  function knownFields(value, allowed, path) {
    for (const key of Object.keys(value)) {
      if (!allowed.has(key)) fail(path + '.' + key, 'unknown field');
      if (value[key] === undefined) fail(path + '.' + key, 'must be a JSON value; omit irrelevant optional fields instead of setting undefined');
    }
  }
  function text(value, path, max, allowEmpty) {
    if (typeof value !== 'string') fail(path, 'must be a string');
    if (!allowEmpty && !value.trim()) fail(path, 'must not be empty');
    if (value.length > max) fail(path, 'must contain at most ' + max + ' characters');
  }
  function utcTime(value, path) {
    if (typeof value !== 'string') fail(path, 'must be an ISO UTC timestamp ending in Z');
    const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
    if (!match) fail(path, 'must be an ISO UTC timestamp ending in Z, with optional milliseconds');
    const millis = Date.parse(value);
    const normalized = match[1] + '.' + (match[2] || '').padEnd(3, '0') + 'Z';
    if (!Number.isFinite(millis) || new Date(millis).toISOString() !== normalized) fail(path, 'contains an invalid calendar date or time');
    return millis;
  }
  function numeric(value, path, min, max, integer) {
    if (typeof value !== 'number' || !Number.isFinite(value) || (integer && !Number.isSafeInteger(value)) || value < min || value > max) fail(path, 'must be a finite ' + (integer ? 'safe integer' : 'number') + ' from ' + min + ' to ' + max + '; numeric strings are not accepted');
  }

  function validateDataset(dataset) {
    object(dataset, 'dataset');
    knownFields(dataset, DATASET_FIELDS, 'dataset');
    if (dataset.schemaVersion !== 1) fail('dataset.schemaVersion', 'must be 1');
    if (dataset.simulated !== true) fail('dataset.simulated', 'must be true; this workstation accepts synthetic training data only');
    text(dataset.scenarioId, 'dataset.scenarioId', 80, false);
    text(dataset.title, 'dataset.title', 200, false);
    const referenceTime = utcTime(dataset.referenceTime, 'dataset.referenceTime');
    if (!Array.isArray(dataset.records)) fail('dataset.records', 'must be an array');
    if (dataset.records.length === 0) fail('dataset.records', 'insufficient evidence: include at least one synthetic record');
    if (dataset.records.length > MAX_RECORDS) fail('dataset.records', 'must contain no more than 5000 records');
    for (let index = 0; index < dataset.records.length; index++) {
      const row = dataset.records[index];
      const path = 'record[' + index + ']';
      object(row, path);
      knownFields(row, RECORD_FIELDS, path);
      if (utcTime(row.timestamp, path + '.timestamp') > referenceTime) fail(path + '.timestamp', 'is later than dataset.referenceTime; snapshot timestamps cannot be in the future');
      text(row.station_id, path + '.station_id', 80, false);
      numeric(row.sequence, path + '.sequence', 0, Number.MAX_SAFE_INTEGER, true);
      if (!EVENT_TYPES.has(row.event_type)) fail(path + '.event_type', 'must be telemetry, command, auth, or analyst_note');
      if (row.signal_dbm !== undefined || row.event_type === 'telemetry') numeric(row.signal_dbm, path + '.signal_dbm', -200, 50, false);
      if (row.battery_pct !== undefined || row.event_type === 'telemetry') numeric(row.battery_pct, path + '.battery_pct', 0, 100, false);
      if (row.temperature_c !== undefined) numeric(row.temperature_c, path + '.temperature_c', -273.15, 1000, false);
      if (row.command !== undefined || row.event_type === 'command') text(row.command, path + '.command', 80, false);
      if (row.auth_result !== undefined || row.event_type === 'command' || row.event_type === 'auth') {
        if (!AUTH_RESULTS.has(row.auth_result)) fail(path + '.auth_result', 'must be allowed, denied, or none');
      }
      if (row.message !== undefined) text(row.message, path + '.message', 4096, true);
      // A missing signature is evidence for INTEGRITY_FAILURE, not a parse error.
      if (row.signature !== undefined && (typeof row.signature !== 'string' || !/^[0-9a-f]{64}$/.test(row.signature))) fail(path + '.signature', 'must be 64 lowercase hexadecimal characters, or omitted to investigate missing integrity evidence');
    }
    return dataset;
  }

  function canonicalRecord(record) {
    object(record, 'record');
    const ancestors = new Set();
    function serialize(value, topLevel) {
      if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
      if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
      if (!value || typeof value !== 'object') fail('record', 'canonical signing accepts only finite JSON values');
      if (ancestors.has(value)) fail('record', 'canonical signing cannot process circular values');
      ancestors.add(value);
      let result;
      if (Array.isArray(value)) {
        const items = [];
        for (let index = 0; index < value.length; index++) {
          if (!Object.prototype.hasOwnProperty.call(value, index)) fail('record', 'canonical signing cannot process sparse arrays; use explicit JSON null values');
          items.push(serialize(value[index], false));
        }
        result = '[' + items.join(',') + ']';
      } else {
        object(value, 'record');
        result = '{' + Object.keys(value).filter(function (key) { return !(topLevel && key === 'signature'); }).sort().map(function (key) { return JSON.stringify(key) + ':' + serialize(value[key], false); }).join(',') + '}';
      }
      ancestors.delete(value);
      return result;
    }
    return serialize(record, true);
  }

  function cryptoProvider() {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) return globalThis.crypto;
    if (typeof require === 'function') return require('node:crypto').webcrypto;
    throw new Error('Web Crypto is unavailable. Open this file in a current browser or use a local static server.');
  }
  async function signRecord(record, key) {
    if (key === undefined) key = TRAINING_KEY;
    text(key, 'key', 4096, false);
    const provider = cryptoProvider();
    const encoder = new TextEncoder();
    let imported = keyCache.get(key);
    if (!imported) {
      imported = provider.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      keyCache.set(key, imported);
    }
    const signature = await provider.subtle.sign('HMAC', await imported, encoder.encode(canonicalRecord(record)));
    return Array.from(new Uint8Array(signature), function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
  }

  async function analyzeDataset(dataset) {
    validateDataset(dataset);
    const referenceTime = Date.parse(dataset.referenceTime);
    const findings = [];
    const stations = new Map();
    function add(code, severity, title, detail, indexes, station) {
      findings.push({ code: code, severity: severity, title: title, detail: detail, recordIndexes: indexes, station_id: station });
    }
    // Capture signatures before the asynchronous work; callers retain ownership of their dataset.
    const rows = dataset.records.map(function (row) { return Object.assign({}, row); });
    const signatures = await Promise.all(rows.map(function (row) { return signRecord(row); }));
    rows.forEach(function (row, index) {
      let state = stations.get(row.station_id);
      if (!state) {
        state = { seen: new Map(), previous: null, telemetry: null, denied: [] };
        stations.set(row.station_id, state);
      }
      const time = Date.parse(row.timestamp);
      if (!row.signature || row.signature !== signatures[index]) add('INTEGRITY_FAILURE', 'critical', 'Record integrity check failed', 'Record index ' + index + ' has ' + (!row.signature ? 'no signature' : 'a signature that does not match its signed fields') + '. The public training HMAC key demonstrates integrity checks; anyone with this key can forge records.', [index], row.station_id);
      if (state.seen.has(row.sequence)) add('REPLAY', 'high', 'Sequence number was repeated', 'Record index ' + index + ' repeats sequence ' + row.sequence + ' first seen at index ' + state.seen.get(row.sequence) + ' for this station. A duplicate is evidence to investigate, not proof of an attacker.', [index], row.station_id);
      if (state.previous && row.sequence > state.previous.sequence + 1) add('SEQUENCE_GAP', 'medium', 'Sequence gap in arrival order', 'Record index ' + index + ' advances from sequence ' + state.previous.sequence + ' at index ' + state.previous.index + ' to ' + row.sequence + '. Missing rows or transport loss are possible explanations.', [index], row.station_id);
      if (state.previous && time < state.previous.time) add('TIME_REVERSAL', 'high', 'Timestamp decreased in arrival order', 'Record index ' + index + ' is earlier than the previous arrival for this station at index ' + state.previous.index + '. Check clock changes and delayed delivery before attributing intent.', [index], row.station_id);
      if (row.event_type === 'telemetry') {
        if (typeof row.signal_dbm === 'number' && row.signal_dbm < -100) add('LOW_SIGNAL', 'medium', 'Signal below training threshold', 'Record index ' + index + ' reports ' + row.signal_dbm + ' dBm, below -100 dBm. Obstruction, weather, hardware or interference may explain a weak signal.', [index], row.station_id);
        if (typeof row.battery_pct === 'number' && row.battery_pct < 20) add('LOW_BATTERY', 'medium', 'Battery below training threshold', 'Record index ' + index + ' reports battery ' + row.battery_pct + '%, below 20%. This is a simulated operational concern, not evidence of compromise by itself.', [index], row.station_id);
        if (!state.telemetry || time >= state.telemetry.time) state.telemetry = { time: time, index: index };
      }
      if (row.event_type === 'command' && (row.auth_result !== 'allowed' || !ALLOWED_COMMANDS.has(row.command))) add('COMMAND_REJECTED', 'high', 'Command failed the training policy', 'Record index ' + index + ' requests ' + row.command + ' with auth_result=' + row.auth_result + '. ' + (row.auth_result !== 'allowed' ? 'Explicit allowed authorization is required. ' : '') + (!ALLOWED_COMMANDS.has(row.command) ? 'The command is outside PING, STATUS and SET_BEACON. ' : '') + 'This analyzer flags the request; it does not control equipment.', [index], row.station_id);
      if (row.event_type === 'auth' && row.auth_result === 'denied') state.denied.push({ time: time, index: index });
      if (typeof row.message === 'string' && /ignore\s+previous|system\s+prompt|send\s+secrets/i.test(row.message)) add('INJECTION_MARKER', 'medium', 'Training injection marker found', 'Record index ' + index + ' matches the training-string heuristic: ignore previous, system prompt, or send secrets. This is a text pattern check, not an AI evaluation or proof that instructions executed. Treat the message as untrusted evidence.', [index], row.station_id);
      if (!state.seen.has(row.sequence)) state.seen.set(row.sequence, index);
      state.previous = { sequence: row.sequence, time: time, index: index };
    });
    stations.forEach(function (state, station) {
      const denied = state.denied.slice().sort(function (a, b) { return a.time - b.time || a.index - b.index; });
      let start = 0;
      for (let end = 0; end < denied.length; end++) {
        while (denied[end].time - denied[start].time > 300000) start++;
        if (end - start + 1 >= 3) {
          const evidence = denied.slice(start, end + 1).map(function (entry) { return entry.index; }).sort(function (a, b) { return a - b; });
          add('AUTH_FAILURE_BURST', 'high', 'Denied authentication burst', 'Record indexes ' + evidence.join(', ') + ' contain at least three denied auth events for this station within an inclusive 300-second window. Investigate mistyped or expired credentials as counter-evidence.', evidence, station);
          break;
        }
      }
      if (state.telemetry) {
        const age = (referenceTime - state.telemetry.time) / 1000;
        if (age > 300) add('STALE_TELEMETRY', 'medium', 'Latest telemetry is stale', 'The latest telemetry by timestamp is record index ' + state.telemetry.index + ', ' + age + ' seconds before the fixed dataset referenceTime. The threshold is strictly greater than 300 seconds. This is a snapshot, not live monitoring.', [state.telemetry.index], station);
      }
    });
    const summary = { records: rows.length, total: findings.length, critical: 0, high: 0, medium: 0, low: 0 };
    findings.forEach(function (finding) { summary[finding.severity]++; });
    return { findings: findings, summary: summary };
  }

  function escapeMarkdown(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/([\\`*_{}\[\]()#+=.!|~\-])/g, '\\$1');
  }
  function toMarkdown(dataset, result, notes) {
    validateDataset(dataset);
    if (!result || !Array.isArray(result.findings) || !result.summary) throw new Error('Analysis result is required before exporting a Markdown report.');
    const s = result.summary;
    const lines = [
      '# Ground Station Zero evidence report', '',
      '## Case', '',
      '**Dataset:** ' + escapeMarkdown(dataset.title),
      '**Scenario:** ' + escapeMarkdown(dataset.scenarioId),
      '**Fixed reference time:** ' + escapeMarkdown(dataset.referenceTime),
      '**Provenance:** synthetic educational records; not live spacecraft telemetry.', '',
      '## Analysis summary', '',
      '| Records | Findings | Critical | High | Medium | Low |',
      '| ---: | ---: | ---: | ---: | ---: | ---: |',
      '| ' + [s.records, s.total, s.critical, s.high, s.medium, s.low].map(escapeMarkdown).join(' | ') + ' |', '',
      '## Findings', ''
    ];
    if (!result.findings.length) lines.push('No configured training rules fired. This does not prove a system is secure.', '');
    result.findings.forEach(function (finding, index) {
      lines.push('### ' + (index + 1) + '. ' + escapeMarkdown(finding.title), '',
        '**Rule:** ' + escapeMarkdown(finding.code) + ' · **Severity:** ' + escapeMarkdown(finding.severity) + ' · **Station:** ' + escapeMarkdown(finding.station_id),
        '**Evidence indexes (zero-based):** ' + escapeMarkdown(Array.isArray(finding.recordIndexes) ? finding.recordIndexes.join(', ') : ''), '', escapeMarkdown(finding.detail), '');
    });
    lines.push('## Analyst notes', '', escapeMarkdown(notes || 'No analyst notes recorded.'), '',
      '## Evidence interpretation and limits', '',
      'These fixed-time synthetic fixtures teach investigation and counter-evidence. Findings identify configured conditions; they do not establish attacker intent.', '',
      'The HMAC SHA-256 key is public training material. Anyone holding it can forge signatures. This is not spacecraft authentication or production security.', '',
      'The injection marker is a training-string heuristic, not an AI evaluation. No message is executed by this lab.', '');
    return lines.join('\n');
  }
  function toCSV(dataset) {
    validateDataset(dataset);
    function cell(value) {
      let str = value === undefined ? '' : String(value);
      // Spreadsheet applications may interpret formula prefixes after whitespace.
      if (typeof value === 'string' && (/^[\s\u0000-\u001f]*[=+\-@]/.test(str) || /^[\t\r\n]/.test(str))) str = "'" + str;
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return [CSV_FIELDS.map(cell).join(',')].concat(dataset.records.map(function (row) { return CSV_FIELDS.map(function (key) { return cell(row[key]); }).join(','); })).join('\r\n') + '\r\n';
  }

  return Object.freeze({ TRAINING_KEY: TRAINING_KEY, validateDataset: validateDataset, canonicalRecord: canonicalRecord, signRecord: signRecord, analyzeDataset: analyzeDataset, toMarkdown: toMarkdown, toCSV: toCSV });
});
