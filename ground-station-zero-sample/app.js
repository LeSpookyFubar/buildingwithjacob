/* Ground Station Zero. Local-only UI; no remote resources or network requests. */
(function () {
  'use strict';
  const $ = function (id) { return document.getElementById(id); };
  const MAX_FILE_BYTES = 4 * 1024 * 1024;
  const MAX_NOTES = 12000;
  const MAX_IMPORTED = 12;
  let SAVE_KEY;
  let OPT_IN_KEY;
  const PAGE_SIZE = 25;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const state = { cases: [], selected: '', page: 0, findingPage: 0, rowFocus: null, localSave: false, importCounter: 0, printMode: false };
  let engine;
  let saveTimer;

  function node(tag, className, content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = content;
    return element;
  }
  function svgNode(tag, attributes, content) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.keys(attributes || {}).forEach(function (key) { element.setAttribute(key, attributes[key]); });
    if (content !== undefined) element.textContent = content;
    return element;
  }
  function replace(id, children) { $(id).replaceChildren.apply($(id), children); }
  function currentCase() { return state.cases.find(function (item) { return item.key === state.selected; }); }
  function titleText(title) { return title.replace(/^\d{2}\s*\/\s*/, ''); }
  function formatCount(value) { return value.toLocaleString('en-US'); }
  function pad(value) { return String(value).padStart(2, '0'); }
  function utcDisplay(value) { return value.replace('T', ' ').replace(/\.000Z$/, 'Z').replace('Z', ' UTC'); }
  function announce(message, isError) {
    $('notice').textContent = message;
    $('notice').classList.toggle('error', Boolean(isError));
    $('notice').setAttribute('role', isError ? 'alert' : 'status');
    $('notice').hidden = false;
    // Keep errors visible; success messages remain until the next action or case change.
  }
  function safeMessage(error) { return error instanceof Error ? error.message : 'The operation could not be completed.'; }
  function resetEvidenceFilters() {
    state.page = 0;
    state.findingPage = 0;
    state.rowFocus = null;
    $('event-search').value = '';
    $('event-type').value = 'all';
    $('severity-filter').value = 'all';
  }

  function renderNavigation() {
    const bundled = [];
    const imported = [];
    state.cases.forEach(function (item) {
      const button = node('button', 'mission-button' + (item.key === state.selected ? ' active' : ''));
      button.type = 'button';
      if (item.key === state.selected) button.setAttribute('aria-current', 'page');
      const index = node('span', 'mission-index', item.imported ? '↑' : pad(item.number));
      index.setAttribute('aria-hidden', 'true');
      const text = node('span', 'mission-text');
      text.append(node('span', 'mission-name', titleText(item.mission.title)), node('span', 'mission-caption', item.imported ? 'Imported synthetic case' : item.mission.difficulty + ' exercise'));
      const arrow = node('span', 'mission-arrow', '→');
      arrow.setAttribute('aria-hidden', 'true');
      button.append(index, text, arrow);
      button.addEventListener('click', function () { selectCase(item.key, true); });
      (item.imported ? imported : bundled).push(button);
    });
    replace('mission-list', bundled);
    replace('import-list', imported);
    $('imported-nav').hidden = imported.length === 0;
    $('mission-count').textContent = pad(bundled.length);
  }

  function selectCase(key, focusMission) {
    if (!state.cases.some(function (item) { return item.key === key; })) return;
    state.selected = key;
    resetEvidenceFilters();
    $('notice').hidden = true;
    renderNavigation();
    if (focusMission) {
      const selectedButton = document.querySelector('.mission-button.active');
      if (selectedButton) selectedButton.focus({ preventScroll: true });
    }
    renderCase();
    scheduleSave();
  }

  function renderCase() {
    const item = currentCase();
    if (!item) return;
    const dataset = item.dataset;
    $('mission-number').textContent = item.imported ? 'IMPORTED CASE' : 'MISSION ' + pad(item.number);
    $('difficulty').textContent = item.imported ? 'SYNTHETIC EVIDENCE' : item.mission.difficulty.toUpperCase();
    $('mission-title').textContent = titleText(dataset.title);
    $('mission-subtitle').textContent = item.mission.subtitle;
    $('reference-time').textContent = utcDisplay(dataset.referenceTime);
    $('mission-brief').textContent = item.mission.brief;
    replace('objectives-list', item.mission.objectives.map(function (text) { return node('li', '', text); }));
    replace('tasks-list', item.mission.tasks.map(function (text) { return node('li', '', text); }));
    $('analyst-notes').value = item.notes;
    $('notes-count').textContent = formatCount(item.notes.length) + ' / 12,000';
    $('local-save').checked = state.localSave;
    document.title = titleText(dataset.title) + ' — Ground Station Zero';
    renderAnalysis();
    renderChart(dataset);
    renderEvents();
  }

  function renderAnalysis() {
    const item = currentCase();
    const result = item.result;
    $('stat-records').textContent = formatCount(item.dataset.records.length);
    ['critical', 'high', 'medium', 'low'].forEach(function (severity) { $('stat-' + severity).textContent = result ? formatCount(result.summary[severity]) : '—'; });
    $('finding-total').textContent = result ? pad(result.summary.total) : '—';
    $('analyze-button').disabled = item.analyzing;
    $('analyze-button').replaceChildren(node('span', '', item.analyzing ? '·' : '+'), document.createTextNode(item.analyzing ? 'Analyzing…' : result ? 'Run checks again' : 'Analyze evidence'), node('span', '', '→'));
    $('analyze-button').setAttribute('aria-busy', String(Boolean(item.analyzing)));
    $('case-status').replaceChildren(node('span', 'status-square'), document.createTextNode(item.analyzing ? 'RUNNING CHECKS' : result ? 'ANALYSIS COMPLETE' : 'DATASET READY'), node('span', 'status-divider', '/'), document.createTextNode(item.analyzing ? 'Checking synthetic evidence' : result ? result.summary.total + ' finding' + (result.summary.total === 1 ? '' : 's') + ' · Fixed snapshot' : 'Awaiting analysis'));
    $('markdown-button').disabled = !result || item.analyzing;
    $('print-button').disabled = !result || item.analyzing;
    renderFindings();
  }

  function emptyFinding(title, detail, icon) {
    const empty = node('div', 'empty-state');
    const graphic = node('span', 'empty-icon', icon || '+');
    graphic.setAttribute('aria-hidden', 'true');
    empty.append(graphic, node('strong', '', title), node('p', '', detail));
    return empty;
  }

  function renderFindings() {
    const item = currentCase();
    if (!item.result) {
      replace('findings-list', [emptyFinding(item.analyzing ? 'Checking the evidence…' : 'The evidence is ready.', 'Run the rule checks, then inspect each finding and its source rows.')]);
      return;
    }
    if (item.result.findings.length === 0) {
      replace('findings-list', [emptyFinding('No rule violations detected.', 'Use this baseline to explain the checks and their limits. Zero findings does not establish that a system is secure.', '✓')]);
      return;
    }
    const severity = state.printMode ? 'all' : $('severity-filter').value;
    const findings = item.result.findings.filter(function (finding) { return severity === 'all' || finding.severity === severity; });
    if (!findings.length) {
      replace('findings-list', [emptyFinding('No findings at this severity.', 'Choose another severity to inspect the evidence.', '✓')]);
      return;
    }
    const findingStart = state.printMode ? 0 : state.findingPage * PAGE_SIZE;
    const articles = (state.printMode ? findings : findings.slice(findingStart, findingStart + PAGE_SIZE)).map(function (finding) {
      const article = node('article', 'finding');
      const top = node('div', 'finding-topline');
      top.append(node('span', 'severity-tag ' + finding.severity, finding.severity.toUpperCase()), node('span', 'finding-code', finding.code));
      const evidence = node('div', 'finding-evidence');
      const indexes = finding.recordIndexes.filter(function (index) { return Number.isInteger(index) && index >= 0 && index < item.dataset.records.length; });
      const rowsText = indexes.slice(0, 5).map(function (index) { return pad(index + 1); }).join(', ') + (indexes.length > 5 ? ' +' + (indexes.length - 5) + ' more' : '');
      const button = node('button', 'evidence-link', 'Inspect row' + (indexes.length === 1 ? ' ' : 's ') + rowsText);
      button.type = 'button';
      button.append(node('span', '', '→'));
      button.disabled = indexes.length === 0;
      button.addEventListener('click', function () {
        state.rowFocus = new Set(indexes);
        state.page = 0;
        $('event-search').value = '';
        $('event-type').value = 'all';
        renderEvents();
        $('events-title').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        $('clear-row-focus').focus({ preventScroll: true });
      });
      evidence.append(button, node('span', '', finding.station_id));
      const detail = finding.code === 'INJECTION_MARKER' && !/heuristic/i.test(finding.detail) ? finding.detail + ' This is a training-string heuristic, not an AI evaluation.' : finding.detail;
      article.append(top, node('h3', '', finding.title), node('p', '', detail), evidence);
      return article;
    });
    if (!state.printMode && findings.length > PAGE_SIZE) {
      const footer = node('div', 'table-footer');
      const controls = node('div', 'pagination');
      const previous = node('button', '', '←');
      const next = node('button', '', '→');
      previous.setAttribute('aria-label', 'Previous findings page');
      next.setAttribute('aria-label', 'Next findings page');
      previous.disabled = state.findingPage === 0;
      next.disabled = findingStart + PAGE_SIZE >= findings.length;
      previous.addEventListener('click', function () { state.findingPage--; renderFindings(); $('findings-list').scrollTop = 0; });
      next.addEventListener('click', function () { state.findingPage++; renderFindings(); $('findings-list').scrollTop = 0; });
      controls.append(previous, next);
      footer.append(node('span', '', (findingStart + 1) + '–' + Math.min(findingStart + PAGE_SIZE, findings.length) + ' of ' + findings.length + ' findings'), controls);
      articles.push(footer);
    }
    replace('findings-list', articles);
  }

  async function analyze() {
    const item = currentCase();
    if (item.analyzing) return;
    item.analyzing = true;
    $('notice').hidden = true;
    renderAnalysis();
    try {
      // Yield for the pending state to paint before rule checks run.
      await new Promise(function (resolve) { requestAnimationFrame(function () { requestAnimationFrame(resolve); }); });
      item.result = await engine.analyzeDataset(item.dataset);
      if (currentCase() === item) announce('Analysis complete: ' + item.result.summary.total + ' finding' + (item.result.summary.total === 1 ? '' : 's') + ' across ' + item.result.summary.records + ' synthetic records. Inspect source rows and record your reasoning.');
      scheduleSave();
    } catch (error) {
      if (currentCase() === item) announce('Analysis could not finish. ' + safeMessage(error), true);
    } finally {
      item.analyzing = false;
      if (currentCase() === item) renderAnalysis();
    }
  }

  function renderChart(dataset) {
    const telemetry = dataset.records.map(function (record, index) { return { record: record, index: index }; }).filter(function (entry) { return entry.record.event_type === 'telemetry' && typeof entry.record.signal_dbm === 'number'; });
    if (!telemetry.length) {
      replace('signal-chart', [node('p', 'chart-placeholder', 'No telemetry signal samples in this dataset. Inspect the event log for other evidence.')]);
      $('chart-count').textContent = '0 samples';
      return;
    }
    const times = telemetry.map(function (entry) { return Date.parse(entry.record.timestamp); });
    let minTime = Math.min.apply(null, times);
    let maxTime = Math.max.apply(null, times);
    if (minTime === maxTime) { minTime -= 30000; maxTime += 30000; }
    const signals = telemetry.map(function (entry) { return entry.record.signal_dbm; });
    const minSignal = Math.floor((Math.min.apply(null, signals.concat([-105])) - 5) / 10) * 10;
    const maxSignal = Math.ceil((Math.max.apply(null, signals.concat([-80])) + 5) / 10) * 10;
    const width = 650, height = 235, left = 53, right = 20, top = 20, bottom = 35;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const x = function (value) { return left + (value - minTime) / (maxTime - minTime) * plotWidth; };
    const y = function (value) { return top + (maxSignal - value) / (maxSignal - minSignal) * plotHeight; };
    const svg = svgNode('svg', { viewBox: '0 0 ' + width + ' ' + height, role: 'img', 'aria-labelledby': 'chart-svg-title chart-svg-desc' });
    svg.append(svgNode('title', { id: 'chart-svg-title' }, 'Synthetic telemetry signal over time'), svgNode('desc', { id: 'chart-svg-desc' }, telemetry.length + ' telemetry samples across ' + new Set(telemetry.map(function (entry) { return entry.record.station_id; })).size + ' stations. Signal strength in dBm versus UTC timestamp; lines follow arrival order for each station. The rule threshold is below -100 dBm. Exact values and every source record are available in the event log below. Large datasets display a representative subset of points.'));
    for (let tick = 0; tick < 5; tick++) {
      const value = minSignal + tick * (maxSignal - minSignal) / 4;
      svg.append(svgNode('line', { x1: left, x2: width - right, y1: y(value), y2: y(value), stroke: '#263b35', 'stroke-width': '.7', 'stroke-dasharray': '2 5' }), svgNode('text', { x: left - 12, y: y(value) + 3, fill: '#79968a', 'text-anchor': 'end', 'font-family': 'monospace', 'font-size': '9' }, String(Math.round(value))));
    }
    svg.append(svgNode('line', { x1: left, x2: width - right, y1: y(-100), y2: y(-100), stroke: '#947d4b', 'stroke-width': '.9', 'stroke-dasharray': '5 4' }));
    for (let tick = 0; tick < 4; tick++) {
      const value = minTime + tick * (maxTime - minTime) / 3;
      svg.append(svgNode('text', { x: x(value), y: height - 10, fill: '#79968a', 'text-anchor': tick === 0 ? 'start' : tick === 3 ? 'end' : 'middle', 'font-family': 'monospace', 'font-size': '9' }, new Date(value).toISOString().slice(11, 19)));
    }
    const stations = new Map();
    telemetry.forEach(function (entry) { if (!stations.has(entry.record.station_id)) stations.set(entry.record.station_id, []); stations.get(entry.record.station_id).push(entry); });
    const palette = ['#84ba9b', '#b2c78a', '#86aaba', '#b9a0b8', '#c8a66d'];
    let colorIndex = 0;
    stations.forEach(function (entries) {
      const color = palette[colorIndex++ % palette.length];
      const step = Math.max(1, Math.ceil(entries.length / 160));
      const subset = entries.filter(function (_, index) { return index % step === 0 || index === entries.length - 1; });
      const points = subset.map(function (entry) { return x(Date.parse(entry.record.timestamp)).toFixed(2) + ',' + y(entry.record.signal_dbm).toFixed(2); }).join(' ');
      svg.append(svgNode('polyline', { points: points, fill: 'none', stroke: color, 'stroke-width': '1.5', 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: '.85' }));
      subset.forEach(function (entry) {
        const dot = svgNode('circle', { cx: x(Date.parse(entry.record.timestamp)), cy: y(entry.record.signal_dbm), r: entries.length > 30 ? '1.8' : '3', fill: '#111c1b', stroke: color, 'stroke-width': '1.4' });
        dot.append(svgNode('title', {}, entry.record.station_id + ' · Row ' + (entry.index + 1) + ' · ' + entry.record.signal_dbm + ' dBm · ' + entry.record.timestamp));
        svg.append(dot);
      });
    });
    replace('signal-chart', [svg]);
    $('chart-count').textContent = formatCount(telemetry.length) + ' samples / ' + stations.size + ' stations';
  }

  function filteredRecords() {
    const search = $('event-search').value.toLowerCase().trim();
    const type = $('event-type').value;
    return currentCase().dataset.records.map(function (record, index) { return { record: record, index: index }; }).filter(function (entry) {
      return (!state.rowFocus || state.rowFocus.has(entry.index)) && (type === 'all' || entry.record.event_type === type) && (!search || Object.values(entry.record).join(' ').toLowerCase().includes(search) || String(entry.index + 1) === search);
    });
  }

  function renderEvents() {
    const all = state.printMode ? currentCase().dataset.records.map(function (record, index) { return { record: record, index: index }; }) : filteredRecords();
    state.page = Math.max(0, Math.min(state.page, Math.ceil(all.length / PAGE_SIZE) - 1));
    const start = state.page * PAGE_SIZE;
    const page = state.printMode ? all : all.slice(start, start + PAGE_SIZE);
    $('events-total').textContent = formatCount(currentCase().dataset.records.length);
    $('row-focus-bar').hidden = !state.rowFocus;
    $('row-focus-description').textContent = state.rowFocus ? 'Showing ' + state.rowFocus.size + ' source row' + (state.rowFocus.size === 1 ? '' : 's') + ' from the selected finding.' : '';
    $('previous-page').disabled = state.page === 0;
    $('next-page').disabled = start + PAGE_SIZE >= all.length;
    $('page-description').textContent = state.printMode ? 'Complete source evidence: ' + formatCount(all.length) + ' records. Full field values are included in the CSV and case backup.' : all.length ? 'Rows ' + (start + 1) + '–' + Math.min(start + PAGE_SIZE, all.length) + ' of ' + formatCount(all.length) + (all.length !== currentCase().dataset.records.length ? ' matching records' : ' records') : 'No matching records';
    if (!page.length) {
      const row = node('tr', 'table-empty');
      const cell = node('td', '', 'No records match these filters. Clear the search or choose another event type.');
      cell.colSpan = 6;
      row.append(cell);
      replace('events-body', [row]);
      return;
    }
    replace('events-body', page.map(function (entry) {
      const record = entry.record;
      const row = node('tr');
      const rowCell = node('td');
      const rowButton = node('button', 'row-number', String(entry.index + 1).padStart(3, '0'));
      rowButton.type = 'button';
      rowButton.setAttribute('aria-label', 'Inspect source row ' + (entry.index + 1));
      rowButton.addEventListener('click', function () { showRecord(record, entry.index); });
      rowCell.append(rowButton);
      const timestamp = node('td', '', record.timestamp.slice(11).replace('Z', ''));
      timestamp.append(node('span', 'row-date', record.timestamp.slice(0, 10)));
      const station = node('td', 'station-seq', record.station_id);
      station.append(node('span', 'row-date sequence', 'SEQ ' + record.sequence));
      const type = node('td');
      type.append(node('span', 'event-tag ' + record.event_type, record.event_type === 'analyst_note' ? 'NOTE' : record.event_type.toUpperCase()));
      const signal = node('td', typeof record.signal_dbm === 'number' && record.signal_dbm < -100 ? 'signal-low' : '', typeof record.signal_dbm === 'number' ? record.signal_dbm + ' dBm' : '—');
      let detail = record.message || '';
      if (record.command) detail = record.command + ' · ' + record.auth_result + (detail ? ' · ' + detail : '');
      else if (record.event_type === 'auth') detail = record.auth_result.toUpperCase() + (detail ? ' · ' + detail : '');
      const shortDetail = detail.length > 150 ? detail.slice(0, 147) + '…' : detail;
      row.append(rowCell, timestamp, station, type, signal, node('td', '', shortDetail || '—'));
      return row;
    }));
  }

  function showRecord(record, index) {
    $('record-dialog-title').textContent = 'Row ' + String(index + 1).padStart(3, '0') + ' · ' + record.station_id;
    const fields = [];
    Object.keys(record).forEach(function (key) { fields.push(node('dt', '', key), node('dd', '', String(record[key]))); });
    replace('record-fields', fields);
    $('record-dialog').showModal();
  }

  function filename(extension) {
    const slug = currentCase().dataset.scenarioId.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 60).replace(/^-+|-+$/g, '') || 'case';
    return 'gsz-' + slug + '.' + extension;
  }
  function download(text, name, type) {
    const blob = new Blob([text], { type: type });
    const url = URL.createObjectURL(blob);
    const anchor = node('a');
    anchor.href = url;
    anchor.download = name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    announce('Prepared ' + name + '. Your browser controls where the download is saved.');
  }
  function exportCase() {
    const item = currentCase();
    const backup = { format: 'gsz-case', version: 1, exportedAt: new Date().toISOString(), missionId: item.mission.id, dataset: item.dataset, notes: item.notes };
    download(JSON.stringify(backup, null, 2) + '\n', filename('case.json'), 'application/json;charset=utf-8');
  }
  function validateNotes(value) {
    if (typeof value !== 'string' || value.length > MAX_NOTES) throw new Error('Case notes must be text with at most 12,000 characters.');
    return value;
  }
  function plainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function validateBackup(value) {
    if (!plainObject(value)) throw new Error('The JSON must contain a synthetic dataset or a Ground Station Zero case backup.');
    if (value.format === 'gsz-case') {
      const allowed = ['format', 'version', 'exportedAt', 'missionId', 'dataset', 'notes'];
      if (Object.keys(value).some(function (key) { return !allowed.includes(key); })) throw new Error('The case backup contains an unsupported field.');
      if (value.version !== 1) throw new Error('Unsupported case backup version. Expected version 1.');
      if (typeof value.missionId !== 'string' || value.missionId.length > 80 || !value.missionId.trim()) throw new Error('The backup missionId must contain 1–80 characters.');
      if (typeof value.exportedAt !== 'string' || value.exportedAt.length > 40 || !Number.isFinite(Date.parse(value.exportedAt))) throw new Error('The backup export date is invalid.');
      return { dataset: engine.validateDataset(value.dataset), notes: validateNotes(value.notes), missionId: value.missionId };
    }
    return { dataset: engine.validateDataset(value), notes: '', missionId: value.scenarioId };
  }
  function importedMission(dataset) {
    return { id: dataset.scenarioId, title: dataset.title, subtitle: 'A local synthetic case, ready for independent review', difficulty: 'Imported', brief: 'This case was imported from a local JSON file. Its records have passed schema validation. Re-run the checks and verify the provenance, interpretation, and limits before drawing a conclusion.', objectives: ['Trace each finding back to its original source rows.', 'Separate observed evidence from assumptions.', 'Describe counter-evidence and a useful next step.'], tasks: ['Inspect the case reference time and station sequence numbers.', 'Run the checks and independently verify at least one rule result.', 'Add your explanation and limitations to the analyst notes.', 'Export a report and a case backup to preserve your work.'] };
  }
  async function importFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { announce('Import rejected: the maximum file size is 4 MiB.', true); return; }
    if (state.cases.filter(function (item) { return item.imported; }).length >= MAX_IMPORTED) { announce('Import limit reached: keep up to 12 imported cases in this session. Back up your work, turn off browser saving, and reload for a fresh session.', true); return; }
    try {
      const text = await file.text();
      if (text.length > MAX_FILE_BYTES) throw new Error('The JSON exceeds the 4 MiB import limit.');
      let value;
      try { value = JSON.parse(text); } catch (error) { throw new Error('This file is not valid JSON. Choose an evidence dataset or a .case.json backup.'); }
      const backup = validateBackup(value);
      const item = { key: 'import-' + (++state.importCounter), imported: true, mission: importedMission(backup.dataset), dataset: backup.dataset, notes: backup.notes, result: null, analyzing: false, dirty: true };
      state.cases.push(item);
      selectCase(item.key);
      announce('Imported ' + backup.dataset.records.length + ' synthetic records. Notes were preserved. Run analysis to regenerate findings.');
    } catch (error) { announce('Import rejected: ' + safeMessage(error), true); }
  }

  function saveNow() {
    clearTimeout(saveTimer);
    if (!state.localSave) return;
    try {
      const payload = { format: 'gsz-session', version: 1, activeKey: state.selected, cases: state.cases.map(function (item) { return { key: item.key, imported: Boolean(item.imported), dataset: item.dataset, notes: item.notes }; }) };
      const text = JSON.stringify(payload);
      if (text.length > MAX_FILE_BYTES * 2) throw new Error('Saved cases exceed the 8 MiB browser-save limit. Export a case backup.');
      localStorage.setItem(SAVE_KEY, text);
      localStorage.setItem(OPT_IN_KEY, 'yes');
      state.cases.forEach(function (item) { item.dirty = false; });
      return true;
    } catch (error) { announce('Browser saving is unavailable or full. Your current work remains open; export a case backup to preserve it. ' + safeMessage(error), true); return false; }
  }
  function scheduleSave() { if (state.localSave) { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 350); } }
  function restoreLocal() {
    // Restricted browser profiles may disallow storage even before an opt-in exists.
    try { if (localStorage.getItem(OPT_IN_KEY) !== 'yes') return; } catch (error) { return; }
    try {
      state.localSave = true;
      const text = localStorage.getItem(SAVE_KEY);
      if (!text) return;
      if (text.length > MAX_FILE_BYTES * 2) throw new Error('The saved session exceeds the supported size.');
      const payload = JSON.parse(text);
      if (!plainObject(payload) || payload.format !== 'gsz-session' || payload.version !== 1 || !Array.isArray(payload.cases) || payload.cases.length > state.cases.length + MAX_IMPORTED) throw new Error('The saved session format is invalid.');
      const restored = [];
      const seenKeys = new Set();
      payload.cases.forEach(function (saved) {
        if (!plainObject(saved) || typeof saved.key !== 'string' || saved.key.length > 100 || seenKeys.has(saved.key) || typeof saved.imported !== 'boolean') throw new Error('The saved session contains an invalid case.');
        seenKeys.add(saved.key);
        const dataset = engine.validateDataset(saved.dataset);
        const notes = validateNotes(saved.notes);
        if (saved.imported) {
          if (!/^import-\d+$/.test(saved.key)) throw new Error('The saved imported case ID is invalid.');
          const importedNumber = Number(saved.key.slice(7));
          if (!Number.isSafeInteger(importedNumber) || importedNumber < 1) throw new Error('The saved imported case number is invalid.');
          state.importCounter = Math.max(state.importCounter, importedNumber);
          restored.push({ key: saved.key, imported: true, mission: importedMission(dataset), dataset: dataset, notes: notes, result: null, analyzing: false });
        } else {
          const existing = state.cases.find(function (item) { return item.key === saved.key && !item.imported; });
          if (!existing || existing.dataset.scenarioId !== dataset.scenarioId) throw new Error('A saved mission is unavailable in this edition.');
          // Bundled evidence is immutable; restore notes against this edition's bundled dataset.
          restored.push(Object.assign({}, existing, { notes: notes }));
        }
      });
      if (restored.filter(function (item) { return item.imported; }).length > MAX_IMPORTED) throw new Error('The saved session has too many imported cases.');
      state.cases = state.cases.map(function (item) { return restored.find(function (saved) { return saved.key === item.key; }) || item; }).concat(restored.filter(function (item) { return item.imported; }));
      if (typeof payload.activeKey === 'string' && state.cases.some(function (item) { return item.key === payload.activeKey; })) state.selected = payload.activeKey;
      announce('Locally saved notes and imported cases restored. Run analysis to regenerate findings. Browser storage can be cleared; keep case backups for durable copies.');
    } catch (error) {
      state.localSave = false;
      announce('Saved work could not be restored. Browser saving is off; the existing saved copy is untouched until you explicitly opt in again. The bundled missions remain available. ' + safeMessage(error), true);
    }
  }

  function bindEvents() {
    document.querySelector('.brand').addEventListener('click', function (event) { event.preventDefault(); selectCase(state.cases[0].key, true); });
    $('analyze-button').addEventListener('click', analyze);
    $('severity-filter').addEventListener('change', function () { state.findingPage = 0; renderFindings(); });
    $('event-search').addEventListener('input', function () { state.page = 0; renderEvents(); });
    $('event-type').addEventListener('change', function () { state.page = 0; renderEvents(); });
    $('previous-page').addEventListener('click', function () { state.page--; renderEvents(); });
    $('next-page').addEventListener('click', function () { state.page++; renderEvents(); });
    $('clear-row-focus').addEventListener('click', function () { state.rowFocus = null; state.page = 0; renderEvents(); });
    $('analyst-notes').addEventListener('input', function () { currentCase().notes = $('analyst-notes').value; currentCase().dirty = true; $('notes-count').textContent = formatCount(currentCase().notes.length) + ' / 12,000'; scheduleSave(); });
    $('local-save').addEventListener('change', function () {
      state.localSave = $('local-save').checked;
      if (state.localSave) { if (saveNow()) announce('Browser saving enabled. Cases and notes stay on this browser profile. Export backups for durable copies.'); }
      else {
        clearTimeout(saveTimer);
        state.cases.forEach(function (item) { item.dirty = Boolean(item.notes) || Boolean(item.imported); });
        try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(OPT_IN_KEY); announce('Browser saving is off and this app’s saved session was removed. Your current work remains open.'); }
        catch (error) { announce('Browser saving is off for this session. The browser did not allow removal of stored data; clear this site’s storage in browser settings.', true); }
      }
    });
    $('import-button').addEventListener('click', function () { $('import-file').click(); });
    $('import-file').addEventListener('change', function () { const file = $('import-file').files[0]; $('import-file').value = ''; importFile(file); });
    $('backup-button').addEventListener('click', exportCase);
    $('markdown-button').addEventListener('click', function () { const item = currentCase(); try { download(engine.toMarkdown(item.dataset, item.result, item.notes), filename('report.md'), 'text/markdown;charset=utf-8'); } catch (error) { announce('Report export failed: ' + safeMessage(error), true); } });
    $('csv-button').addEventListener('click', function () { try { download(engine.toCSV(currentCase().dataset), filename('evidence.csv'), 'text/csv;charset=utf-8'); } catch (error) { announce('CSV export failed: ' + safeMessage(error), true); } });
    $('print-button').addEventListener('click', function () { window.print(); });
    $('close-dialog').addEventListener('click', function () { $('record-dialog').close(); });
    $('record-dialog').addEventListener('click', function (event) { if (event.target === $('record-dialog')) { const rect = $('record-dialog').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('record-dialog').close(); } });
    let checklistWasOpen = false;
    window.addEventListener('beforeprint', function () {
      state.printMode = true;
      renderFindings();
      renderEvents();
      let printNotes = document.querySelector('.print-notes');
      if (!printNotes) { printNotes = node('div', 'print-notes'); $('analyst-notes').after(printNotes); }
      printNotes.textContent = currentCase().notes || 'No analyst notes recorded.';
      checklistWasOpen = document.querySelector('.tasks-details').open;
      document.querySelector('.tasks-details').open = true;
    });
    window.addEventListener('afterprint', function () { state.printMode = false; document.querySelector('.tasks-details').open = checklistWasOpen; renderFindings(); renderEvents(); });
    window.addEventListener('pagehide', saveNow);
    window.addEventListener('beforeunload', function (event) {
      if (state.cases.some(function (item) { return item.dirty; })) { event.preventDefault(); event.returnValue = ''; }
    });
  }

  function init() {
    try {
      engine = window.GSZEngine;
      if (!engine || !window.GSZScenarios || !Array.isArray(window.GSZScenarios.missions) || !window.GSZScenarios.missions.length) throw new Error('The engine or mission catalog did not load. Keep index.html, styles.css, app.js, lib/, and scenarios/ together when extracting the download.');
      state.cases = window.GSZScenarios.missions.map(function (mission, index) { return { key: mission.id, mission: mission, number: index + 1, imported: false, dataset: engine.validateDataset(mission.dataset), notes: '', result: null, analyzing: false }; });
      const edition = encodeURIComponent(state.cases.map(function (item) { return item.mission.id; }).join('|'));
      SAVE_KEY = 'gsz-cases-v1:' + edition;
      OPT_IN_KEY = 'gsz-save-opt-in-v1:' + edition;
      state.selected = state.cases[0].key;
      bindEvents();
      restoreLocal();
      renderNavigation();
      renderCase();
    } catch (error) {
      $('fatal-error').textContent = 'Workstation unavailable. ' + safeMessage(error);
      $('fatal-error').hidden = false;
      ['analyze-button', 'import-button', 'backup-button', 'csv-button', 'local-save'].forEach(function (id) { $(id).disabled = true; });
    }
  }
  init();
})();
