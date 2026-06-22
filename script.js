(() => {
  const columns = window.TABLE_COLUMNS || [];
  const rows = window.TABLE_ROWS || [];

  const state = {
    page: 1,
    pageSize: 50,
    global: '',
    filters: columns.map(() => ''),
    sortCol: null,
    sortDir: 1,
    filteredIndexes: []
  };

  const el = {
    head: document.getElementById('tableHead'),
    body: document.getElementById('tableBody'),
    globalSearch: document.getElementById('globalSearch'),
    pageSize: document.getElementById('pageSize'),
    reset: document.getElementById('resetFilters'),
    exportCsv: document.getElementById('exportCsv'),
    totalRows: document.getElementById('totalRows'),
    filteredRows: document.getElementById('filteredRows'),
    pageInfo: document.getElementById('pageInfo'),
    prev: document.getElementById('prevPage'),
    next: document.getElementById('nextPage'),
    paginationText: document.getElementById('paginationText')
  };

  const formatNumber = new Intl.NumberFormat('ru-RU');
  const normalize = value => String(value ?? '').toLocaleLowerCase('ru-RU');
  const rowSearch = rows.map(row => normalize(row.join('	')));

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

  function compareValues(a, b) {
    const av = a == null ? '' : String(a).trim();
    const bv = b == null ? '' : String(b).trim();
    if (av === '' && bv !== '') return -1;
    if (av !== '' && bv === '') return 1;

    const an = Number(av.replace(',', '.'));
    const bn = Number(bv.replace(',', '.'));
    if (!Number.isNaN(an) && !Number.isNaN(bn) && av.match(/^-?\d+[,.]?\d*$/) && bv.match(/^-?\d+[,.]?\d*$/)) {
      return an - bn;
    }

    const ad = Date.parse(av);
    const bd = Date.parse(bv);
    if (!Number.isNaN(ad) && !Number.isNaN(bd) && av.match(/^\d{4}-\d{2}-\d{2}/) && bv.match(/^\d{4}-\d{2}-\d{2}/)) {
      return ad - bd;
    }

    return av.localeCompare(bv, 'ru', { numeric: true, sensitivity: 'base' });
  }

  function buildHead() {
    const headerRow = document.createElement('tr');
    const filterRow = document.createElement('tr');
    filterRow.className = 'filters';

    columns.forEach((column, index) => {
      const th = document.createElement('th');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'header-button';
      button.title = 'Сортировать столбец';
      button.innerHTML = `<span>${escapeHtml(column)}</span><span class="sort-mark" data-sort-mark="${index}"></span>`;
      button.addEventListener('click', () => {
        if (state.sortCol === index) {
          state.sortDir *= -1;
        } else {
          state.sortCol = index;
          state.sortDir = 1;
        }
        state.page = 1;
        applyFiltersAndRender();
      });
      th.appendChild(button);
      headerRow.appendChild(th);

      const fth = document.createElement('th');
      const input = document.createElement('input');
      input.className = 'column-filter';
      input.type = 'search';
      input.placeholder = 'Фильтр…';
      input.dataset.column = index;
      input.autocomplete = 'off';
      input.addEventListener('input', debounce((event) => {
        state.filters[index] = event.target.value.trim().toLocaleLowerCase('ru-RU');
        state.page = 1;
        applyFiltersAndRender();
      }));
      fth.appendChild(input);
      filterRow.appendChild(fth);
    });

    el.head.appendChild(headerRow);
    el.head.appendChild(filterRow);
  }

  function getFilteredIndexes() {
    const global = state.global;
    const activeFilters = state.filters
      .map((value, index) => ({ value, index }))
      .filter(item => item.value);

    const result = [];
    for (let i = 0; i < rows.length; i += 1) {
      if (global && !rowSearch[i].includes(global)) continue;
      let ok = true;
      for (const filter of activeFilters) {
        if (!normalize(rows[i][filter.index]).includes(filter.value)) {
          ok = false;
          break;
        }
      }
      if (ok) result.push(i);
    }

    if (state.sortCol !== null) {
      const col = state.sortCol;
      const dir = state.sortDir;
      result.sort((ia, ib) => compareValues(rows[ia][col], rows[ib][col]) * dir);
    }
    return result;
  }

  function renderSortMarks() {
    document.querySelectorAll('[data-sort-mark]').forEach(mark => {
      const index = Number(mark.dataset.sortMark);
      if (state.sortCol === index) {
        mark.textContent = state.sortDir === 1 ? '▲' : '▼';
      } else {
        mark.textContent = '↕';
      }
    });
  }

  function renderBody() {
    const total = state.filteredIndexes.length;
    const pageCount = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.page > pageCount) state.page = pageCount;

    const start = (state.page - 1) * state.pageSize;
    const visible = state.filteredIndexes.slice(start, start + state.pageSize);

    if (visible.length === 0) {
      el.body.innerHTML = `<tr class="empty-row"><td colspan="${columns.length}">По заданным фильтрам ничего не найдено</td></tr>`;
    } else {
      const html = visible.map(rowIndex => {
        const row = rows[rowIndex];
        return '<tr>' + columns.map((_, colIndex) => {
          const cell = row[colIndex] ?? '';
          const safe = escapeHtml(cell);
          return `<td title="${safe}">${safe}</td>`;
        }).join('') + '</tr>';
      }).join('');
      el.body.innerHTML = html;
    }

    const from = total === 0 ? 0 : start + 1;
    const to = Math.min(start + state.pageSize, total);

    el.totalRows.textContent = formatNumber.format(rows.length);
    el.filteredRows.textContent = formatNumber.format(total);
    el.pageInfo.textContent = `${formatNumber.format(from)}–${formatNumber.format(to)} из ${formatNumber.format(total)}`;
    el.paginationText.textContent = `Страница ${formatNumber.format(state.page)} из ${formatNumber.format(pageCount)}`;
    el.prev.disabled = state.page <= 1;
    el.next.disabled = state.page >= pageCount;
  }

  function applyFiltersAndRender() {
    state.filteredIndexes = getFilteredIndexes();
    renderSortMarks();
    renderBody();
  }

  function resetFilters() {
    state.global = '';
    state.filters = columns.map(() => '');
    state.sortCol = null;
    state.sortDir = 1;
    state.page = 1;
    el.globalSearch.value = '';
    document.querySelectorAll('.column-filter').forEach(input => { input.value = ''; });
    applyFiltersAndRender();
  }

  function exportFilteredCsv() {
    const indexes = state.filteredIndexes;
    const lines = [];
    const csvEscape = value => {
      const str = String(value ?? '');
      return `"${str.replaceAll('"', '""')}"`;
    };
    lines.push(columns.map(csvEscape).join(';'));
    indexes.forEach(rowIndex => {
      lines.push(columns.map((_, colIndex) => csvEscape(rows[rowIndex][colIndex] ?? '')).join(';'));
    });
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'filtered_table.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  el.globalSearch.addEventListener('input', debounce((event) => {
    state.global = event.target.value.trim().toLocaleLowerCase('ru-RU');
    state.page = 1;
    applyFiltersAndRender();
  }));

  el.pageSize.addEventListener('change', (event) => {
    state.pageSize = Number(event.target.value);
    state.page = 1;
    renderBody();
  });

  el.prev.addEventListener('click', () => {
    if (state.page > 1) {
      state.page -= 1;
      renderBody();
    }
  });

  el.next.addEventListener('click', () => {
    const pageCount = Math.max(1, Math.ceil(state.filteredIndexes.length / state.pageSize));
    if (state.page < pageCount) {
      state.page += 1;
      renderBody();
    }
  });

  el.reset.addEventListener('click', resetFilters);
  el.exportCsv.addEventListener('click', exportFilteredCsv);

  buildHead();
  applyFiltersAndRender();
})();
