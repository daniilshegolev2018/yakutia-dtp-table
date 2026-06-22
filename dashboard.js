(() => {
  const columns = window.TABLE_COLUMNS || [];
  const rows = window.TABLE_ROWS || [];
  const idx = Object.fromEntries(columns.map((column, index) => [column, index]));

  const MONTHS = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];

  const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  const filterDefs = [
    { key: 'year', label: 'Год' },
    { key: 'month', label: 'Месяц' },
    { key: 'type', label: 'Вид ДТП' },
    { key: 'severity', label: 'Тяжесть последствий' },
    { key: 'district', label: 'Район / город' },
    { key: 'place', label: 'Местоположение аварии' },
    { key: 'weather', label: 'Состояние погоды' },
    { key: 'roadSurface', label: 'Состояние проезжей части' },
    { key: 'lighting', label: 'Освещение' },
    { key: 'participantCategory', label: 'Категория участника' }
  ];

  const state = {
    search: '',
    dateFrom: '',
    dateTo: '',
    filters: Object.fromEntries(filterDefs.map(def => [def.key, '']))
  };

  const el = {
    search: document.getElementById('dashSearch'),
    dateFrom: document.getElementById('dateFrom'),
    dateTo: document.getElementById('dateTo'),
    filterGrid: document.getElementById('filterGrid'),
    reset: document.getElementById('resetDashboard'),
    exportCsv: document.getElementById('exportDashboardCsv'),
    kpiAccidents: document.getElementById('kpiAccidents'),
    kpiDeaths: document.getElementById('kpiDeaths'),
    kpiInjured: document.getElementById('kpiInjured'),
    kpiParticipants: document.getElementById('kpiParticipants'),
    kpiVehicles: document.getElementById('kpiVehicles'),
    kpiMapPoints: document.getElementById('kpiMapPoints'),
    kpiPeriod: document.getElementById('kpiPeriod'),
    mapStatus: document.getElementById('mapStatus')
  };

  const fmt = new Intl.NumberFormat('ru-RU');
  const normalize = value => String(value ?? '').toLocaleLowerCase('ru-RU').trim();
  const clean = value => String(value ?? '').replace(/^nan$/i, '').trim();

  function cell(row, columnName) {
    const columnIndex = idx[columnName];
    return columnIndex === undefined ? '' : clean(row[columnIndex]);
  }

  function parseNumber(value) {
    const prepared = clean(value).replace(',', '.').replace(/[^0-9.\-]/g, '');
    const parsed = Number(prepared);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function parseDateValue(dateText) {
    const value = clean(dateText);
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return Date.UTC(year, month - 1, day);
  }

  function formatDateRu(dateText) {
    const value = clean(dateText);
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}.${match[2]}.${match[1]}` : value || '—';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function debounce(fn, wait = 180) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function districtFromAddress(address) {
    const firstPart = clean(address).split(',')[0]?.trim();
    return firstPart || 'Не указано';
  }

  function addToSet(target, key, value) {
    const prepared = clean(value);
    if (!prepared) return;
    if (!target[key]) target[key] = new Set();
    target[key].add(prepared);
  }

  function chooseSeverity(severitySet, deaths) {
    const values = Array.from(severitySet || []);
    if (deaths > 0 || values.some(value => normalize(value).includes('смерт'))) {
      return 'Тяжелые последствия / Смерть';
    }
    if (values.some(value => normalize(value).includes('сред'))) return 'Средняя тяжесть';
    if (values.some(value => normalize(value).includes('легк') || normalize(value).includes('не пострад'))) {
      return 'Легкая тяжесть / Не пострадал';
    }
    return values[0] || 'Не указано';
  }

  function buildAccidents() {
    const accidentsByKey = new Map();

    rows.forEach(row => {
      const date = cell(row, 'Дата');
      const time = cell(row, 'Время');
      const uuid = cell(row, 'UUID');
      const number = cell(row, 'Номер ДТП');
      const type = cell(row, 'Вид ДТП');
      const address = cell(row, 'Адрес');
      const latitude = parseNumber(cell(row, 'Широта'));
      const longitude = parseNumber(cell(row, 'Долгота'));
      const key = uuid || number || [date, time, latitude, longitude, type, address].join('|');

      if (!accidentsByKey.has(key)) {
        const dateValue = parseDateValue(date);
        const year = cell(row, 'Год') || (dateValue ? new Date(dateValue).getUTCFullYear().toString() : '');
        const month = cell(row, 'Месяц') || (dateValue ? (new Date(dateValue).getUTCMonth() + 1).toString() : '');
        const district = districtFromAddress(address);
        accidentsByKey.set(key, {
          key,
          uuid,
          number,
          date,
          time,
          dateValue,
          year,
          month,
          type: type || 'Не указано',
          address,
          district,
          latitude,
          longitude,
          validCoords: Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= 55 && latitude <= 75 && longitude >= 100 && longitude <= 170,
          deaths: 0,
          injured: 0,
          participants: 0,
          vehicles: 0,
          filters: {},
          severity: 'Не указано',
          searchParts: []
        });
      }

      const accident = accidentsByKey.get(key);
      accident.deaths = Math.max(accident.deaths, parseNumber(cell(row, 'Число погибших')));
      accident.injured = Math.max(accident.injured, parseNumber(cell(row, 'Число раненых')));
      accident.participants = Math.max(accident.participants, parseNumber(cell(row, 'Число участников')));
      accident.vehicles = Math.max(accident.vehicles, parseNumber(cell(row, 'Количество ТС')));

      addToSet(accident.filters, 'year', accident.year);
      addToSet(accident.filters, 'month', accident.month);
      addToSet(accident.filters, 'type', cell(row, 'Вид ДТП'));
      addToSet(accident.filters, 'severity', cell(row, 'Степень тяжести последствий'));
      addToSet(accident.filters, 'district', districtFromAddress(cell(row, 'Адрес')));
      addToSet(accident.filters, 'place', cell(row, 'Местоположение аварии'));
      addToSet(accident.filters, 'weather', cell(row, 'Состояние погоды'));
      addToSet(accident.filters, 'roadSurface', cell(row, 'Состояние проезжей части'));
      addToSet(accident.filters, 'lighting', cell(row, 'Освещение'));
      addToSet(accident.filters, 'participantCategory', cell(row, 'Категория участника'));

      accident.searchParts.push(row.join(' '));
    });

    const accidents = Array.from(accidentsByKey.values()).map(accident => {
      accident.severity = chooseSeverity(accident.filters.severity, accident.deaths);
      addToSet(accident.filters, 'severity', accident.severity);
      accident.search = normalize(accident.searchParts.join(' '));
      delete accident.searchParts;
      return accident;
    });

    return accidents.sort((a, b) => (a.dateValue ?? 0) - (b.dateValue ?? 0));
  }

  const accidents = buildAccidents();
  const minDate = accidents.find(accident => accident.dateValue)?.date || '';
  const maxDate = [...accidents].reverse().find(accident => accident.dateValue)?.date || '';

  function sortValues(values, key) {
    const arr = Array.from(values).filter(Boolean);
    if (key === 'year' || key === 'month') return arr.sort((a, b) => Number(a) - Number(b));
    return arr.sort((a, b) => a.localeCompare(b, 'ru', { numeric: true, sensitivity: 'base' }));
  }

  function optionLabel(key, value) {
    if (key === 'month') {
      const monthIndex = Number(value) - 1;
      return MONTHS[monthIndex] || value;
    }
    return value;
  }

  function initFilters() {
    el.dateFrom.value = minDate;
    el.dateTo.value = maxDate;
    state.dateFrom = minDate;
    state.dateTo = maxDate;

    filterDefs.forEach(def => {
      const label = document.createElement('label');
      label.className = 'select-block';
      label.innerHTML = `<span>${escapeHtml(def.label)}</span>`;

      const select = document.createElement('select');
      select.dataset.filterKey = def.key;
      select.innerHTML = '<option value="">Все</option>';

      const values = new Set();
      accidents.forEach(accident => {
        (accident.filters[def.key] || new Set()).forEach(value => values.add(value));
      });

      sortValues(values, def.key).forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = optionLabel(def.key, value);
        select.appendChild(option);
      });

      select.addEventListener('change', event => {
        state.filters[def.key] = event.target.value;
        updateDashboard();
      });

      label.appendChild(select);
      el.filterGrid.appendChild(label);
    });
  }

  function passesFilters(accident) {
    const from = state.dateFrom ? parseDateValue(state.dateFrom) : null;
    const to = state.dateTo ? parseDateValue(state.dateTo) : null;

    if (from !== null && accident.dateValue !== null && accident.dateValue < from) return false;
    if (to !== null && accident.dateValue !== null && accident.dateValue > to) return false;

    for (const def of filterDefs) {
      const selected = state.filters[def.key];
      if (!selected) continue;
      if (!(accident.filters[def.key] || new Set()).has(selected)) return false;
    }

    if (state.search && !accident.search.includes(state.search)) return false;
    return true;
  }

  function getFilteredAccidents() {
    return accidents.filter(passesFilters);
  }

  function countBy(items, getter) {
    const result = new Map();
    items.forEach(item => {
      const key = getter(item) || 'Не указано';
      result.set(key, (result.get(key) || 0) + 1);
    });
    return result;
  }

  function topEntries(map, limit = 10) {
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
      .slice(0, limit);
  }

  function monthCounts(items) {
    const counts = Array(12).fill(0);
    items.forEach(item => {
      const monthIndex = Number(item.month) - 1;
      if (monthIndex >= 0 && monthIndex < 12) counts[monthIndex] += 1;
    });
    return counts;
  }

  function weekdayCounts(items) {
    const counts = Array(7).fill(0);
    items.forEach(item => {
      if (item.dateValue === null || item.dateValue === undefined) return;
      const utcDay = new Date(item.dateValue).getUTCDay();
      const mondayBasedIndex = (utcDay + 6) % 7;
      counts[mondayBasedIndex] += 1;
    });
    return counts;
  }

  const charts = {};

  function drawChart(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas || !window.Chart) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(canvas, config);
  }

  function commonChartOptions(extra = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => `${context.dataset.label || 'ДТП'}: ${fmt.format(context.raw || 0)}`
          }
        }
      },
      scales: {
        x: { ticks: { precision: 0 } },
        y: { ticks: { precision: 0 } }
      },
      ...extra
    };
  }

  function updateCharts(filtered) {
    const byYear = Array.from(countBy(filtered, accident => accident.year).entries())
      .filter(([year]) => year && year !== 'Не указано')
      .sort((a, b) => Number(a[0]) - Number(b[0]));

    drawChart('yearChart', {
      type: 'bar',
      data: {
        labels: byYear.map(([label]) => label),
        datasets: [{ label: 'ДТП', data: byYear.map(([, value]) => value) }]
      },
      options: commonChartOptions()
    });

    drawChart('monthChart', {
      type: 'bar',
      data: {
        labels: MONTHS.map(month => month.slice(0, 3)),
        datasets: [{ label: 'ДТП', data: monthCounts(filtered) }]
      },
      options: commonChartOptions()
    });

    drawChart('weekdayChart', {
      type: 'bar',
      data: {
        labels: WEEKDAYS,
        datasets: [{ label: 'ДТП', data: weekdayCounts(filtered) }]
      },
      options: commonChartOptions()
    });
  }

  let map;
  let markerCluster;

  function initMap() {
    if (!window.L) {
      el.mapStatus.textContent = 'Карта недоступна';
      return;
    }
    map = L.map('map', { preferCanvas: true }).setView([62.03, 129.73], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    markerCluster = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 54,
      showCoverageOnHover: false
    });
    map.addLayer(markerCluster);
  }

  function markerColor(accident) {
    if (accident.deaths > 0) return '#dc2626';
    if (accident.injured > 0) return '#f97316';
    return '#2563eb';
  }

  function popupHtml(accident) {
    return `
      <div class="popup-title">${escapeHtml(accident.type)}</div>
      <div class="popup-row"><b>Дата:</b> ${escapeHtml(formatDateRu(accident.date))}${accident.time ? `, ${escapeHtml(accident.time)}` : ''}</div>
      <div class="popup-row"><b>Район/город:</b> ${escapeHtml(accident.district)}</div>
      <div class="popup-row"><b>Адрес:</b> ${escapeHtml(accident.address || '—')}</div>
      <div class="popup-row"><b>Погибшие:</b> ${fmt.format(accident.deaths)}; <b>раненые:</b> ${fmt.format(accident.injured)}</div>
      <div class="popup-row"><b>Участники:</b> ${fmt.format(accident.participants)}; <b>ТС:</b> ${fmt.format(accident.vehicles)}</div>
      <div class="popup-row"><b>Координаты:</b> ${accident.latitude.toFixed(5)}, ${accident.longitude.toFixed(5)}</div>
    `;
  }

  function updateMap(filtered) {
    const valid = filtered.filter(accident => accident.validCoords);
    el.mapStatus.textContent = `${fmt.format(valid.length)} точек`;
    if (!map || !markerCluster) return;

    markerCluster.clearLayers();
    const markers = valid.map(accident => {
      const marker = L.circleMarker([accident.latitude, accident.longitude], {
        radius: accident.deaths > 0 ? 8 : 6,
        color: markerColor(accident),
        fillColor: markerColor(accident),
        fillOpacity: 0.76,
        weight: 1
      });
      marker.bindPopup(popupHtml(accident));
      return marker;
    });

    markerCluster.addLayers(markers);

    if (markers.length > 0) {
      const bounds = L.latLngBounds(valid.map(accident => [accident.latitude, accident.longitude]));
      map.fitBounds(bounds.pad(0.08), { maxZoom: 10, animate: false });
    } else {
      map.setView([62.03, 129.73], 5);
    }
  }

  function periodText(filtered) {
    if (!filtered.length) return 'Нет данных по выбранным условиям';
    const dates = filtered.map(accident => accident.dateValue).filter(value => value !== null && value !== undefined).sort((a, b) => a - b);
    if (!dates.length) return 'Период не указан';
    const first = new Date(dates[0]).toISOString().slice(0, 10);
    const last = new Date(dates[dates.length - 1]).toISOString().slice(0, 10);
    return `${formatDateRu(first)} — ${formatDateRu(last)}`;
  }

  function updateKpis(filtered) {
    const totals = filtered.reduce((acc, item) => {
      acc.deaths += item.deaths;
      acc.injured += item.injured;
      acc.participants += item.participants;
      acc.vehicles += item.vehicles;
      if (item.validCoords) acc.mapPoints += 1;
      return acc;
    }, { deaths: 0, injured: 0, participants: 0, vehicles: 0, mapPoints: 0 });

    el.kpiAccidents.textContent = fmt.format(filtered.length);
    el.kpiDeaths.textContent = fmt.format(totals.deaths);
    el.kpiInjured.textContent = fmt.format(totals.injured);
    el.kpiParticipants.textContent = fmt.format(totals.participants);
    el.kpiVehicles.textContent = fmt.format(totals.vehicles);
    el.kpiMapPoints.textContent = fmt.format(totals.mapPoints);
    el.kpiPeriod.textContent = periodText(filtered);
  }

  function updateDashboard() {
    const filtered = getFilteredAccidents();
    updateKpis(filtered);
    updateMap(filtered);
    updateCharts(filtered);
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    if (/[";\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
    return text;
  }

  function exportDashboardCsv() {
    const filtered = getFilteredAccidents();
    const header = [
      'Дата', 'Время', 'UUID', 'Номер ДТП', 'Вид ДТП', 'Район/город', 'Адрес',
      'Широта', 'Долгота', 'Погибшие', 'Раненые', 'Участники', 'Количество ТС', 'Тяжесть последствий'
    ];
    const lines = [header.join(';')];
    filtered.forEach(accident => {
      lines.push([
        accident.date, accident.time, accident.uuid, accident.number, accident.type, accident.district, accident.address,
        accident.latitude, accident.longitude, accident.deaths, accident.injured, accident.participants, accident.vehicles, accident.severity
      ].map(csvEscape).join(';'));
    });

    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dtp_dashboard_filtered.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function resetFilters() {
    state.search = '';
    state.dateFrom = minDate;
    state.dateTo = maxDate;
    Object.keys(state.filters).forEach(key => { state.filters[key] = ''; });

    el.search.value = '';
    el.dateFrom.value = minDate;
    el.dateTo.value = maxDate;
    el.filterGrid.querySelectorAll('select').forEach(select => { select.value = ''; });
    updateDashboard();
  }

  function bindEvents() {
    el.search.addEventListener('input', debounce(event => {
      state.search = normalize(event.target.value);
      updateDashboard();
    }));
    el.dateFrom.addEventListener('change', event => {
      state.dateFrom = event.target.value;
      updateDashboard();
    });
    el.dateTo.addEventListener('change', event => {
      state.dateTo = event.target.value;
      updateDashboard();
    });
    el.reset.addEventListener('click', resetFilters);
    el.exportCsv.addEventListener('click', exportDashboardCsv);
  }

  initFilters();
  bindEvents();
  initMap();
  updateDashboard();
})();
